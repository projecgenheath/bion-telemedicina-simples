"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { chamarApi, useRecurso } from "../repasses/recurso";
import { CardAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { IdCopiavel } from "../ui/IdCopiavel";
import { ROTULO_PENDENCIA, diasPendencia, tomPendencia, type RespostaPendenciasLgpd } from "./lgpd";

/**
 * Pendências LGPD que ficaram depois de uma anonimização (remoção do login no
 * Supabase Auth, objetos do Storage, desbloqueio do login), lidas da
 * auditoria (GET /api/admin/lgpd/pendencias). O cron diário (04:00 SP) tenta
 * de novo; "Reprocessar agora" faz o mesmo na hora (POST, só ADMIN).
 * Prazo LGPD de 15 dias: a partir de 10 a linha fica crítica.
 */
export function PendenciasLgpd() {
  const r = useRecurso<RespostaPendenciasLgpd>("/api/admin/lgpd/pendencias");
  const [rodando, setRodando] = useState(false);
  const lista = r.dados?.pendencias ?? [];

  const reprocessar = async () => {
    setRodando(true);
    const resp = await chamarApi<RespostaPendenciasLgpd>("/api/admin/lgpd/pendencias", { method: "POST" });
    setRodando(false);
    if (resp.erro) {
      toast.error(resp.erro);
      return;
    }
    const restantes = resp.dados?.pendencias?.length ?? 0;
    toast.success(restantes ? `Reprocessado. Ainda ${restantes === 1 ? "resta 1 pendência" : `restam ${restantes} pendências`}.` : "Reprocessado. Nenhuma pendência aberta.");
    r.recarregar();
  };

  return (
    <CardAdmin
      titulo="Pendências LGPD"
      icone={AlertTriangle}
      tom={lista.some((p) => p.dias >= 10) ? "critico" : lista.length ? "atencao" : undefined}
      acao={
        <button type="button" className="ba-botao" onClick={reprocessar} disabled={rodando} aria-busy={rodando}>
          <RefreshCw className={`w-4 h-4 ${rodando ? "animate-spin" : ""}`} aria-hidden />
          <span>{rodando ? "Reprocessando…" : "Reprocessar agora"}</span>
        </button>
      }
    >
      {r.carregando && !r.dados ? (
        <Esqueleto variante="lista" quantidade={2} rotulo="Carregando pendências" />
      ) : r.erro && !r.dados ? (
        <EstadoErro mensagem={r.erro} onTentar={r.recarregar} />
      ) : lista.length === 0 ? (
        <EstadoVazio titulo="Nenhuma pendência aberta" texto="Remoções do login, do Storage e desbloqueios estão em dia." />
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{ROTULO_PENDENCIA[p.tipo]}</p>
                <p className="text-xs opacity-70">
                  {p.entidade === "medico" ? "Médico" : "Paciente"} {p.entidadeId ? <IdCopiavel id={p.entidadeId} /> : null}
                </p>
              </div>
              <ChipEstado tom={tomPendencia(p.dias)}>{`Aberta ${diasPendencia(p.dias)}`}</ChipEstado>
            </li>
          ))}
        </ul>
      )}
    </CardAdmin>
  );
}
