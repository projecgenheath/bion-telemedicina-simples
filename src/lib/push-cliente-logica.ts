/** Lógica pura do push no cliente (testável sem navegador). */
export type Plataforma = "ios_pwa" | "android" | "desktop";
export type Suporte = { ok: true; plataforma: Plataforma } | { ok: false; motivo: "sem_api" | "ios_sem_pwa" | "inseguro" };

export const DISPENSA_PREFIXO = "bion:push-aviso-dispensado";
/** Dispensa por usuário (aparelho compartilhado: um dispensar não esconde o aviso do outro). */
export const chaveDispensa = (usuarioId?: string) => (usuarioId ? `${DISPENSA_PREFIXO}:${usuarioId}` : DISPENSA_PREFIXO);
export const DISPENSA_MS = 7 * 24 * 60 * 60 * 1000;

export type Ambiente = {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean; // display-mode standalone ou navigator.standalone
  seguro: boolean;
  temSW: boolean;
  temPush: boolean;
  temNotification: boolean;
};

export function ehIOS(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && maxTouchPoints > 1; // iPadOS se apresenta como Mac
}

export function detectarSuporte(a: Ambiente): Suporte {
  if (!a.seguro) return { ok: false, motivo: "inseguro" };
  const ios = ehIOS(a.userAgent, a.maxTouchPoints);
  if (ios && !a.standalone) return { ok: false, motivo: "ios_sem_pwa" };
  if (!a.temSW || !a.temPush || !a.temNotification) return { ok: false, motivo: "sem_api" };
  if (ios) return { ok: true, plataforma: "ios_pwa" };
  return { ok: true, plataforma: /Android/i.test(a.userAgent) ? "android" : "desktop" };
}

export function papelComAviso(role: string | null | undefined): boolean {
  const r = (role ?? "").toUpperCase();
  return r === "PACIENTE" || r === "MEDICO";
}

export function dispensaRecente(valor: string | null, agora: number): boolean {
  const t = Number(valor);
  return Number.isFinite(t) && t > 0 && agora - t < DISPENSA_MS;
}

export function deveMostrarAviso(o: {
  role: string | null | undefined;
  suporte: Suporte;
  permissao: NotificationPermission | "indisponivel";
  dispensadoEm: string | null;
  agora: number;
}): boolean {
  return papelComAviso(o.role) && o.suporte.ok && o.permissao === "default" && !dispensaRecente(o.dispensadoEm, o.agora);
}

/** NEXT_PUBLIC_ primeiro; vazio → GET /api/push/inscricao ({ ativo, chavePublica }). */
export function escolherChave(envChave: string | undefined, resposta: unknown): string | null {
  const e = (envChave ?? "").trim();
  if (e) return e;
  const r = resposta as { ativo?: unknown; chavePublica?: unknown } | null;
  if (r && r.ativo === true && typeof r.chavePublica === "string" && r.chavePublica.trim()) return r.chavePublica.trim();
  return null;
}

export function base64UrlParaBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Corpo do POST /api/push/inscricao a partir de PushSubscription.toJSON(). */
export function corpoInscricao(j: { endpoint?: string; keys?: Record<string, string> }, plataforma: Plataforma) {
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, plataforma };
}

/* Ressincronização: POST só se o endpoint mudou ou a última foi há > 24 h. */
export const SYNC_PREFIXO = "bion:push-sync:";
export const SYNC_MS = 24 * 60 * 60 * 1000;
export type RegistroSync = { endpoint: string; em: number };

export const chaveSync = (usuarioId: string) => SYNC_PREFIXO + usuarioId;

export function lerRegistroSync(valor: string | null): RegistroSync | null {
  try {
    const r = JSON.parse(valor ?? "") as Partial<RegistroSync> | null;
    return r && typeof r.endpoint === "string" && typeof r.em === "number" && Number.isFinite(r.em) ? { endpoint: r.endpoint, em: r.em } : null;
  } catch {
    return null;
  }
}

export function precisaSincronizar(registro: RegistroSync | null, endpoint: string, agora: number): boolean {
  if (!registro || registro.endpoint !== endpoint) return true;
  return agora - registro.em > SYNC_MS || agora < registro.em; // relógio voltou: sincroniza
}

/** Chaves do localStorage a apagar no logout (todas as de sync). */
export function chavesSyncParaLimpar(chaves: string[]): string[] {
  return chaves.filter((k) => k.startsWith(SYNC_PREFIXO));
}

export type TipoAviso = "ativar" | "instalar" | null;
/**
 * Qual aviso mostrar. `temChave`: null = ainda buscando (não mostra nada);
 * false = servidor sem VAPID (ativo:false) → nenhum aviso.
 * iOS fora da PWA → "instalar" (orientação, sem pedir permissão).
 */
export function tipoAviso(o: {
  role: string | null | undefined;
  suporte: Suporte;
  permissao: NotificationPermission | "indisponivel";
  dispensadoEm: string | null;
  agora: number;
  temChave: boolean | null;
}): TipoAviso {
  if (o.temChave !== true || !papelComAviso(o.role) || dispensaRecente(o.dispensadoEm, o.agora)) return null;
  if (!o.suporte.ok) return o.suporte.motivo === "ios_sem_pwa" ? "instalar" : null;
  return o.permissao === "default" ? "ativar" : null;
}

/** A inscrição atual foi feita com a mesma chave VAPID? null (navegador não informa) = assume que sim. */
export function mesmaChave(atual: ArrayBuffer | Uint8Array | null | undefined, chaveB64: string): boolean {
  if (!atual) return true;
  const a = atual instanceof Uint8Array ? atual : new Uint8Array(atual);
  const b = base64UrlParaBytes(chaveB64);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
