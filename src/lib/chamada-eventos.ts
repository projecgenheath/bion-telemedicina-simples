"use client";

import type { EventoChamada } from "@/lib/chamada-recebida-logica";

/**
 * Ponte entre o canal de notificações do store (bion-store.tsx, que já
 * assina `notificacoes:user:<id>:<hmac>`) e a tela de chamada recebida.
 * Fica no mesmo canal de propósito: o supabase-js devolve o MESMO objeto de
 * canal para o mesmo tópico, então uma segunda assinatura brigaria com a do
 * store (subscribe duplo, removeChannel derrubando os dois).
 */
type Ouvinte = (e: EventoChamada) => void;
const ouvintes = new Set<Ouvinte>();

export function emitirEventoChamada(e: EventoChamada): void {
  for (const o of ouvintes) {
    try {
      o(e);
    } catch (erro) {
      console.warn("[chamada] ouvinte falhou", erro);
    }
  }
}

export function ouvirEventosChamada(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
}
