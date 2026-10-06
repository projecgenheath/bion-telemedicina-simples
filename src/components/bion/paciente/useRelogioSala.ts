"use client";

import { useEffect, useState } from "react";
import { proximaMudancaSala } from "./entrada-sala";

/** Releitura periódica mesmo sem mudança de janela (relógio do aparelho, aba suspensa). */
const PASSO_MS = 60_000;

/**
 * "Agora" da área do paciente: avança a cada minuto e também no instante exato
 * em que a sala de alguma consulta abre ou fecha. Assim o botão "A sala abre às
 * HH:MM" vira "Entrar na sala" sozinho, sem recarregar a página.
 */
export function useRelogioSala(tss: number[]): number {
  const [agora, setAgora] = useState(() => Date.now());
  const chave = tss.join(",");
  useEffect(() => {
    const lista = chave ? chave.split(",").map(Number) : [];
    const prox = proximaMudancaSala(lista, agora);
    const espera = prox === null ? PASSO_MS : Math.min(PASSO_MS, Math.max(250, prox - agora + 50));
    const id = window.setTimeout(() => setAgora(Date.now()), espera);
    return () => window.clearTimeout(id);
  }, [chave, agora]);
  // Aba que volta do segundo plano: os timers podem ter atrasado.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setAgora(Date.now());
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);
  return agora;
}
