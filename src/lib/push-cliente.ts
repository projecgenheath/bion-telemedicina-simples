"use client";
import {
  base64UrlParaBytes,
  chaveSync,
  chavesSyncParaLimpar,
  lerRegistroSync,
  mesmaChave,
  precisaSincronizar,
  corpoInscricao,
  detectarSuporte,
  escolherChave,
  type Suporte,
} from "./push-cliente-logica";

export function suportePush(): Suporte {
  if (typeof window === "undefined") return { ok: false, motivo: "sem_api" };
  const nav = navigator as Navigator & { standalone?: boolean };
  return detectarSuporte({
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
    seguro: window.isSecureContext,
    temSW: "serviceWorker" in nav,
    temPush: "PushManager" in window,
    temNotification: "Notification" in window,
  });
}

export function permissaoAtual(): NotificationPermission | "indisponivel" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "indisponivel";
}

export async function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** NEXT_PUBLIC_ ou GET /api/push/inscricao. Buscar AO MONTAR (o Safari perde o gesto se buscar no clique). */
export async function chavePublica(): Promise<string | null> {
  const env = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (env && env.trim()) return escolherChave(env, null);
  try {
    const r = await fetch("/api/push/inscricao", { cache: "no-store" });
    return escolherChave(undefined, r.ok ? await r.json() : null);
  } catch {
    return null;
  }
}

export type ResultadoAtivar = "ativado" | "negado" | "sem_suporte" | "sem_chave" | "erro";

/** Só chamar a partir de um clique (pede permissão). */
export async function ativarPush(usuarioId: string | undefined, chavePub: string): Promise<ResultadoAtivar> {
  const sup = suportePush();
  if (!sup.ok) return "sem_suporte";
  // requestPermission é a 1ª coisa assíncrona do clique (a chave já veio no mount).
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "negado";
  return inscrever(sup.plataforma, usuarioId, true, chavePub);
}

/** Renova/reenvia a inscrição quando a permissão já foi dada (sem pedir nada). */
export async function sincronizarPush(usuarioId?: string): Promise<ResultadoAtivar | null> {
  const sup = suportePush();
  if (!sup.ok || permissaoAtual() !== "granted") return null;
  return inscrever(sup.plataforma, usuarioId, false, null);
}

function lerLS(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

async function inscrever(
  plataforma: Parameters<typeof corpoInscricao>[1],
  usuarioId: string | undefined,
  forcar: boolean,
  chaveConhecida: string | null,
): Promise<ResultadoAtivar> {
  const reg = await registrarSW();
  if (!reg) return "erro";
  const chavePub = chaveConhecida ?? (await chavePublica());
  if (!chavePub) return "sem_chave";
  try {
    let sub = await reg.pushManager.getSubscription();
    if (sub && !mesmaChave(sub.options?.applicationServerKey, chavePub)) {
      // Chave VAPID trocou: a inscrição antiga não recebe mais; refaz e força o POST.
      await sub.unsubscribe().catch(() => false);
      sub = null;
      forcar = true;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaBytes(chavePub) });
    const corpo = corpoInscricao(sub.toJSON() as { endpoint?: string; keys?: Record<string, string> }, plataforma);
    if (!corpo) return "erro";
    const chave = usuarioId ? chaveSync(usuarioId) : null;
    if (!forcar && chave && !precisaSincronizar(lerRegistroSync(lerLS(chave)), corpo.endpoint, Date.now())) return "ativado";
    const r = await fetch("/api/push/inscricao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) return "erro";
    if (chave) {
      try {
        localStorage.setItem(chave, JSON.stringify({ endpoint: corpo.endpoint, em: Date.now() }));
      } catch {}
    }
    return "ativado";
  } catch {
    return "erro";
  }
}

/** Inscrição local deste aparelho (sem registrar SW novo). */
export async function inscricaoAtual(): Promise<PushSubscription | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Logout: apaga os registros de sincronização do push deste navegador. */
export function limparSyncPush(): void {
  try {
    const ks: string[] = [];
    for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i) ?? "");
    for (const k of chavesSyncParaLimpar(ks)) localStorage.removeItem(k);
  } catch {}
}

/** Fecha as notificações do toque desta consulta (tag = consultaId). */
export async function fecharNotificacoesConsulta(consultaId: string): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const ns = (await reg?.getNotifications({ tag: consultaId })) ?? [];
    for (const n of ns) n.close();
  } catch {}
}
