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
import type { DadosPessoaisMedico } from "./dados-pessoais";
import type { CampoRecebimento, PixTipo, RecebimentoWire, TitularTipo } from "@/lib/server/recebimento";

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
  // Dados pessoais PRIVADOS do próprio médico (GET /api/medico/perfil) —
  // fora do store/diretório público de propósito (pacientes recebem medicoWire).
  const dadosPessoaisRecurso = useRecurso<{ dados: DadosPessoaisMedico }>(ehMedico ? "/api/medico/perfil" : null, "");
  const dadosPessoais = useMemo(
    () => ({
      dados: dadosPessoaisRecurso.dados?.dados ?? null,
      carregando: dadosPessoaisRecurso.carregando,
      erro: dadosPessoaisRecurso.erro,
      recarregar: dadosPessoaisRecurso.recarregar,
    }),
    [dadosPessoaisRecurso.dados, dadosPessoaisRecurso.carregando, dadosPessoaisRecurso.erro, dadosPessoaisRecurso.recarregar],
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
    /** Data de nascimento, sexo, telefone e CNPJ do próprio médico (privados). */
    dadosPessoais,
    atendimentos30d,
    listaPacientes,
    naoLidasPorPaciente,
    avaliacoes: minhasAvaliacoes,
    anamneses,
  };
}

export type DadosMedico = ReturnType<typeof useDadosMedico>;

/** Dia inteiro bloqueado pelo próprio médico (folga/férias). */
export type BloqueioAgendaMedico = { dia: string; motivo: string; criadoEm: string };

/**
 * Dias bloqueados do PRÓPRIO médico, de hoje em diante
 * (GET /api/medico/agenda/bloqueios). Recarrega no EVENTO_DADOS_MEDICO.
 * `porDia`: "AAAA-MM-DD" → bloqueio (motivo é privado do médico).
 */
export function useBloqueiosAgenda() {
  const { sessao } = useBion();
  const r = useRecurso<{ bloqueios: BloqueioAgendaMedico[] }>(
    sessao.role === "medico" ? "/api/medico/agenda/bloqueios" : null,
    "",
  );
  const porDia = useMemo(
    () => new Map((r.dados?.bloqueios ?? []).map((b) => [b.dia, b] as const)),
    [r.dados],
  );
  return { porDia, carregando: r.carregando, erro: r.erro, recarregar: r.recarregar };
}

/** Corpo do PUT /api/medico/recebimento (o servidor normaliza e valida). */
export type RecebimentoEntrada = {
  pixTipo: PixTipo;
  pixChave: string;
  titularTipo: TitularTipo;
  titularNome: string;
  titularDocumento: string;
};

export type ResultadoSalvarRecebimento =
  | { ok: true; alterado: boolean }
  | { ok: false; erro: string; campo?: CampoRecebimento };

/**
 * Chave PIX de recebimento do PRÓPRIO médico (GET/PUT
 * /api/medico/recebimento). Só máscaras chegam ao cliente; fora do
 * store/bootstrap de propósito. `salvar` grava e recarrega.
 */
export function useRecebimento() {
  const { sessao } = useBion();
  const r = useRecurso<{ recebimento: RecebimentoWire | null; perfilTemCnpj: boolean }>(
    sessao.role === "medico" ? "/api/medico/recebimento" : null,
    "",
  );
  const [salvando, setSalvando] = useState(false);
  const { recarregar } = r;

  const salvar = useCallback(
    async (entrada: RecebimentoEntrada): Promise<ResultadoSalvarRecebimento> => {
      setSalvando(true);
      try {
        const res = await fetch("/api/medico/recebimento", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entrada),
        });
        const json = (await res.json().catch(() => null)) as
          | { erro?: string; campo?: CampoRecebimento; alterado?: boolean }
          | null;
        if (!res.ok) return { ok: false, erro: json?.erro ?? "Não foi possível salvar agora.", campo: json?.campo };
        recarregar();
        return { ok: true, alterado: json?.alterado !== false };
      } catch {
        return { ok: false, erro: "Falha de conexão com o servidor." };
      } finally {
        setSalvando(false);
      }
    },
    [recarregar],
  );

  return {
    /** null = ainda não cadastrou (ou carregando/erro: veja `carregando`/`erro`). */
    recebimento: r.dados?.recebimento ?? null,
    /** Sem CNPJ no perfil, titular PJ não é aceito. */
    perfilTemCnpj: r.dados?.perfilTemCnpj ?? false,
    /** true depois da primeira resposta boa. */
    carregado: r.dados !== null,
    carregando: r.carregando,
    erro: r.erro,
    recarregar,
    salvando,
    salvar,
  };
}


/* ---------- Repasses do próprio médico -------------------------------- */

export type TotaisRepasseWire = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  ajustesCentavos: number;
  liquidoCentavos: number;
};

export type RepasseResumo = {
  id: string;
  competencia: string;
  status: string;
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  ajustesCentavos: number;
  liquidoCentavos: number;
  itens: number;
  fechadoEm: string | null;
  pagoEm: string | null;
};

export type PreviaRepasseWire = {
  competencia: string;
  corte: string;
  totais: TotaisRepasseWire;
  ajustesPendentesRestantesCentavos: number;
  itens: {
    tipo: string;
    data: string;
    brutoCentavos: number;
    comissaoCentavos: number;
    taxasCentavos: number;
    reembolsosCentavos: number;
    multasCentavos: number;
    liquidoCentavos: number;
  }[];
  ajustes: { valorCentavos: number; aplicadoCentavos: number }[];
};

export type ListaRepasses = {
  saldoCentavos: number;
  temChavePix: boolean;
  aviso: string;
  previa: PreviaRepasseWire;
  repasses: RepasseResumo[];
};

export type ItemRepasseDetalhe = {
  tipo: string;
  data: string;
  paciente: string;
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  liquidoCentavos: number;
};

export type RepasseDetalhe = {
  id: string;
  competencia: string;
  status: string;
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  ajustesCentavos: number;
  liquidoCentavos: number;
  fechadoEm: string | null;
  pagoEm: string | null;
  comprovanteUrl: string | null;
  pixUsado: { pixTipo: string; chaveMascarada: string; titularNome: string | null } | null;
  itens: ItemRepasseDetalhe[];
  ajustes: { motivo: string; valorCentavos: number; valorAplicadoCentavos: number; criadoEm: string }[];
};

/**
 * Histórico e prévia dos repasses do PRÓPRIO médico
 * (GET /api/medico/repasses e /api/medico/repasses/[id]).
 * Recarrega no EVENTO_DADOS_MEDICO.
 */
export function useRepasses() {
  const { sessao } = useBion();
  const r = useRecurso<ListaRepasses>(sessao.role === "medico" ? "/api/medico/repasses" : null, "");
  const [detalhe, setDetalhe] = useState<RepasseDetalhe | null>(null);
  const [detalheCarregando, setDetalheCarregando] = useState(false);
  const [detalheErro, setDetalheErro] = useState<string | null>(null);

  const carregarDetalhe = useCallback(async (id: string) => {
    setDetalheCarregando(true);
    setDetalheErro(null);
    try {
      const res = await fetch(`/api/medico/repasses/${encodeURIComponent(id)}`, {
        headers: { "Content-Type": "application/json" },
      });
      const json = (await res.json().catch(() => null)) as
        | { repasse?: RepasseDetalhe; erro?: string }
        | null;
      if (!res.ok || !json?.repasse) {
        setDetalhe(null);
        setDetalheErro(json?.erro ?? "Não foi possível carregar o detalhe.");
        return null;
      }
      setDetalhe(json.repasse);
      return json.repasse;
    } catch {
      setDetalhe(null);
      setDetalheErro("Falha de conexão com o servidor.");
      return null;
    } finally {
      setDetalheCarregando(false);
    }
  }, []);

  const limparDetalhe = useCallback(() => {
    setDetalhe(null);
    setDetalheErro(null);
  }, []);

  return {
    lista: r.dados,
    carregando: r.carregando,
    erro: r.erro,
    recarregar: r.recarregar,
    detalhe,
    detalheCarregando,
    detalheErro,
    carregarDetalhe,
    limparDetalhe,
  };
}
