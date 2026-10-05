"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useBion, type PacienteRegistro } from "@/lib/bion-store";
import { chamarApi } from "../repasses/recurso";
import { camposAlteradosPaciente, corpoDesfazerPaciente, explicarErroPaciente } from "./pacientes";

export type Credenciais = { email: string; senhaTemporaria: string };
export type Resultado = { ok: true; credenciais?: Credenciais } | { ok: false; erro: string };

const JSON_H = { "Content-Type": "application/json" };

/**
 * Ações do admin sobre pacientes nas rotas existentes:
 * POST /api/pacientes · PATCH /api/pacientes/[id] · DELETE /api/pacientes/[id]
 * (o DELETE arquiva e anonimiza — LGPD; irreversível).
 */
export function useAcoesPaciente() {
  const { aplicarDelta } = useBion();

  const enviar = useCallback(
    async (url: string, method: string, corpo?: unknown): Promise<Resultado> => {
      const r = await chamarApi<Record<string, unknown> & { credenciais?: Credenciais }>(url, {
        method,
        headers: JSON_H,
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      if (!r.dados) return { ok: false, erro: explicarErroPaciente(r.status, r.erro) };
      const { credenciais, ...delta } = r.dados;
      aplicarDelta(delta);
      return { ok: true, credenciais };
    },
    [aplicarDelta],
  );

  const salvar = useCallback(
    async (antes: PacienteRegistro, corpo: Record<string, unknown>): Promise<Resultado> => {
      const r = await enviar(`/api/pacientes/${encodeURIComponent(antes.id)}`, "PATCH", corpo);
      if (r.ok) {
        toast.success(`${antes.nome}: ${camposAlteradosPaciente(corpo)} salvo${Object.keys(corpo).length > 1 ? "s" : ""}.`, {
          duration: 8000,
          action: {
            label: "Desfazer",
            onClick: () => {
              void enviar(`/api/pacientes/${encodeURIComponent(antes.id)}`, "PATCH", corpoDesfazerPaciente(antes, corpo)).then((d) =>
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

  const criar = useCallback((corpo: Record<string, unknown>) => enviar("/api/pacientes", "POST", corpo), [enviar]);

  /** Anonimizar/arquivar (DELETE): irreversível; o prontuário clínico fica preservado. */
  const anonimizar = useCallback(
    async (p: PacienteRegistro): Promise<Resultado> => {
      const r = await enviar(`/api/pacientes/${encodeURIComponent(p.id)}`, "DELETE");
      if (r.ok) toast.success(`Cadastro de ${p.nome} arquivado e anonimizado. O prontuário clínico ficou preservado.`);
      return r;
    },
    [enviar],
  );

  return { salvar, criar, anonimizar };
}
