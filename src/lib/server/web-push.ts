import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Web Push SEM dependência nova (PR 7 do plano teleconsulta-v2).        */
/*                                                                      */
/*  - VAPID (RFC 8292): JWT ES256 assinado com node:crypto              */
/*    (`Authorization: vapid t=<jwt>, k=<chave pública>`).               */
/*  - Criptografia do conteúdo (RFC 8291 + RFC 8188, aes128gcm):          */
/*    ECDH P-256 efêmero + HKDF-SHA-256 + AES-128-GCM, um registro só.   */
/*  - Sem as envs VAPID_* o push fica DESLIGADO (o toque segue só pelo    */
/*    Realtime) — nada quebra.                                           */
/* Testado contra os vetores do RFC 8291 (apêndice A) em                 */
/* scripts/teste_web_push.ts.                                            */
/* ------------------------------------------------------------------ */

export type InscricaoPush = { id?: string; endpoint: string; p256dh: string; auth: string };
export type Urgencia = "very-low" | "low" | "normal" | "high";
export type ConfigVapid = { publica: string; privada: string; subject: string };

/** Máximo de falhas seguidas (5xx, rede, 4xx que não seja 404/410) antes de apagar a inscrição. */
export const MAX_FALHAS_PUSH = 5;
/** Registro único de 4096 bytes: 86 de cabeçalho + 16 da tag + 1 do delimitador. */
export const MAX_PAYLOAD_PUSH = 4096 - 86 - 16 - 1;
export const TEMPO_LIMITE_PUSH_MS = 5_000;
const VALIDADE_JWT_S = 12 * 3600;

export const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
export const deB64url = (s: string) => Buffer.from(s.replace(/\s+/g, ""), "base64url");

function hmac(chave: Buffer, dados: Buffer): Buffer {
  return crypto.createHmac("sha256", chave).update(dados).digest();
}

/** Chave pública P-256 não comprimida (65 bytes, começa com 0x04)? */
export function chavePublicaValida(b: Buffer): boolean {
  return b.length === 65 && b[0] === 0x04;
}

/**
 * Cifra `texto` para uma inscrição (RFC 8291 §3.4 + RFC 8188, aes128gcm,
 * um registro). `salt` e `chaveServidor` (privada efêmera, 32 bytes) só são
 * passados pelo teste dos vetores; em produção são aleatórios a cada envio.
 */
export function cifrarAes128gcm(p: {
  uaPublic: Buffer;
  authSecret: Buffer;
  texto: Buffer;
  salt?: Buffer;
  chaveServidor?: Buffer;
}): { corpo: Buffer; intermediarios: Record<string, Buffer> } {
  if (!chavePublicaValida(p.uaPublic)) throw new Error("p256dh inválido");
  if (p.authSecret.length !== 16) throw new Error("auth inválido");
  if (p.texto.length > MAX_PAYLOAD_PUSH) throw new Error("payload grande demais para o push");
  const ecdh = crypto.createECDH("prime256v1");
  if (p.chaveServidor) ecdh.setPrivateKey(p.chaveServidor);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // não comprimida, 65 bytes
  const ecdhSecret = ecdh.computeSecret(p.uaPublic);
  const salt = p.salt ?? crypto.randomBytes(16);

  // Combinação das chaves (RFC 8291 §3.3)
  const prkKey = hmac(p.authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), p.uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  // Chave e nonce do conteúdo (RFC 8188 §2.2/2.3)
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const cifra = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const cifrado = Buffer.concat([cifra.update(Buffer.concat([p.texto, Buffer.from([2])])), cifra.final(), cifra.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  const cabecalho = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return {
    corpo: Buffer.concat([cabecalho, cifrado]),
    intermediarios: { ecdhSecret, prkKey, keyInfo, ikm, prk, cek, nonce, cabecalho, cifrado },
  };
}

/** Lê as envs VAPID. Inválidas ou ausentes → null (push desligado). */
export function configVapid(env: Record<string, string | undefined> = process.env): ConfigVapid | null {
  const publica = env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privada = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  if (!publica || !privada || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  try {
    if (!chavePublicaValida(deB64url(publica)) || deB64url(privada).length !== 32) return null;
  } catch {
    return null;
  }
  return { publica, privada, subject };
}

export const pushAtivo = () => configVapid() !== null;

function chavePrivadaVapid(cfg: ConfigVapid): crypto.KeyObject {
  const pub = deB64url(cfg.publica);
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: cfg.privada, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: "jwk",
  });
}

/** JWT VAPID (ES256, assinatura r||s de 64 bytes) para a origem do endpoint. */
export function jwtVapid(endpoint: string, cfg: ConfigVapid, agoraS = Math.floor(Date.now() / 1000)): string {
  const aud = new URL(endpoint).origin;
  const cab = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64url(Buffer.from(JSON.stringify({ aud, exp: agoraS + VALIDADE_JWT_S, sub: cfg.subject })));
  const assinatura = crypto.sign("sha256", Buffer.from(`${cab}.${corpo}`), {
    key: chavePrivadaVapid(cfg),
    dsaEncoding: "ieee-p1363",
  });
  return `${cab}.${corpo}.${b64url(assinatura)}`;
}

/** Monta a requisição do push (separado do envio para o teste). */
export function montarRequisicaoPush(
  inscricao: InscricaoPush,
  payload: unknown,
  opcoes: { ttl: number; urgencia?: Urgencia },
  cfg: ConfigVapid,
): { url: string; init: Omit<RequestInit, "headers" | "body"> & { headers: Record<string, string>; body: Uint8Array<ArrayBuffer> } } {
  const { corpo } = cifrarAes128gcm({
    uaPublic: deB64url(inscricao.p256dh),
    authSecret: deB64url(inscricao.auth),
    texto: Buffer.from(JSON.stringify(payload)),
  });
  const ttl = Math.max(0, Math.min(2_419_200, Math.floor(opcoes.ttl)));
  return {
    url: inscricao.endpoint,
    init: {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwtVapid(inscricao.endpoint, cfg)}, k=${cfg.publica}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttl),
        Urgency: opcoes.urgencia ?? "normal",
      },
      body: new Uint8Array(corpo),
    },
  };
}

type Fetch = (url: string, init: RequestInit) => Promise<{ status: number }>;

/**
 * Envia UM push e cuida da inscrição:
 *  - 2xx: zera `falhas` e marca `ultimoUsoEm`;
 *  - 404/410: a inscrição morreu → apaga;
 *  - outro erro (inclui rede/tempo esgotado = status 0): `falhas + 1`, e
 *    apaga quando chega a MAX_FALHAS_PUSH.
 * Devolve o status HTTP (0 = sem resposta) ou null se o push está desligado
 * (sem envs VAPID). Nunca lança. Log sem endpoint nem dados pessoais.
 */
export async function enviarPush(
  inscricao: InscricaoPush,
  payload: unknown,
  /** timeoutMs: limite do POST ao serviço de push (padrão 5 s; o job passa o que sobra do orçamento). */
  opcoes: { ttl: number; urgencia?: Urgencia; timeoutMs?: number },
  dep: { fetch?: Fetch; cfg?: ConfigVapid | null } = {},
): Promise<number | null> {
  const cfg = dep.cfg === undefined ? configVapid() : dep.cfg;
  if (!cfg) return null;
  let status = 0;
  try {
    const limite = Math.max(1, Math.floor(opcoes.timeoutMs ?? TEMPO_LIMITE_PUSH_MS));
    const { url, init } = montarRequisicaoPush(inscricao, payload, opcoes, cfg);
    // redirect: "error" — o serviço de push nunca redireciona; seguir um 3xx
    // levaria o POST (com o JWT VAPID) para um host fora da lista.
    const f: Fetch = dep.fetch ?? ((u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(limite), cache: "no-store", redirect: "error" }));
    status = (await f(url, init)).status;
  } catch (e) {
    console.error("[Push] falha no envio", { erro: e instanceof Error ? e.name : "erro" });
    status = 0;
  }
  await registrarResultado(inscricao.endpoint, status).catch((e) =>
    console.error("[Push] falha ao atualizar a inscrição", { erro: e instanceof Error ? e.name : "erro" }),
  );
  return status;
}

/** Aplica a regra de manutenção da inscrição para o status recebido. */
export async function registrarResultado(endpoint: string, status: number): Promise<"ok" | "apagada" | "falha"> {
  if (status >= 200 && status < 300) {
    await db.pushInscricao.updateMany({ where: { endpoint }, data: { falhas: 0, ultimoUsoEm: new Date() } });
    return "ok";
  }
  if (status === 404 || status === 410) {
    await db.pushInscricao.deleteMany({ where: { endpoint } });
    return "apagada";
  }
  await db.pushInscricao.updateMany({ where: { endpoint }, data: { falhas: { increment: 1 } } });
  await db.pushInscricao.deleteMany({ where: { endpoint, falhas: { gte: MAX_FALHAS_PUSH } } });
  console.warn("[Push] serviço recusou", { status });
  return "falha";
}

/**
 * Push para todos os aparelhos do usuário, em paralelo. Devolve quantos
 * aceitaram (2xx); null = push desligado. `prazo` (instante absoluto, ms):
 * o timeout de cada POST é recalculado DEPOIS de ler as inscrições
 * (min(timeoutMs, prazo − agora − 1 s)); abaixo de 500 ms não envia.
 */
export async function enviarPushParaUsuario(
  usuarioId: string,
  payload: unknown,
  opcoes: { ttl: number; urgencia?: Urgencia; timeoutMs?: number; prazo?: number },
  dep: { fetch?: Fetch; cfg?: ConfigVapid | null } = {},
): Promise<number | null> {
  const cfg = dep.cfg === undefined ? configVapid() : dep.cfg;
  if (!cfg) return null;
  const inscricoes = await db.pushInscricao.findMany({
    where: { usuarioId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
    take: 10,
  });
  let timeoutMs = opcoes.timeoutMs ?? TEMPO_LIMITE_PUSH_MS;
  if (opcoes.prazo !== undefined) {
    timeoutMs = Math.min(timeoutMs, opcoes.prazo - Date.now() - 1_000);
    if (timeoutMs < 500) {
      console.warn("[Push] pulado: sem tempo até o prazo", { aparelhos: inscricoes.length });
      return 0;
    }
  }
  const r = await Promise.allSettled(inscricoes.map((i) => enviarPush(i, payload, { ...opcoes, timeoutMs }, { ...dep, cfg })));
  return r.filter((x) => x.status === "fulfilled" && x.value !== null && x.value >= 200 && x.value < 300).length;
}

/* ---------------- Validação da inscrição (rota /api/push/inscricao) ---------------- */

/**
 * Serviços de push aceitos (o servidor faz POST no endpoint: lista fechada
 * evita usar a rota como SSRF). FCM (Chrome/Edge/Android), Mozilla, Apple
 * (Safari/iOS PWA) e Windows (WNS).
 */
const HOSTS_PUSH = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];
export const MAX_ENDPOINT = 1024;
export const PLATAFORMAS = ["ios_pwa", "android", "desktop"] as const;

export function validarInscricao(
  corpo: unknown,
): { ok: true; endpoint: string; p256dh: string; auth: string; plataforma: string | null } | { ok: false; erro: string } {
  const c = (corpo ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; plataforma?: unknown };
  const endpoint = validarEndpoint(c.endpoint);
  if (!endpoint) return { ok: false, erro: "Endpoint de push inválido." };
  const p256dh = typeof c.keys?.p256dh === "string" ? c.keys.p256dh.trim() : "";
  const auth = typeof c.keys?.auth === "string" ? c.keys.auth.trim() : "";
  if (p256dh.length > 200 || auth.length > 100 || !/^[A-Za-z0-9_-]+=*$/.test(p256dh) || !/^[A-Za-z0-9_-]+=*$/.test(auth)) {
    return { ok: false, erro: "Chaves da inscrição inválidas." };
  }
  if (!chavePublicaValida(deB64url(p256dh)) || deB64url(auth).length !== 16) {
    return { ok: false, erro: "Chaves da inscrição inválidas." };
  }
  const plataforma =
    typeof c.plataforma === "string" && (PLATAFORMAS as readonly string[]).includes(c.plataforma) ? c.plataforma : null;
  return { ok: true, endpoint, p256dh: p256dh.replace(/=+$/, ""), auth: auth.replace(/=+$/, ""), plataforma };
}

export function validarEndpoint(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_ENDPOINT) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  if (!HOSTS_PUSH.some((re) => re.test(u.hostname))) return null;
  return v;
}
