"use client";

import { useEffect, useState } from "react";
import { proximaMudancaSala } from "./entrada-sala";

/** Releitura periódica mesmo sem mudança de janela (relógio do aparelho, aba suspensa). */
const PASSO_MS = 60_000;

/* ------------------------------------------------------------------ */
/* B41 — calibração do relógio do aparelho com a hora do servidor.     */
/* O GET /api/telemedicina/[consultaId]/sala passa a devolver          */
/* `agoraServidor` (ISO). Quem consome essa resposta chama             */
/* registrarHoraServidor(agoraServidor); daí em diante,                */
/* agoraCalibrado() = Date.now() + offset compensa um aparelho         */
/* adiantado/atrasado nas contagens e janelas do cliente. Sem nenhum   */
/* registro, o offset é 0 e o comportamento é o de antes.              */
/* ------------------------------------------------------------------ */

let offsetServidorMs = 0;

/** Registra a hora do servidor (ISO) recebida numa resposta; ignora valor ausente/inválido. */
export function registrarHoraServidor(agoraServidor: string | null | undefined, recebidoEmMs: number = Date.now()): void {
  if (!agoraServidor) return;
  const t = Date.parse(agoraServidor);
  if (!Number.isFinite(t)) return;
  offsetServidorMs = t - recebidoEmMs;
}

/** Offset atual (ms) do relógio local em relação ao servidor. */
export function offsetRelogioServidorMs(): number {
  return offsetServidorMs;
}

/** "Agora" calibrado pela hora do servidor, quando conhecida. */
export function agoraCalibradoMs(): number {
  return Date.now() + offsetServidorMs;
}

/**
 * "Agora" da área do paciente: avança a cada minuto e também no instante exato
 * em que a sala de alguma consulta abre ou fecha. Assim o botão "A sala abre às
 * HH:MM" vira "Entrar na sala" sozinho, sem recarregar a página.
 * Usa o relógio CALIBRADO (B41) quando a hora do servidor já foi registrada.
 */
export function useRelogioSala(tss: number[]): number {
  const [agora, setAgora] = useState(() => agoraCalibradoMs());
  const chave = tss.join(",");
  useEffect(() => {
    const lista = chave ? chave.split(",").map(Number) : [];
    const prox = proximaMudancaSala(lista, agora);
    const espera = prox === null ? PASSO_MS : Math.min(PASSO_MS, Math.max(250, prox - agora + 50));
    const id = window.setTimeout(() => setAgora(agoraCalibradoMs()), espera);
    return () => window.clearTimeout(id);
  }, [chave, agora]);
  // Aba que volta do segundo plano: os timers podem ter atrasado.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setAgora(agoraCalibradoMs());
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);
  return agora;
}
