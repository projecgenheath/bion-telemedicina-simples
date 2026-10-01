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
      return { texto: "Reembolso aprovado — em processamento", tom: "andamento" };
    case "processado":
      return { texto: "Reembolso concluído", tom: "ok" };
    case "negado":
      return { texto: "Reembolso não aprovado", tom: "erro" };
    case "falhou":
      return { texto: "Falha no reembolso — fale com o suporte", tom: "erro" };
    default:
      return { texto: "Reembolso em análise", tom: "andamento" };
  }
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
    fetch(`/api/consultas/${encodeURIComponent(consultaId)}/cancelamento`, {
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((json as { erro?: string } | null)?.erro ?? "Não foi possível carregar a prévia.");
        }
        setResultado({ req, consultaId, previa: json as PreviaCancelamento, erro: null });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const erro = e instanceof TypeError ? "Falha de conexão com o servidor." : (e as Error).message;
        setResultado({ req, consultaId, previa: null, erro });
      });
    return () => ctrl.abort();
  }, [req, consultaId]);

  const atual = resultado && resultado.req === req ? resultado : null;
  // Enquanto recarrega a MESMA consulta, mantém a última prévia na tela (sem piscar).
  const previa = atual ? atual.previa : resultado?.consultaId === consultaId ? (resultado?.previa ?? null) : null;
  return {
    previa: consultaId ? previa : null,
    carregando: !!req && !atual,
    erro: atual?.erro ?? null,
    recarregar,
  };
}
