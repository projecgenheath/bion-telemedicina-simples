"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Reembolso MANUAL de consulta marcada como falta do paciente (PR #15).*/
/*   POST /api/consultas/[id]/reembolso { justificativa } → 201         */
/*        409: já existe pedido (inclusive negado) / prazo terminou     */
/*   GET  /api/consultas/[id]/reembolso → { reembolso | null,           */
/*        podePedirAte | null }                                         */
/* A decisão (aprovar/negar) é do admin; negado é definitivo.          */
/* ------------------------------------------------------------------ */

/** Mesmos limites do servidor (JUSTIFICATIVA_MIN/MAX em financeiro.ts), sobre o texto sem espaços nas pontas. */
export const JUSTIFICATIVA_MIN = 10;
export const JUSTIFICATIVA_MAX = 1000;

export type StatusReembolsoManual = "em_analise" | "aprovado" | "negado" | "processado" | "falhou";

export type ReembolsoManual = {
  id: string;
  status: StatusReembolsoManual | string;
  valorCentavos: number;
  justificativa: string;
  respostaAdmin: string | null;
  criadoEm: string;
  decididoEm: string | null;
};

export type RespostaPedido =
  | { ok: true; reembolso: ReembolsoManual }
  | { ok: false; status: number; erro: string };

const url = (consultaId: string) => `/api/consultas/${encodeURIComponent(consultaId)}/reembolso`;

/** Rótulo amigável do pedido manual. */
export function rotuloReembolsoManual(status: string): { texto: string; tom: "ok" | "andamento" | "erro" } {
  switch (status) {
    case "em_analise":
    case "solicitado":
      return { texto: "Em análise", tom: "andamento" };
    case "aprovado":
      return { texto: "Aprovado — o valor volta pelo mesmo meio de pagamento", tom: "ok" };
    case "processado":
      return { texto: "Processado — reembolso concluído", tom: "ok" };
    case "negado":
      return { texto: "Negado", tom: "erro" };
    case "falhou":
      return { texto: "Falhou — fale com o suporte", tom: "erro" };
    default:
      return { texto: "Em análise", tom: "andamento" };
  }
}

/** POST do pedido. Não mostra toast: quem chama decide (a folha mostra o erro na tela). */
export async function pedirReembolsoManual(consultaId: string, justificativa: string): Promise<RespostaPedido> {
  try {
    const res = await fetch(url(consultaId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ justificativa: justificativa.trim() }),
    });
    const json = (await res.json().catch(() => null)) as { reembolso?: ReembolsoManual; erro?: string } | null;
    if (res.ok && json?.reembolso) return { ok: true, reembolso: json.reembolso };
    return { ok: false, status: res.status, erro: json?.erro ?? "Não foi possível enviar o pedido de reembolso." };
  } catch {
    return { ok: false, status: 0, erro: "Falha de conexão com o servidor." };
  }
}

/** GET do pedido (detalhes: justificativa, resposta do admin, datas). `consultaId` null = não busca. */
export function useReembolsoManual(consultaId: string | null) {
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<{
    req: string;
    reembolso: ReembolsoManual | null;
    podePedirAte: string | null;
    erro: string | null;
  } | null>(null);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const req = consultaId ? `${consultaId}|${versao}` : null;

  useEffect(() => {
    if (!req || !consultaId) return;
    const ctrl = new AbortController();
    fetch(url(consultaId), { headers: { "Content-Type": "application/json" }, signal: ctrl.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as
          | { reembolso?: ReembolsoManual | null; podePedirAte?: string | null; erro?: string }
          | null;
        if (!res.ok) throw new Error(json?.erro ?? "Não foi possível carregar o pedido de reembolso.");
        setResultado({ req, reembolso: json?.reembolso ?? null, podePedirAte: json?.podePedirAte ?? null, erro: null });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const erro = e instanceof TypeError ? "Falha de conexão com o servidor." : (e as Error).message;
        setResultado({ req, reembolso: null, podePedirAte: null, erro });
      });
    return () => ctrl.abort();
  }, [req, consultaId]);

  const atual = resultado && resultado.req === req ? resultado : null;
  return {
    reembolso: atual?.reembolso ?? null,
    podePedirAte: atual?.podePedirAte ?? null,
    carregando: !!req && !atual,
    erro: atual?.erro ?? null,
    recarregar,
  };
}
