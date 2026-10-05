"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useBion, type Medico } from "@/lib/bion-store";
import { chamarApi } from "../repasses/recurso";
import { agendarEnvio, desfazerEnvio } from "./adiadas";
import { camposAlterados, corpoDesfazerMedico, explicarErroMedico, statusDe } from "./medicos";

export type Credenciais = { email: string; senhaTemporaria: string };
export type Resultado = { ok: true; credenciais?: Credenciais } | { ok: false; erro: string };

const JSON_H = { "Content-Type": "application/json" };

/**
 * Ações do admin sobre médicos nas rotas existentes:
 * POST /api/medicos · PATCH /api/medicos/[id] (aprovar | suspender | atualizar) · DELETE /api/medicos/[id] (arquivar).
 * O estado local só muda com a resposta do servidor (aplicarDelta).
 */
export function useAcoesMedico() {
  const { aplicarDelta } = useBion();

  const enviar = useCallback(
    async (url: string, method: string, corpo?: unknown): Promise<Resultado> => {
      const r = await chamarApi<Record<string, unknown> & { credenciais?: Credenciais }>(url, {
        method,
        headers: JSON_H,
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      if (!r.dados) return { ok: false, erro: explicarErroMedico(r.status, r.erro) };
      const { credenciais, ...delta } = r.dados;
      aplicarDelta(delta);
      return { ok: true, credenciais };
    },
    [aplicarDelta],
  );

  /**
   * Aprovar (em validação) ou reativar (suspenso): reversível. O PATCH só sai
   * depois de 5 s; "Desfazer" nesse tempo cancela sem enviar nada.
   */
  const aprovarComDesfazer = useCallback(
    (m: Medico, tipo: "aprovar" | "reativar") => {
      const chave = `medico:${m.id}`;
      const verbo = tipo === "aprovar" ? "aprovado" : "reativado";
      agendarEnvio(
        chave,
        `/api/medicos/${encodeURIComponent(m.id)}`,
        { method: "PATCH", headers: JSON_H, body: JSON.stringify({ acao: "aprovar" }) },
        async (r) => {
          const j = (await r?.json().catch(() => null)) as (Record<string, unknown> & { erro?: string }) | null;
          if (r?.ok && j) {
            aplicarDelta(j);
            toast.success(`${m.nome}: ${verbo}. O médico foi avisado pelo app.`);
          } else {
            toast.error(`Não deu para ${tipo === "aprovar" ? "aprovar" : "reativar"} ${m.nome}: ${explicarErroMedico(r?.status ?? 0, j?.erro)}`);
          }
        },
      );
      toast(tipo === "aprovar" ? `Aprovando ${m.nome}…` : `Reativando ${m.nome}…`, {
        id: chave,
        description: "Nada foi enviado ainda: dá para desfazer nos próximos 5 segundos.",
        duration: 5000,
        action: {
          label: "Desfazer",
          onClick: () => {
            if (desfazerEnvio(chave)) toast.info(`Desfeito: ${m.nome} continua ${tipo === "aprovar" ? "em validação" : "suspenso"}.`);
          },
        },
      });
    },
    [aplicarDelta],
  );

  /** "Desfazer" fora do aviso (botão no card ou na linha): cancela o envio e fecha o aviso. */
  const desfazerAprovacao = useCallback((m: Medico) => {
    const chave = `medico:${m.id}`;
    if (!desfazerEnvio(chave)) return;
    toast.dismiss(chave);
    toast.info(`Desfeito: ${m.nome} continua ${statusDe(m) === "suspenso" ? "suspenso" : "em validação"}.`);
  }, []);

  /** Suspender: só depois da confirmação (encerra as sessões do médico). */
  const suspender = useCallback(
    async (m: Medico): Promise<Resultado> => {
      const r = await enviar(`/api/medicos/${encodeURIComponent(m.id)}`, "PATCH", { acao: "suspender" });
      if (r.ok) toast.success(`${m.nome} foi suspenso. As sessões abertas dele foram encerradas.`);
      return r;
    },
    [enviar],
  );

  /** Arquivar (DELETE): sem login, fora das listas ativas; histórico e prontuário preservados. */
  const arquivar = useCallback(
    async (m: Medico): Promise<Resultado> => {
      const r = await enviar(`/api/medicos/${encodeURIComponent(m.id)}`, "DELETE");
      if (r.ok) toast.success(`${m.nome} foi arquivado. Consultas, prontuários e documentos ficaram preservados.`);
      return r;
    },
    [enviar],
  );

  /** Edição reversível: aviso com "Desfazer" (manda de volta os valores de antes). */
  const salvar = useCallback(
    async (antes: Medico, corpo: Record<string, unknown>): Promise<Resultado> => {
      const r = await enviar(`/api/medicos/${encodeURIComponent(antes.id)}`, "PATCH", corpo);
      if (r.ok) {
        toast.success(`${antes.nome}: ${camposAlterados(corpo)} salvo${Object.keys(corpo).length > 2 ? "s" : ""}.`, {
          duration: 8000,
          action: {
            label: "Desfazer",
            onClick: () => {
              void enviar(`/api/medicos/${encodeURIComponent(antes.id)}`, "PATCH", corpoDesfazerMedico(antes, corpo)).then((d) =>
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

  /** Cadastro: devolve as credenciais temporárias (mostradas uma única vez). */
  const criar = useCallback((corpo: Record<string, unknown>) => enviar("/api/medicos", "POST", corpo), [enviar]);

  return { aprovarComDesfazer, desfazerAprovacao, suspender, arquivar, salvar, criar };
}
