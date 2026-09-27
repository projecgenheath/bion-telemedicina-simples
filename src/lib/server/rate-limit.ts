import "server-only";
import type { NextRequest } from "next/server";

/**
 * Rate limiting — janela fixa.
 *
 * Store:
 *  1) Upstash Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *     → compartilhado entre instâncias Vercel (recomendado em produção)
 *  2) Fallback em memória (Map) — dev/demo / single-instance
 */

type Janela = { inicio: number; contagem: number };
const janelas = new Map<string, Janela>();
const MAX_CHAVES = 20_000;

function janelaDe(chave: string, agora: number): Janela {
  let j = janelas.get(chave);
  if (!j) {
    j = { inicio: agora, contagem: 0 };
    janelas.set(chave, j);
    if (janelas.size > MAX_CHAVES) {
      for (const [k, v] of janelas) {
        if (agora - v.inicio > 3_600_000) janelas.delete(k);
      }
    }
  }
  return j;
}

export type Veredito = { permitido: boolean; restanteSeg: number };

/** Incrementa o contador da chave (memória). Preferir `limitarAsync` em rotas. */
export function limitar(chave: string, max: number, janelaMs: number): Veredito {
  const agora = Date.now();
  const j = janelaDe(chave, agora);
  if (agora - j.inicio >= janelaMs) {
    j.inicio = agora;
    j.contagem = 0;
  }
  j.contagem += 1;
  return {
    permitido: j.contagem <= max,
    restanteSeg: Math.max(1, Math.ceil((j.inicio + janelaMs - agora) / 1000)),
  };
}

/** Consulta sem incrementar — bloqueio por falhas acumuladas. */
export function consultar(chave: string, janelaMs: number): number {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || agora - j.inicio >= janelaMs) return 0;
  return j.contagem;
}

/** Zera a janela da chave (login/troca bem-sucedidos). */
export function resetar(chave: string): void {
  janelas.delete(chave);
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

/** INCR + EXPIRE (TTL = janela). Devolve contagem ou null se Redis indisponível. */
async function redisIncr(chave: string, janelaMs: number): Promise<number | null> {
  const cfg = upstashConfig();
  if (!cfg) return null;
  const ttlSec = Math.max(1, Math.ceil(janelaMs / 1000));
  const redisKey = `bion:rl:${chave}`;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(ttlSec), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: unknown }[];
    const incr = data?.[0]?.result;
    return typeof incr === "number" ? incr : null;
  } catch {
    return null;
  }
}

async function redisGet(chave: string): Promise<number | null> {
  const cfg = upstashConfig();
  if (!cfg) return null;
  const redisKey = `bion:rl:${chave}`;
  try {
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (data.result == null) return 0;
    const n = Number(data.result);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

async function redisDel(chave: string): Promise<void> {
  const cfg = upstashConfig();
  if (!cfg) return;
  const redisKey = `bion:rl:${chave}`;
  try {
    await fetch(`${cfg.url}/del/${encodeURIComponent(redisKey)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
    });
  } catch {
    /* ignora */
  }
}

/**
 * Limite com store compartilhada (Upstash) quando configurada; senão memória.
 */
export async function limitarAsync(
  chave: string,
  max: number,
  janelaMs: number,
): Promise<Veredito> {
  const contagem = await redisIncr(chave, janelaMs);
  if (contagem != null) {
    return {
      permitido: contagem <= max,
      restanteSeg: Math.max(1, Math.ceil(janelaMs / 1000)),
    };
  }
  return limitar(chave, max, janelaMs);
}

export async function consultarAsync(chave: string, janelaMs: number): Promise<number> {
  const n = await redisGet(chave);
  if (n != null) return n;
  return consultar(chave, janelaMs);
}

export async function resetarAsync(chave: string): Promise<void> {
  await redisDel(chave);
  resetar(chave);
}

export function obterIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const primeiro = fwd.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

export function validarSenhaForte(senha: string): string | null {
  if (senha.length < 10 || senha.length > 64) {
    return "A senha deve ter entre 10 e 64 caracteres.";
  }
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    return "A senha deve conter letras e números.";
  }
  return null;
}

export function resposta429(
  restanteSeg: number,
  mensagem = "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
) {
  return Response.json(
    { erro: mensagem },
    { status: 429, headers: { "Retry-After": String(Math.max(1, restanteSeg)) } },
  );
}

export const LIMITE_LOGIN_IP_POR_MIN = 150;
export const MAX_FALHAS_LOGIN = 10;
export const JANELA_FALHAS_MS = 10 * 60_000;
export const LIMITE_REGISTRO_IP_POR_HORA = 10;
export const MAX_FALHAS_SENHA = 10;
