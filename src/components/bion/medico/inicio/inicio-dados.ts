/* ==================================================================== */
/* Início do médico (redesign azul, etapa 2) — derivações PURAS.         */
/* Tudo sai dos dados que o app já carrega (consultas do médico,         */
/* avaliações recebidas, pendências). Nenhum número é inventado: sem     */
/* dado, o cartão mostra "—" ou some.                                    */
/* ==================================================================== */

import type { Avaliacao, Consulta } from "@/lib/bion-tipos";
import { normalizarTipoAtendimento, ROTULO_TIPO } from "@/lib/atendimento-tipo";
import { ROTULO_STATUS, STATUS_ATIVOS, type PacienteDoMedico } from "../metricas";

const DIA_MS = 86_400_000;

/** Consultas ativas (confirmadas, aguardando pagamento ou anamnese) nos próximos `dias` dias, a partir de agora. */
export function consultasProximosDias(consultas: Consulta[], agora: number, dias = 7): number {
  const fim = agora + dias * DIA_MS;
  return consultas.filter((c) => STATUS_ATIVOS.includes(c.status) && c.ts >= agora && c.ts < fim).length;
}

/** Média das notas recebidas (1–5), com uma casa. null sem avaliações. */
export function mediaAvaliacoes(avaliacoes: Pick<Avaliacao, "nota">[]): { media: number; total: number } | null {
  const notas = avaliacoes.map((a) => a.nota).filter((n) => typeof n === "number" && n >= 1 && n <= 5);
  if (!notas.length) return null;
  const media = Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10;
  return { media, total: notas.length };
}

export type TomSituacao = "azul" | "laranja" | "vermelho" | "verde" | "neutro";

/** Cor do rótulo de situação na tabela "Meus pacientes". */
export function tomDoStatus(status: Consulta["status"]): TomSituacao {
  switch (status) {
    case "confirmada":
    case "pendente_anamnese":
      return "azul";
    case "em_espera":
    case "aguardando_reagendamento":
      return "laranja";
    case "cancelada":
    case "falta_paciente":
      return "vermelho";
    case "concluida":
      return "verde";
    default:
      return "neutro";
  }
}

/** Consulta que representa o paciente na tabela: a próxima, senão a última. */
export const consultaReferencia = (p: PacienteDoMedico): Consulta | undefined => p.proxima ?? p.ultima;

export type LinhaPaciente = {
  chave: string;
  nome: string;
  motivo: string;
  situacao: string;
  tom: TomSituacao;
  ultima: number | null;
  proxima: number | null;
  tipo: string;
  paciente: PacienteDoMedico;
};

/**
 * `agora`: "Última consulta" só conta o que já aconteceu — o
 * pacientesOrdenados usa a futura como `ultima` quando não há passada.
 */
export function linhaPaciente(p: PacienteDoMedico, agora: number): LinhaPaciente {
  const ref = consultaReferencia(p);
  const ultimaPassada = p.ultima && p.ultima.ts < agora ? p.ultima : undefined;
  return {
    chave: p.chave,
    nome: p.nome,
    motivo: ref?.motivoConsulta?.trim() || "—",
    situacao: ref ? ROTULO_STATUS[ref.status] : "—",
    tom: ref ? tomDoStatus(ref.status) : "neutro",
    ultima: ultimaPassada?.ts ?? null,
    proxima: p.proxima?.ts ?? null,
    tipo: ref ? ROTULO_TIPO[normalizarTipoAtendimento(ref.tipoAtendimento)] : "—",
    paciente: p,
  };
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca por nome (sem acento/caixa) e filtro "só com consulta marcada". */
export function filtrarPacientes(lista: PacienteDoMedico[], busca: string, soComProxima: boolean): PacienteDoMedico[] {
  const q = semAcento(busca.trim());
  return lista.filter((p) => (!soComProxima || !!p.proxima) && (!q || semAcento(p.nome).includes(q)));
}

const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** "22/11/2026" (ou "22/11/26" com `curta`) e "15:00" no fuso da clínica. */
export function dataHoraClinica(ts: number, curta = false): { data: string; hora: string } {
  return { data: (curta ? fmtDataCurta : fmtData).format(ts), hora: fmtHora.format(ts) };
}

export type AlertaInicio =
  | { tipo: "evolucao"; paciente: string }
  | { tipo: "na_sala"; paciente: string }
  | { tipo: "reserva"; texto: string }
  | { tipo: "acoes"; remarcadas: number; canceladas: number }
  | { tipo: "nada" };

/**
 * O cartão lavanda ("Requer sua atenção") mostra UMA coisa, na ordem do que
 * mais trava o médico: evolução em rascunho (segura novos atendimentos) →
 * paciente já na sala → reserva de remarcação pendente → remarcadas/
 * canceladas pelo paciente hoje → nada.
 */
export function alertaPrioritario(e: {
  evolucaoPaciente: string | null;
  pacienteNaSala: string | null;
  reservaTexto: string | null;
  acoes: { remarcadas: number; canceladas: number } | null;
}): AlertaInicio {
  if (e.evolucaoPaciente) return { tipo: "evolucao", paciente: e.evolucaoPaciente };
  if (e.pacienteNaSala) return { tipo: "na_sala", paciente: e.pacienteNaSala };
  if (e.reservaTexto) return { tipo: "reserva", texto: e.reservaTexto };
  if (e.acoes && e.acoes.remarcadas + e.acoes.canceladas > 0) return { tipo: "acoes", ...e.acoes };
  return { tipo: "nada" };
}

/** "1 consulta" / "3 consultas". */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
