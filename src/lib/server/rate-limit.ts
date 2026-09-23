import "server-only";
import type { NextRequest } from "next/server";

/**
 * P0 (2026-09) — Rate limiting em memória (janela fixa) para as rotas de
 * autenticação: login, registro e troca de senha.
 *
 * Objetivo: fechar o último vetor de comprometimento de conta de médico/admin
 * (força bruta / credential stuffing). Falhas de senha são acumuladas por
 * IP+identidade e bloqueiam a tentativa ANTES da verificação, com Retry-After.
 *
 * Escopo: instância única (dev/demo). Em produção multi-instância, trocar a
 * store em Map por um store compartilhado (Redis/Upstash) mantendo o contrato.
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
      // Higiene: descarta janelas velhas (>= 1h) para não vazar memória.
      for (const [k, v] of janelas) {
        if (agora - v.inicio > 3_600_000) janelas.delete(k);
      }
    }
  }
  return j;
}

export type Veredito = { permitido: boolean; restanteSeg: number };

/** Incrementa o contador da chave e diz se passou do teto da janela. */
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

/** Consulta sem incrementar — usada para o bloqueio por falhas acumuladas. */
export function consultar(chave: string, janelaMs: number): number {
  const agora = Date.now();
  const j = janelas.get(chave);
  if (!j || agora - j.inicio >= janelaMs) return 0;
  return j.contagem;
}

/** Zera a janela da chave (ex.: login/troca bem-sucedidos limpam as falhas). */
export function resetar(chave: string): void {
  janelas.delete(chave);
}

/** IP do cliente atrás de proxy/gateway (Vercel, Caddy, nginx). */
export function obterIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const primeiro = fwd.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

/**
 * Política de senha (P0): mínimo 10 caracteres, com letras e números.
 * Compartilhada por registro e troca de senha. Retorna mensagem de erro ou null.
 */
export function validarSenhaForte(senha: string): string | null {
  if (senha.length < 10 || senha.length > 64) {
    return "A senha deve ter entre 10 e 64 caracteres.";
  }
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    return "A senha deve conter letras e números.";
  }
  return null;
}

/** Resposta 429 padronizada, com Retry-After em segundos. */
export function resposta429(
  restanteSeg: number,
  mensagem = "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
) {
  return Response.json(
    { erro: mensagem },
    { status: 429, headers: { "Retry-After": String(Math.max(1, restanteSeg)) } },
  );
}

/* ------------------------------------------------------------------ */
/* Política central (calibrada para não disparar nas suítes internas:  */
/* teste_hardening e teste_v4_v7_delta fazem ~1 falha por execução).   */
/* ------------------------------------------------------------------ */

/** Teto bruto por IP no login (anti-flooding; força bruta é parada pelas falhas). */
export const LIMITE_LOGIN_IP_POR_MIN = 150;
/** Falhas de senha por IP+e-mail antes do bloqueio temporário. */
export const MAX_FALHAS_LOGIN = 10;
/** Janela do bloqueio por falhas (10 min). */
export const JANELA_FALHAS_MS = 10 * 60_000;
/** Auto-cadastro por IP por hora (anti-spam de contas). */
export const LIMITE_REGISTRO_IP_POR_HORA = 10;
/** Falhas de "senha atual" na troca de senha antes do bloqueio. */
export const MAX_FALHAS_SENHA = 10;
