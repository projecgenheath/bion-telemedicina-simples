"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBion } from "@/lib/bion-store";

/* ------------------------------------------------------------------ */
/* Remarcação com multa paga pelo app (≤24 h da data de referência).   */
/* API: /api/consultas/[id]/remarcacao (PR #13 — reserva + cobrança).  */
/*   POST   { data, hora, metodo } → { remarcacao, cobranca }          */
/*          409 { usar: "remarcar" } = sem multa (usar o PATCH normal)  */
/*          409 { remarcacao } = já existe reserva aguardando pagamento */
/*   GET    → { remarcacao } (polling enquanto "pendente")              */
/*   DELETE → paciente desiste; horário liberado                       */
/* A nova data só vale depois que o servidor aprova o pagamento.       */
/* ------------------------------------------------------------------ */

export type MetodoMulta = "pix" | "cartao";
export type StatusRemarcacao = "pendente" | "aprovada" | "expirada" | "cancelada" | "falhou";

export type RemarcacaoWire = {
  id: string;
  novaData: string;
  /** Já formatado em Brasília pelo servidor. */
  novaDataTexto: string;
  multaCentavos: number;
  status: StatusRemarcacao | string;
  metodo: string;
  via: string | null;
  expiraEm: string;
  criadoEm: string;
  aprovadoEm: string | null;
};

/** Mesmo formato do pagamento da consulta, em centavos. */
export type CobrancaMulta = { id: string; valorCentavos: number; metodo: string; status: string; via: string };

export type PedidoPagamentoMulta = {
  consultaId: string;
  /** Dia YYYY-MM-DD e hora HH:MM no fuso de Brasília. */
  data: string;
  hora: string;
  metodo: MetodoMulta;
};

export type RespostaPagarMulta =
  | { tipo: "criada"; remarcacao: RemarcacaoWire; cobranca: CobrancaMulta | null }
  | { tipo: "ja_pendente"; remarcacao: RemarcacaoWire }
  | { tipo: "sem_multa" }
  | { tipo: "erro"; erro: string };

const url = (consultaId: string) => `/api/consultas/${encodeURIComponent(consultaId)}/remarcacao`;
const ERRO_REDE = "Falha de conexão com o servidor.";

async function lerJson(res: Response) {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** POST: reserva o novo horário e cria a cobrança da multa. */
export async function iniciarRemarcacaoComMulta(p: PedidoPagamentoMulta): Promise<RespostaPagarMulta> {
  try {
    const res = await fetch(url(p.consultaId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: p.data, hora: p.hora, metodo: p.metodo }),
    });
    const json = await lerJson(res);
    if (res.ok && json?.remarcacao) {
      return {
        tipo: "criada",
        remarcacao: json.remarcacao as RemarcacaoWire,
        cobranca: (json.cobranca as CobrancaMulta | undefined) ?? null,
      };
    }
    if (res.status === 409 && json?.usar === "remarcar") return { tipo: "sem_multa" };
    if (res.status === 409 && json?.remarcacao) {
      return { tipo: "ja_pendente", remarcacao: json.remarcacao as RemarcacaoWire };
    }
    return { tipo: "erro", erro: (json?.erro as string | undefined) ?? "Não foi possível iniciar o pagamento da multa." };
  } catch {
    return { tipo: "erro", erro: ERRO_REDE };
  }
}

async function consultarRemarcacao(consultaId: string): Promise<RemarcacaoWire | null | undefined> {
  try {
    const res = await fetch(url(consultaId), { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return undefined;
    const json = await lerJson(res);
    return (json?.remarcacao as RemarcacaoWire | null | undefined) ?? null;
  } catch {
    return undefined; // falha transitória: o polling tenta de novo
  }
}

/** DELETE: o paciente desiste da remarcação; a reserva é liberada. */
export async function desistirRemarcacao(consultaId: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const res = await fetch(url(consultaId), { method: "DELETE", headers: { "Content-Type": "application/json" } });
    if (res.ok) return { ok: true };
    const json = await lerJson(res);
    return { ok: false, erro: (json?.erro as string | undefined) ?? "Não foi possível desistir da remarcação." };
  } catch {
    return { ok: false, erro: ERRO_REDE };
  }
}

/** Recarrega o estado do app (padrão "estado fresco" do store) após aprovar/desistir. */
export function useRecarregarEstado() {
  const { aplicarEstadoFresco } = useBion();
  return useCallback(async () => {
    try {
      const res = await fetch("/api/bootstrap", { headers: { "Content-Type": "application/json" } });
      if (!res.ok) return false;
      return aplicarEstadoFresco(await res.json());
    } catch {
      return false;
    }
  }, [aplicarEstadoFresco]);
}

export const STATUS_TERMINAIS = ["aprovada", "expirada", "cancelada", "falhou"];
const INTERVALO_POLLING_MS = 3000;

/**
 * Acompanha a remarcação com multa de uma consulta: guarda a reserva/cobrança
 * atual e faz polling do GET a cada ~3 s enquanto "pendente". Para no
 * desmontar (folha fechada) e em status terminal. `retomar` = a consulta já
 * tem `remarcacaoPendente` vigente: busca o estado ao abrir.
 */
export function useRemarcacaoComMulta(consultaId: string, retomar: boolean) {
  const [remarcacao, setRemarcacao] = useState<RemarcacaoWire | null>(null);
  const [cobranca, setCobranca] = useState<CobrancaMulta | null>(null);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // Retomada: só adota a reserva se ainda estiver pendente (não mostra resultados antigos).
  useEffect(() => {
    if (!retomar) return;
    let vivo = true;
    void consultarRemarcacao(consultaId).then((r) => {
      if (vivo && r && r.status === "pendente") setRemarcacao(r);
    });
    return () => {
      vivo = false;
    };
  }, [consultaId, retomar]);

  const pendente = remarcacao?.status === "pendente";
  useEffect(() => {
    if (!pendente) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await consultarRemarcacao(consultaId);
      if (!vivo) return;
      if (r) {
        setRemarcacao(r);
        if (STATUS_TERMINAIS.includes(r.status)) return; // para o polling
      }
      timer = setTimeout(() => void tick(), INTERVALO_POLLING_MS);
    };
    timer = setTimeout(() => void tick(), INTERVALO_POLLING_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [consultaId, pendente]);

  const adotar = useCallback((r: RemarcacaoWire, c: CobrancaMulta | null) => {
    if (!montadoRef.current) return;
    setRemarcacao(r);
    setCobranca(c);
  }, []);

  const limpar = useCallback(() => {
    setRemarcacao(null);
    setCobranca(null);
  }, []);

  return { remarcacao, cobranca, adotar, limpar };
}
