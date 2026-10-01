"use client";

import { useEffect, useMemo, useState } from "react";
import { useBion } from "@/lib/bion-store";
import {
  concluidas30d,
  ehDoMedico,
  pacientesOrdenados,
  proximaConsulta,
  resumoHoje,
  serieFaturamento,
} from "./metricas";

/** "Agora" que avança a cada `passoMs` (listas do dia, próxima consulta). */
export function useAgora(passoMs = 30_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), passoMs);
    return () => clearInterval(id);
  }, [passoMs]);
  return agora;
}

/**
 * Junta o store (somente leitura) e as métricas puras do médico.
 * Tudo deriva de dados reais do bootstrap — nenhum valor de reserva.
 */
export function useDadosMedico() {
  const { sessao, consultas, medicos, pacientes, avaliacoes, mensagens, anamneses } = useBion();
  const agora = useAgora();

  const minhas = useMemo(
    () => consultas.filter((c) => ehDoMedico(c, sessao)),
    [consultas, sessao],
  );

  /** Perfil do próprio médico (diretório só traz médicos ATIVOS: pendente = undefined). */
  const medico = useMemo(
    () => (sessao.id ? medicos.find((m) => m.id === sessao.id) : undefined),
    [medicos, sessao.id],
  );

  const proxima = useMemo(() => proximaConsulta(minhas, agora), [minhas, agora]);
  const hoje = useMemo(() => resumoHoje(minhas, agora), [minhas, agora]);
  const faturamento = useMemo(() => serieFaturamento(minhas, 30), [minhas]);
  const atendimentos30d = useMemo(() => concluidas30d(minhas, agora), [minhas, agora]);
  const listaPacientes = useMemo(() => pacientesOrdenados(minhas, pacientes, agora), [minhas, pacientes, agora]);

  const naoLidasPorPaciente = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of mensagens) {
      if (m.paraId === sessao.id && !m.lida) mapa.set(m.deId, (mapa.get(m.deId) ?? 0) + 1);
    }
    return mapa;
  }, [mensagens, sessao.id]);

  /** O bootstrap já escopa por medicoId; aqui só ordena (mais recentes primeiro). */
  const minhasAvaliacoes = useMemo(() => [...avaliacoes].sort((a, b) => b.ts - a.ts), [avaliacoes]);

  return {
    sessao,
    agora,
    medico,
    minhas,
    proxima,
    hoje,
    faturamento,
    atendimentos30d,
    listaPacientes,
    naoLidasPorPaciente,
    avaliacoes: minhasAvaliacoes,
    anamneses,
  };
}

export type DadosMedico = ReturnType<typeof useDadosMedico>;
