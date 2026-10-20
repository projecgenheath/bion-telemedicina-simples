"use client";

import { useCallback, useEffect, useState } from "react";
import { lerPedidoRenovacao, type PedidoRenovacao } from "@/lib/atendimento-tipo";

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

  const pedir = useCallback(async (documentoId: string, observacaoPaciente: string): Promise<{ ok: boolean; erro?: string }> => {
    try {
      const r = await fetch("/api/renovacoes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentoId, observacaoPaciente }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; pedido?: unknown };
      if (!r.ok) return { ok: false, erro: j.erro ?? "Não foi possível enviar o pedido." };
      const p = lerPedidoRenovacao(j.pedido);
      if (p) setPedidos((atual) => [p, ...atual]);
      return { ok: true };
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
