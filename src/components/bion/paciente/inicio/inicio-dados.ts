/**
 * Derivações do Início do paciente (redesign azul, etapa 1). Módulo puro:
 * recebe o que o PacienteApp já tem (dados reais do estado) e devolve o que
 * a tela mostra. Testes em inicio-dados.teste.ts.
 */
import type { Consulta } from "@/lib/bion-tipos";
import { rotuloHistorico, type EtiquetaConsulta } from "../etiqueta-consulta";

const fmtDiaLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** "Terça-feira, 24 de novembro" (fuso da clínica). */
export function diaPorExtenso(ts: number): string {
  const s = fmtDiaLongo.format(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "24/11/2026" e "09:30" (fuso da clínica). */
export function dataHora(ts: number): { data: string; hora: string } {
  return { data: fmtDataCurta.format(ts), hora: fmtHora.format(ts) };
}

/** Iniciais para o avatar (até 2 letras; ignora "Dr.", "Dra." e preposições curtas). */
export function iniciaisNome(nome: string): string {
  const partes = nome
    .split(/\s+/)
    .filter((p) => p.length > 1 && !/^dra?\.?$/i.test(p) && !/^(de|da|do|das|dos)$/i.test(p));
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

const STATUS_HISTORICO = new Set(["concluida", "cancelada", "falta_paciente"]);

export type LinhaHistorico = {
  id: string;
  ts: number;
  data: string;
  hora: string;
  medico: string;
  especialidade: string;
  situacao: EtiquetaConsulta;
};

/** Consultas encerradas (realizadas, canceladas, faltas), da mais recente para a mais antiga. */
export function historicoConsultas(consultas: Consulta[]): LinhaHistorico[] {
  return consultas
    .filter((c) => STATUS_HISTORICO.has(c.status))
    .sort((a, b) => b.ts - a.ts)
    .map((c) => ({
      id: c.id,
      ts: c.ts,
      ...dataHora(c.ts),
      medico: c.medico,
      especialidade: c.especialidade,
      situacao: rotuloHistorico(c.status, c.pago),
    }));
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Busca do histórico por médico ou especialidade (sem acento e sem caixa). */
export function filtrarHistorico(linhas: LinhaHistorico[], busca: string): LinhaHistorico[] {
  const q = normalizar(busca);
  if (!q) return linhas;
  return linhas.filter((l) => normalizar(l.medico).includes(q) || normalizar(l.especialidade).includes(q));
}

/** O que o cartão lavanda ("Requer sua atenção") mostra — a primeira que valer ganha. */
export type AcaoPrioritaria =
  | { tipo: "reagendar"; especialidade: string }
  | { tipo: "pagar"; medico: string; quando: string }
  | { tipo: "triagem"; medico: string; quando: string; andamento: boolean }
  | { tipo: "mensagem"; medico: string; total: number }
  | { tipo: "nada" };

export function acaoPrioritaria(e: {
  aguardandoReagendamento?: Consulta | null;
  proxima?: Consulta | null;
  proximaAguardandoPagamento?: boolean;
  triagemPendente?: "andamento" | "nao_iniciada" | null;
  mensagemDe?: string | null;
  mensagensDoRemetente?: number;
}): AcaoPrioritaria {
  if (e.aguardandoReagendamento) return { tipo: "reagendar", especialidade: e.aguardandoReagendamento.especialidade };
  const p = e.proxima;
  if (p && e.proximaAguardandoPagamento) return { tipo: "pagar", medico: p.medico, quando: `${p.data} · ${p.hora}` };
  if (p && e.triagemPendente) return { tipo: "triagem", medico: p.medico, quando: `${p.data} · ${p.hora}`, andamento: e.triagemPendente === "andamento" };
  if (e.mensagemDe) return { tipo: "mensagem", medico: e.mensagemDe, total: Math.max(1, e.mensagensDoRemetente ?? 1) };
  return { tipo: "nada" };
}

/**
 * Tempo até a consulta, curto, para o lado do horário no cartão azul
 * ("em 18 min", "em 2 h 5 min"). Só nas próximas 24 h; depois, nada.
 */
export function faltaCurta(ts: number, agora: number): string | null {
  const min = Math.ceil((ts - agora) / 60_000);
  if (min <= 0 || min >= 24 * 60) return null;
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `em ${h} h ${m} min` : `em ${h} h`;
}
