"use client";
import { mensagemRecusa } from "@/lib/aceite-termos";

import { useCallback, useEffect, useState } from "react";
import { lerPedidoRenovacao, type PedidoRenovacao } from "@/lib/atendimento-tipo";

/** Cobrança criada junto com o pedido (resposta do POST /api/renovacoes).
 *  `status: "pendente"` = aguardando o pagamento com cartão; só depois dele
 *  o pedido entra na fila do médico. */
export type CobrancaRenovacao = {
  pagamentoId: string;
  valorCentavos: number;
  status: "pendente" | "confirmado";
  pagarComCartao: boolean;
};

function lerCobrancaRenovacao(v: unknown): CobrancaRenovacao | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.pagamentoId !== "string" || typeof r.valorCentavos !== "number") return undefined;
  return {
    pagamentoId: r.pagamentoId,
    valorCentavos: r.valorCentavos,
    status: r.status === "confirmado" ? "confirmado" : "pendente",
    pagarComCartao: r.pagarComCartao === true,
  };
}

/**
 * Pedidos de renovação do paciente (GET/POST /api/renovacoes).
 * `disponivel` só vira true quando o GET responde ok; se a rota falhar, a
 * tela esconde o botão "Renovar receita".
 */
export function usePedidosRenovacao(ativo = true) {
  const [disponivel, setDisponivel] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoRenovacao[]>([]);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    fetch("/api/renovacoes", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { disponivel?: boolean; pedidos?: unknown[] } | null) => {
        if (!vivo || !j) return;
        setDisponivel(Boolean(j.disponivel));
        setPedidos((j.pedidos ?? []).map(lerPedidoRenovacao).filter((p): p is PedidoRenovacao => p !== null));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ativo, versao]);

  const pedir = useCallback(async (documentoId: string, observacaoPaciente: string): Promise<{ ok: boolean; erro?: string; cobranca?: CobrancaRenovacao }> => {
    try {
      const r = await fetch("/api/renovacoes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentoId, observacaoPaciente }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; codigo?: string; pedido?: unknown; cobranca?: unknown };
      if (!r.ok) return { ok: false, erro: mensagemRecusa(j, "Não foi possível enviar o pedido.") };
      const p = lerPedidoRenovacao(j.pedido);
      if (p) setPedidos((atual) => [p, ...atual]);
      return { ok: true, cobranca: lerCobrancaRenovacao(j.cobranca) };
    } catch {
      return { ok: false, erro: "Sem conexão. Tente de novo." };
    }
  }, []);

  const cancelar = useCallback(async (id: string): Promise<{ ok: boolean; erro?: string }> => {
    try {
      const r = await fetch(`/api/renovacoes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "cancelar" }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; pedido?: unknown };
      if (!r.ok) {
        if (r.status === 409) setVersao((v) => v + 1); // o médico respondeu antes: recarrega o status
        return { ok: false, erro: j.erro ?? "Não foi possível cancelar." };
      }
      const p = lerPedidoRenovacao(j.pedido);
      if (p) setPedidos((atual) => atual.map((x) => (x.id === p.id ? p : x)));
      return { ok: true };
    } catch {
      return { ok: false, erro: "Sem conexão. Tente de novo." };
    }
  }, []);

  return { disponivel, pedidos, pedir, cancelar, recarregar: () => setVersao((v) => v + 1) };
}
