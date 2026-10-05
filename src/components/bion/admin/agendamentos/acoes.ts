"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useBion, type Consulta } from "@/lib/bion-store";
import { chamarApi } from "../repasses/recurso";
import { corpoDesfazer, explicarErro } from "./agenda";

export type Resultado = { ok: true } | { ok: false; erro: string };

/**
 * Ações do admin sobre uma consulta, direto na rota existente
 * PATCH /api/consultas/[id] (contrato delta). O estado local só muda com a
 * resposta do servidor (aplicarDelta) e o aviso aparece DEPOIS dela.
 */
export function useAcoesConsulta() {
  const { aplicarDelta } = useBion();

  const enviar = useCallback(
    async (id: string, corpo: Record<string, unknown>): Promise<Resultado> => {
      const r = await chamarApi<unknown>(`/api/consultas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (r.dados) {
        aplicarDelta(r.dados);
        return { ok: true };
      }
      return { ok: false, erro: explicarErro(r.status, r.erro) };
    },
    [aplicarDelta],
  );

  /** Edição reversível: aviso com "Desfazer" (volta data, hora e médico de antes). */
  const editar = useCallback(
    async (antes: Consulta, corpo: Record<string, unknown>, resumo: string): Promise<Resultado> => {
      const r = await enviar(antes.id, corpo);
      if (r.ok) {
        toast.success(resumo, {
          duration: 8000,
          action: {
            label: "Desfazer",
            onClick: () => {
              void enviar(antes.id, corpoDesfazer(antes)).then((d) =>
                d.ok ? toast.success("Alteração desfeita.") : toast.error(`Não deu para desfazer: ${d.erro}`),
              );
            },
          },
        });
      }
      return r;
    },
    [enviar],
  );

  /** Cancelamento (irreversível; sem "Desfazer"). */
  const cancelar = useCallback(
    async (c: Consulta, motivo: string): Promise<Resultado> => {
      const r = await enviar(c.id, { acao: "cancelar", motivo: motivo.trim() || "Cancelado pela administração" });
      if (r.ok) toast.success(c.pago ? "Consulta cancelada. O reembolso integral foi registrado." : "Consulta cancelada.");
      return r;
    },
    [enviar],
  );

  return { editar, cancelar };
}
