/**
 * Números do Centro de Comando calculados sobre as consultas RECENTES
 * (janela de 30 dias), não sobre as 500 mais antigas do bootstrap.
 * Funções puras: a rota só busca as linhas e conta pacientes.
 */
import type { Consulta } from "@/lib/bion-tipos";
import { fmtCurta, fmtHora } from "@/lib/bion-tipos";
import { especialidades30d, resumoHoje, serieDiaria } from "@/components/bion/admin/metricas";

export const JANELA_DIAS = 30;
export const TETO_JANELA = 20_000;

export type LinhaPainel = {
  id: string;
  medico: string;
  paciente: string;
  especialidade: string;
  status: Consulta["status"];
  dataInicio: string;
  pago: boolean;
  /** Reais, como no banco. */
  valorReais: number;
};

export type DestaquePainel = {
  id: string;
  paciente: string;
  medico: string;
  especialidade: string;
  status: string;
  ts: number;
  data: string;
};

export type ResumoPainel = {
  total: number;
  agendadas: number;
  concluidas: number;
  canceladas: number;
  reagendar: number;
  faltas: number;
  pagas: number;
  brutoPagoCentavos: number;
  aoVivo: DestaquePainel[];
  proximas: DestaquePainel[];
};

export type PainelResposta = {
  /** False quando a janela de 30 dias passou do teto: os números de agenda podem faltar. Os pacientes, não. */
  completo: boolean;
  pacientesCadastrados: number;
  pacientesAtivos: number;
  hoje: ResumoPainel;
  serie: { rotulo: string; total: number }[];
  especialidades: { nome: string; total: number; pct: number }[];
};

/** "150,50" para centavosDoValor (ele espera vírgula, não ponto). */
export function valorTabela(reais: number): string {
  if (!Number.isFinite(reais)) return "0,00";
  const neg = reais < 0;
  const [inteiro, frac] = Math.abs(reais).toFixed(2).split(".");
  return `${neg ? "-" : ""}${inteiro},${frac}`;
}

export function consultaDoPainel(l: LinhaPainel): Consulta {
  return {
    id: l.id,
    medico: l.medico,
    paciente: l.paciente,
    especialidade: l.especialidade,
    status: l.status,
    ts: Date.parse(l.dataInicio),
    data: fmtCurta(l.dataInicio),
    hora: fmtHora(l.dataInicio),
    pago: l.pago,
    valor: valorTabela(l.valorReais),
  };
}

function destaque(c: Consulta): DestaquePainel {
  return {
    id: c.id,
    paciente: c.paciente,
    medico: c.medico,
    especialidade: c.especialidade,
    status: c.status,
    ts: c.ts,
    data: c.data,
  };
}

export function montarPainel(
  linhas: LinhaPainel[],
  agora: number,
  pacientes: { cadastrados: number; ativos: number },
  completo: boolean,
): PainelResposta {
  const consultas = linhas.map(consultaDoPainel).filter((c) => Number.isFinite(c.ts));
  const hoje = resumoHoje(consultas, agora);
  return {
    completo,
    pacientesCadastrados: pacientes.cadastrados,
    pacientesAtivos: pacientes.ativos,
    hoje: {
      total: hoje.total,
      agendadas: hoje.agendadas,
      concluidas: hoje.concluidas,
      canceladas: hoje.canceladas,
      reagendar: hoje.reagendar,
      faltas: hoje.faltas,
      pagas: hoje.pagas,
      brutoPagoCentavos: hoje.brutoPagoCentavos,
      aoVivo: hoje.aoVivo.map(destaque),
      proximas: hoje.proximas.map(destaque),
    },
    serie: serieDiaria(consultas, agora, 14),
    especialidades: especialidades30d(consultas, agora),
  };
}
