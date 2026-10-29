"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApptStatus } from "@/lib/bion-tipos";

/* ------------------------------------------------------------------ */
/* Prévia de cancelamento/remarcação (GET /api/consultas/[id]/         */
/* cancelamento). O servidor calcula a multa com a MESMA função que    */
/* grava no PATCH — a tela só exibe, nunca recalcula.                  */
/* ------------------------------------------------------------------ */

export type PreviaAcao = {
  multaCentavos: number;
  reembolsoCentavos: number;
  valorCentavos: number;
  pago: boolean;
  dataOriginal: string;
  semMultaAte: string;
  /** Já formatado em horário de Brasília pelo servidor. */
  semMultaAteTexto: string;
  isencao: null | "nao_e_paciente" | "aguardando_reagendamento" | "fora_da_janela";
};

export type StatusReembolso = "solicitado" | "aprovado" | "processado" | "negado" | "falhou";

export type ReembolsoResumo = {
  status: StatusReembolso | string;
  valorCentavos: number;
  multaCentavos: number;
  criadoEm: string;
  processadoEm: string | null;
};

export type PreviaCancelamento = {
  regra: { multaPct: number; janelaHoras: number };
  status: ApptStatus;
  podeCancelar: boolean;
  podeRemarcar: boolean;
  cancelar: PreviaAcao;
  remarcar: PreviaAcao;
  reembolso: ReembolsoResumo | null;
};

/** Centavos → "R$ 1.234,56" (pt-BR). */
export const fmtCentavos = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Rótulo amigável do status do reembolso. */
export function rotuloReembolso(status: string): { texto: string; tom: "ok" | "andamento" | "erro" } {
  switch (status) {
    case "solicitado":
      return { texto: "Reembolso solicitado", tom: "andamento" };
    case "aprovado":
      return { texto: "Reembolso aprovado — integral", tom: "andamento" };
    case "processado":
      return { texto: "Reembolso concluído", tom: "ok" };
    case "negado":
      return { texto: "Reembolso não aprovado", tom: "erro" };
    case "falhou":
      return { texto: "Falha no reembolso — fale com o suporte", tom: "erro" };
    case "em_analise":
      // Pedidos antigos, do fluxo com análise, ainda fechados pelo admin.
      return { texto: "Reembolso em análise", tom: "andamento" };
    default:
      return { texto: "Reembolso pedido", tom: "andamento" };
  }
}

/** Uma busca da prévia, sem cache — usada pelo hook e pela reconfirmação. */
async function executarBuscaPrevia(consultaId: string, signal?: AbortSignal): Promise<PreviaCancelamento> {
  let res: Response;
  try {
    res = await fetch(`/api/consultas/${encodeURIComponent(consultaId)}/cancelamento`, {
      headers: { "Content-Type": "application/json" },
      signal,
    });
  } catch (e) {
    if (e instanceof TypeError) throw new Error("Falha de conexão com o servidor.");
    throw e;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((json as { erro?: string } | null)?.erro ?? "Não foi possível carregar a prévia.");
  }
  return json as PreviaCancelamento;
}

/**
 * Busca a prévia AGORA (ignora qualquer estado em tela). Quem confirma uma
 * ação irreversível (cancelar) usa isto para garantir que os valores
 * exibidos ainda são os que o servidor vai aplicar.
 */
export function buscarPreviaCancelamento(consultaId: string): Promise<PreviaCancelamento> {
  return executarBuscaPrevia(consultaId);
}

/**
 * A prévia fresca muda o que o paciente viu para a ação de cancelar
 * (também usada por "reembolso")? Compara permissão, status e todos os
 * campos de `cancelar` que aparecem na tela ou decidem o desfecho.
 */
export function previaCancelamentoMudou(exibida: PreviaCancelamento, fresca: PreviaCancelamento): boolean {
  const a = exibida.cancelar;
  const b = fresca.cancelar;
  return (
    exibida.podeCancelar !== fresca.podeCancelar ||
    exibida.status !== fresca.status ||
    a.multaCentavos !== b.multaCentavos ||
    a.reembolsoCentavos !== b.reembolsoCentavos ||
    a.valorCentavos !== b.valorCentavos ||
    a.pago !== b.pago ||
    a.dataOriginal !== b.dataOriginal ||
    a.semMultaAte !== b.semMultaAte ||
    a.isencao !== b.isencao
  );
}

/**
 * Busca a prévia da consulta `consultaId` (null = não busca).
 * `chave` extra força nova busca quando muda (ex.: status da consulta).
 */
export function usePreviaCancelamento(consultaId: string | null | undefined, chave?: string) {
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<{
    req: string;
    consultaId: string;
    previa: PreviaCancelamento | null;
    erro: string | null;
  } | null>(null);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  /** Identifica a requisição atual; o estado só é gravado no callback do fetch. */
  const req = consultaId ? `${consultaId}|${chave ?? ""}|${versao}` : null;

  useEffect(() => {
    if (!req || !consultaId) return;
    const ctrl = new AbortController();
    executarBuscaPrevia(consultaId, ctrl.signal)
      .then((novaPrevia) => {
        setResultado({ req, consultaId, previa: novaPrevia, erro: null });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const erro = e instanceof Error ? e.message : "Não foi possível carregar a prévia.";
        setResultado({ req, consultaId, previa: null, erro });
      });
    return () => ctrl.abort();
  }, [req, consultaId]);

  /**
   * Substitui a prévia em tela por uma recém-buscada (ex.: a reconfirmação
   * do cancelamento detectou valores novos e a folha passa a mostrá-los).
   */
  const adotarPrevia = useCallback(
    (nova: PreviaCancelamento) => {
      if (!consultaId || !req) return;
      setResultado({ req, consultaId, previa: nova, erro: null });
    },
    [consultaId, req],
  );

  const atual = resultado && resultado.req === req ? resultado : null;
  // Enquanto recarrega a MESMA consulta, mantém a última prévia na tela (sem piscar).
  const previa = atual ? atual.previa : resultado?.consultaId === consultaId ? (resultado?.previa ?? null) : null;
  return {
    previa: consultaId ? previa : null,
    carregando: !!req && !atual,
    erro: atual?.erro ?? null,
    recarregar,
    adotarPrevia,
  };
}
