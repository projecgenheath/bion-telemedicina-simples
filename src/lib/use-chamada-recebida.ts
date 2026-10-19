"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { ouvirEventosChamada } from "@/lib/chamada-eventos";
import {
  ESTADO_CHAMADA_INICIAL,
  consultaAbertaNaUrl,
  consultaEncerrada,
  reduzirChamada,
  type ChamadaTocando,
} from "@/lib/chamada-recebida-logica";

/**
 * Chamada recebida com o app aberto (tele v2, fase 2).
 *
 * Ouve os 4 eventos (chamada_tocando / _atendida / _recusada / _expirada) que
 * o store repassa do canal privado de notificações (chamada-eventos.ts) e
 * devolve a chamada que está tocando agora, ou null.
 *  - Dedupe por consultaId:tentativa (o mesmo toque não volta depois de fechado).
 *  - Ignora toque já expirado e toque da consulta que já está aberta em /consulta.
 *  - Fecha sozinho no expiraEm LOCAL (não espera o chamada_expirada) e quando
 *    chega atendida/recusada/expirada da mesma tentativa (ex.: atendeu em outro aparelho).
 *  - Fim de vez (não toca mais nesta consulta): `ultima: true`, qualquer
 *    expiração depois de 15 min do início (horário da consulta do store ou,
 *    sem ele, o 1º toque), ou a consulta virar cancelada/concluída no store.
 *
 * `ativo = false` (admin, ou sem sessão) não ouve nada.
 */
export type ConsultaParaToque = { id: string; status: string; dataISO?: string };

export function useChamadaRecebida(
  ativo: boolean,
  consultas: readonly ConsultaParaToque[] = [],
): {
  chamada: ChamadaTocando | null;
  fechar: () => void;
} {
  const [estado, despachar] = useReducer(reduzirChamada, ESTADO_CHAMADA_INICIAL);
  const consultasRef = useRef(consultas);
  useEffect(() => {
    consultasRef.current = consultas;
  }, [consultas]);

  useEffect(() => {
    if (!ativo) return;
    return ouvirEventosChamada((evento) => {
      const aberta =
        typeof window === "undefined" ? null : consultaAbertaNaUrl(window.location.pathname, window.location.search);
      const c = consultasRef.current.find((x) => x.id === evento.consultaId);
      if (c && consultaEncerrada(c.status)) {
        despachar({ tipo: "consulta_encerrada", consultaId: evento.consultaId });
        return;
      }
      const inicio = c?.dataISO ? Date.parse(c.dataISO) : NaN;
      despachar({
        tipo: "evento",
        evento,
        agora: Date.now(),
        consultaAberta: aberta,
        inicioConsulta: Number.isFinite(inicio) ? inicio : null,
      });
    });
  }, [ativo]);

  const atual = estado.atual;
  // expiraEm LOCAL: para o toque sem esperar o chamada_expirada do servidor.
  useEffect(() => {
    if (!atual) return;
    const t = window.setTimeout(
      () => despachar({ tipo: "expirou", consultaId: atual.consultaId, tentativa: atual.tentativa, agora: Date.now() }),
      Math.max(0, atual.expiraEm - Date.now()),
    );
    return () => window.clearTimeout(t);
  }, [atual]);

  // Consulta virou cancelada/concluída (store atualizado por realtime/refresh): para na hora.
  const statusAtual = atual ? consultas.find((x) => x.id === atual.consultaId)?.status : undefined;
  const idAtual = atual?.consultaId;
  useEffect(() => {
    if (idAtual && consultaEncerrada(statusAtual)) despachar({ tipo: "consulta_encerrada", consultaId: idAtual });
  }, [idAtual, statusAtual]);

  const fechar = useCallback(() => despachar({ tipo: "fechar" }), []);
  return { chamada: ativo ? atual : null, fechar };
}
