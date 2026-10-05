"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useBion } from "@/lib/bion-store";
import { montarFila, type ItemFila, type ReembolsosResposta, type RepassesResposta } from "./metricas";

/**
 * Dados reais do admin que NÃO vêm no bootstrap: repasses a pagar e
 * reembolsos em análise (rotas existentes, só ADMIN). O resto (consultas,
 * médicos, pacientes, chamados, auditoria) vem do store, que já é real.
 * Erro de uma rota não derruba a outra: cada bloco mostra o próprio estado.
 */
type Fonte<T> = { dados: T | null; erro: string | null; carregando: boolean };
type DadosAdmin = {
  agora: number;
  repasses: Fonte<RepassesResposta>;
  reembolsos: Fonte<ReembolsosResposta>;
  fila: ItemFila[];
  /** Fila completa só depois das duas rotas responderem (com ou sem erro). */
  filaPronta: boolean;
  atualizando: boolean;
  atualizar: () => Promise<void>;
};

const Ctx = createContext<DadosAdmin | null>(null);

async function lerJson<T>(url: string): Promise<{ dados: T | null; erro: string | null }> {
  try {
    const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const j = (await r.json().catch(() => null)) as (T & { erro?: string }) | null;
    if (!r.ok) return { dados: null, erro: j?.erro || `O servidor respondeu ${r.status}.` };
    return { dados: j as T, erro: null };
  } catch {
    return { dados: null, erro: "Sem conexão com o servidor." };
  }
}

/* Relógio de minuto (sem setState em efeito): "agora" para "hoje", "há X min"… */
function assinarMinuto(cb: () => void) {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
}
const minutoAtual = () => Math.floor(Date.now() / 60_000) * 60_000;

export function ProvedorDadosAdmin({ children }: { children: ReactNode }) {
  const { medicos, tickets, auditLogs, aplicarEstadoFresco } = useBion();
  const agora = useSyncExternalStore(assinarMinuto, minutoAtual, minutoAtual);
  const [repasses, setRepasses] = useState<Fonte<RepassesResposta>>({ dados: null, erro: null, carregando: true });
  const [reembolsos, setReembolsos] = useState<Fonte<ReembolsosResposta>>({ dados: null, erro: null, carregando: true });
  const [atualizando, setAtualizando] = useState(false);

  const buscarRotas = useCallback(async () => {
    const [rp, rb] = await Promise.all([
      lerJson<RepassesResposta>("/api/admin/repasses?status=fechado"),
      lerJson<ReembolsosResposta>("/api/admin/reembolsos?status=em_analise"),
    ]);
    setRepasses({ ...rp, carregando: false });
    setReembolsos({ ...rb, carregando: false });
  }, []);

  useEffect(() => {
    void buscarRotas();
  }, [buscarRotas]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    try {
      const boot = await lerJson<unknown>("/api/bootstrap");
      if (boot.dados) aplicarEstadoFresco(boot.dados);
      await buscarRotas();
    } finally {
      setAtualizando(false);
    }
  }, [aplicarEstadoFresco, buscarRotas]);

  const fila = useMemo(
    () =>
      montarFila(
        {
          medicos,
          tickets,
          auditLogs,
          repasses: repasses.dados?.repasses ?? null,
          reembolsos: reembolsos.dados?.reembolsos ?? null,
        },
        agora,
      ),
    [medicos, tickets, auditLogs, repasses.dados, reembolsos.dados, agora],
  );

  const valor = useMemo<DadosAdmin>(
    () => ({
      agora,
      repasses,
      reembolsos,
      fila,
      filaPronta: !repasses.carregando && !reembolsos.carregando,
      atualizando,
      atualizar,
    }),
    [agora, repasses, reembolsos, fila, atualizando, atualizar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDadosAdmin(): DadosAdmin {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDadosAdmin fora do ProvedorDadosAdmin");
  return v;
}
