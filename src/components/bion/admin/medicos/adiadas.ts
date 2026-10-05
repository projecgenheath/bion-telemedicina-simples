"use client";

import { useSyncExternalStore } from "react";

/**
 * Ações reversíveis com "Desfazer" de verdade: o pedido só vai ao servidor
 * depois da janela (5 s). Desfazer dentro dela = nada é enviado (o médico
 * não recebe aviso nenhum). Se a página for fechada antes, o pedido segue
 * com `keepalive` para não se perder.
 */
type Pendente = {
  chave: string;
  url: string;
  init: RequestInit;
  timer: ReturnType<typeof setTimeout>;
  aoEnviar: (r: Response | null) => void;
};

const pendentes = new Map<string, Pendente>();
const ouvintes = new Set<() => void>();
let instantaneo: ReadonlySet<string> = new Set();

function avisar() {
  instantaneo = new Set(pendentes.keys());
  for (const o of ouvintes) o();
}

async function enviar(p: Pendente, keepalive = false) {
  pendentes.delete(p.chave);
  avisar();
  let r: Response | null = null;
  try {
    r = await fetch(p.url, { credentials: "same-origin", cache: "no-store", ...p.init, keepalive });
  } catch {
    r = null;
  }
  if (!keepalive) p.aoEnviar(r);
}

export const JANELA_DESFAZER_MS = 5000;

/** Agenda o envio. Uma chave por vez: agendar de novo a mesma chave substitui a anterior. */
export function agendarEnvio(chave: string, url: string, init: RequestInit, aoEnviar: (r: Response | null) => void, ms = JANELA_DESFAZER_MS) {
  const antiga = pendentes.get(chave);
  if (antiga) clearTimeout(antiga.timer);
  const p: Pendente = { chave, url, init, aoEnviar, timer: setTimeout(() => void enviar(p), ms) };
  pendentes.set(chave, p);
  avisar();
}

/** Desfaz antes do envio. Devolve false se já tinha sido enviado. */
export function desfazerEnvio(chave: string): boolean {
  const p = pendentes.get(chave);
  if (!p) return false;
  clearTimeout(p.timer);
  pendentes.delete(chave);
  avisar();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const p of [...pendentes.values()]) {
      clearTimeout(p.timer);
      void enviar(p, true);
    }
  });
}

function assinar(cb: () => void) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}
const vazio: ReadonlySet<string> = new Set();

/** Chaves aguardando a janela de "Desfazer" (para mostrar "Aprovando…" no card). */
export function useEnviosPendentes(): ReadonlySet<string> {
  return useSyncExternalStore(
    assinar,
    () => instantaneo,
    () => vazio,
  );
}
