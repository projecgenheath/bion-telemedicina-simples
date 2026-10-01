"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBion } from "@/lib/bion-store";
import { diaFusoClinica, instanteFusoClinica } from "@/lib/bion-tipos";
import {
  concluidas30d,
  contarAcoesPacienteHoje,
  ehDoMedico,
  pacientesOrdenados,
  pontosReceita,
  proximaConsulta,
  resumoHoje,
  type EventoMedico,
  type RespostaReceita,
} from "./metricas";

/** Evento de janela: algo mudou na agenda do médico (ex.: "Cancelar agenda do dia"). */
export const EVENTO_DADOS_MEDICO = "bion-medico:dados-alterados";
export function avisarDadosMedicoAlterados() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_DADOS_MEDICO));
}

export type Recurso<T> = { dados: T | null; carregando: boolean; erro: string | null; recarregar: () => void };

/**
 * GET JSON somente leitura com estados de carregamento/erro. Recarrega quando
 * `url` muda, quando `versao` muda e no EVENTO_DADOS_MEDICO. Mantém o último
 * dado bom durante a recarga (o card não "pisca").
 */
function useRecurso<T>(url: string | null, versao: string): Recurso<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState(0);
  /** Chave do último pedido que terminou (com sucesso ou erro). */
  const [resolvida, setResolvida] = useState<string | null>(null);
  const recarregar = useCallback(() => setPedido((n) => n + 1), []);
  const chave = url ? `${url}#${versao}#${pedido}` : null;
  const carregando = chave !== null && resolvida !== chave;

  useEffect(() => {
    window.addEventListener(EVENTO_DADOS_MEDICO, recarregar);
    return () => window.removeEventListener(EVENTO_DADOS_MEDICO, recarregar);
  }, [recarregar]);

  useEffect(() => {
    if (!url || !chave) return;
    const ctrl = new AbortController();
    fetch(url, { headers: { "Content-Type": "application/json" }, signal: ctrl.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as (T & { erro?: string }) | null;
        if (ctrl.signal.aborted) return;
        if (!res.ok || !json) {
          setErro(json?.erro ?? "Não foi possível carregar agora.");
        } else {
          setDados(json);
          setErro(null);
        }
        setResolvida(chave);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") return;
        setErro("Falha de conexão com o servidor.");
        setResolvida(chave);
      });
    return () => ctrl.abort();
  }, [url, chave]);

  return { dados, carregando, erro, recarregar };
}

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
  /** Muda quando alguma consulta do médico muda (status/data/reserva): recarrega eventos e receita. */
  const versaoAgenda = useMemo(
    () =>
      minhas
        .map((c) => `${c.id}:${c.status}:${c.ts}:${c.pago ? 1 : 0}:${c.remarcacaoPendente?.expiraEm ?? ""}`)
        .sort()
        .join("|"),
    [minhas],
  );
  const ehMedico = sessao.role === "medico";

  // Hoje (fuso da clínica): [00:00, 24:00) — eventos com data original de hoje.
  const hojeIso = diaFusoClinica(0).iso;
  const urlEventos = useMemo(() => {
    if (!ehMedico) return null;
    const d = diaFusoClinica(0);
    const inicio = instanteFusoClinica(d.ano, d.mes, d.dia);
    const fim = inicio + 86_400_000;
    return `/api/medico/eventos?de=${encodeURIComponent(new Date(inicio).toISOString())}&ate=${encodeURIComponent(new Date(fim).toISOString())}`;
    // hojeIso: troca de dia à meia-noite
  }, [ehMedico, hojeIso]);
  const eventos = useRecurso<{ eventos: EventoMedico[] }>(urlEventos, versaoAgenda);
  const acoesPaciente = useMemo(
    () => (eventos.dados ? contarAcoesPacienteHoje(eventos.dados.eventos, agora) : null),
    [eventos.dados, agora],
  );

  // Receita líquida: últimos 30 dias até hoje.
  const urlReceita = useMemo(
    () => (ehMedico ? `/api/medico/receita?de=${diaFusoClinica(-29).iso}&ate=${hojeIso}` : null),
    [ehMedico, hojeIso],
  );
  const receitaRecurso = useRecurso<RespostaReceita>(urlReceita, versaoAgenda);
  const receita = useMemo(
    () => ({
      pontos: pontosReceita(receitaRecurso.dados),
      totais: receitaRecurso.dados?.totais ?? null,
      carregando: receitaRecurso.carregando,
      erro: receitaRecurso.erro,
      recarregar: receitaRecurso.recarregar,
    }),
    [receitaRecurso.dados, receitaRecurso.carregando, receitaRecurso.erro, receitaRecurso.recarregar],
  );
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
    /** Remarcadas/canceladas HOJE pelo paciente (null enquanto carrega ou em erro). */
    acoesPaciente,
    acoesPacienteEstado: { carregando: eventos.carregando, erro: eventos.erro, recarregar: eventos.recarregar },
    receita,
    atendimentos30d,
    listaPacientes,
    naoLidasPorPaciente,
    avaliacoes: minhasAvaliacoes,
    anamneses,
  };
}

export type DadosMedico = ReturnType<typeof useDadosMedico>;
