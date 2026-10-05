import "server-only";
import {
  COMISSAO_APP_PCT,
  MULTA_PARTE_MEDICO_PCT,
  STATUS_FORA_DO_FATURAMENTO,
  divisaoDaMulta,
  liquidoDaConsulta,
  reaisParaCentavos,
} from "@/lib/server/financeiro";
import { dataIsoClinica, instanteNoFuso } from "@/lib/server/fuso";
import type { ReceitaDia, RespostaReceita } from "./metricas";

/* ------------------------------------------------------------------ */
/* Receita líquida do médico — cálculo PURO (sem banco) usado por       */
/* GET /api/medico/receita. Fica fora do route.ts porque arquivos de    */
/* rota do Next só podem exportar os handlers HTTP.                     */
/* ------------------------------------------------------------------ */

/**
 * Status de reembolso que EFETIVAMENTE devolvem dinheiro: aprovado (já segue
 * para o gateway — reembolso automático) ou processado (devolvido).
 * em_analise, solicitado, negado e falhou NÃO excluem nada da receita.
 */
export const REEMBOLSO_STATUS_EFETIVOS = ["aprovado", "processado"];

type ReembolsoMin = { status: string; valorCentavos: number; origem?: string | null };

/** Reembolso que efetivamente devolve dinheiro (aprovado/processado). */
export const reembolsoEfetivo = (r: ReembolsoMin) => REEMBOLSO_STATUS_EFETIVOS.includes(r.status);

/** Soma dos reembolsos efetivos (aprovado/processado). */
export function totalReembolsadoCentavos(reembolsos: ReembolsoMin[] | null | undefined): number {
  return (reembolsos ?? [])
    .filter(reembolsoEfetivo)
    .reduce((s, r) => s + r.valorCentavos, 0);
}

/**
 * Regra do dono (01/10/2026): consulta cujo pagamento tem reembolso INTEGRAL
 * efetivo (aprovado/processado, valor ≥ valor da consulta) não entra na
 * receita — cobre o reembolso manual por falta do paciente (o médico devolve
 * a parte dele e o app os 10%). Reembolso em análise/solicitado/negado/falhou
 * não exclui. O reembolso manual (origem "manual") é sempre do valor integral.
 */
export function consultaReembolsadaIntegral(brutoCentavos: number, reembolsos: ReembolsoMin[] | null | undefined): boolean {
  if ((reembolsos ?? []).some((r) => r.origem === "manual" && reembolsoEfetivo(r))) return true;
  return brutoCentavos > 0 && totalReembolsadoCentavos(reembolsos) >= brutoCentavos;
}

export type ConsultaReceita = {
  id: string;
  dataInicio: Date;
  status: string;
  valor: number; // reais (Float legado)
  pago: boolean;
  pagamento: { status: string; reembolsos: ReembolsoMin[] } | null;
};

/** Multa do cancelamento pelo paciente (EventoConsulta "cancelada" com multaCentavos > 0). */
export type MultaCancelamento = {
  em: Date;
  multaCentavos: number;
  /** valor da consulta (reais) e reembolsos do pagamento, para saber se a multa foi devolvida. */
  valorConsulta: number;
  reembolsos: ReembolsoMin[];
};

/** Multa paga da remarcação (RemarcacaoPendente "aprovada"). */
export type MultaRemarcacao = {
  quando: Date; // aprovadoEm (ou criadoEm)
  multaCentavos: number;
  reembolso: ReembolsoMin | null;
};

/**
 * A consulta entra na receita líquida quando:
 *  - tem Pagamento com status "confirmado" (as 6 consultas de teste com
 *    pago=true sem Pagamento ficam fora, mesma regra do repasse);
 *  - o status NÃO está em STATUS_FORA_DO_FATURAMENTO (cancelada,
 *    aguardando_reagendamento);
 *  - o horário já começou (dataInicio ≤ agora): consulta paga futura ainda
 *    não foi realizada, então ainda não é receita;
 *  - não tem reembolso integral efetivo (consultaReembolsadaIntegral).
 * Reembolso parcial efetivo NÃO exclui: desconta a parte do médico (90%)
 * no líquido (ver calcularReceita), igual ao itemDaConsulta do repasse.
 * O dia é o da CONSULTA em São Paulo (mesma competência do repasse).
 */
export function consultaEntraNaReceita(c: ConsultaReceita, agora: Date): boolean {
  // pago=true sem Pagamento (consultas de teste) NÃO entra: exige confirmado.
  if (!c.pago || c.pagamento?.status !== "confirmado") return false;
  if (STATUS_FORA_DO_FATURAMENTO.includes(c.status)) return false;
  if (c.dataInicio.getTime() > agora.getTime()) return false;
  return !consultaReembolsadaIntegral(reaisParaCentavos(c.valor), c.pagamento.reembolsos);
}

/**
 * A multa do cancelamento foi devolvida? O reembolso automático do
 * cancelamento devolve valor − multa; se os reembolsos efetivos passam
 * disso, a multa (ou parte dela) voltou ao paciente — não conta.
 */
export function multaCancelamentoDevolvida(m: MultaCancelamento): boolean {
  const naoMulta = reaisParaCentavos(m.valorConsulta) - m.multaCentavos;
  return totalReembolsadoCentavos(m.reembolsos) > naoMulta;
}

/** Multa de remarcação devolvida (Reembolso ligado à remarcação, efetivo). */
export function multaRemarcacaoDevolvida(m: MultaRemarcacao): boolean {
  return !!m.reembolso && reembolsoEfetivo(m.reembolso);
}

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MAX_DIAS_RECEITA = 366;

/** "AAAA-MM-DD" válido → início do dia em São Paulo; senão null. */
export function inicioDoDiaSP(dia: string): Date | null {
  const m = RE_DIA.exec(dia);
  if (!m) return null;
  const [ano, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const inst = instanteNoFuso(ano, mes, d);
  return dataIsoClinica(inst) === dia ? inst : null; // recusa 2026-02-31
}

/** Intervalo [inicio, fim) em São Paulo para de..ate (inclusive) ou erro. */
export function intervaloReceita(de: string, ate: string): { inicio: Date; fim: Date; dias: string[] } | { erro: string } {
  const inicio = inicioDoDiaSP(de);
  const ultimo = inicioDoDiaSP(ate);
  if (!inicio || !ultimo) return { erro: "Use datas no formato AAAA-MM-DD." };
  if (ultimo.getTime() < inicio.getTime()) return { erro: "A data final precisa ser igual ou depois da inicial." };
  const dias: string[] = [];
  // Meio-dia evita qualquer borda de fuso ao avançar de 24 em 24 h.
  for (let t = inicio.getTime() + 12 * 3_600_000; t <= ultimo.getTime() + 12 * 3_600_000; t += 86_400_000) {
    dias.push(dataIsoClinica(new Date(t)));
    if (dias.length > MAX_DIAS_RECEITA) return { erro: `Intervalo máximo: ${MAX_DIAS_RECEITA} dias.` };
  }
  const fim = inicioDoDiaSP(dataIsoClinica(new Date(ultimo.getTime() + 36 * 3_600_000)))!;
  return { inicio, fim, dias };
}

const zero = (): Omit<ReceitaDia, "dia"> => ({
  liquidoCentavos: 0,
  brutoCentavos: 0,
  comissaoCentavos: 0,
  taxaCentavos: 0,
  multasMedicoCentavos: 0,
  totalCentavos: 0,
  consultas: 0,
});

/**
 * Soma por dia (São Paulo). Consultas pelo dia da consulta; multas pelo dia
 * em que foram cobradas (cancelamento: `em` do evento; remarcação: aprovação
 * do pagamento). Multas entram SEPARADAS do líquido da consulta, só a parte
 * do médico (divisaoDaMulta). Reembolso parcial efetivo reduz o líquido da
 * consulta (parte do médico = 90% do reembolsado). Taxa do gateway = 0
 * enquanto o Pagamento não guarda a taxa.
 */
export function calcularReceita(params: {
  de: string;
  ate: string;
  dias: string[];
  consultas: ConsultaReceita[];
  multasCancelamento: MultaCancelamento[];
  multasRemarcacao: MultaRemarcacao[];
  agora?: Date;
}): RespostaReceita {
  const agora = params.agora ?? new Date();
  const mapa = new Map<string, ReceitaDia>(params.dias.map((dia) => [dia, { dia, ...zero() }]));

  // Parte do médico na consulta = 100 − comissão do app (mesma do repasse).
  const parteMedicoPct = 100 - COMISSAO_APP_PCT;
  for (const c of params.consultas) {
    if (!consultaEntraNaReceita(c, agora)) continue;
    const d = mapa.get(dataIsoClinica(c.dataInicio));
    if (!d) continue;
    const l = liquidoDaConsulta(reaisParaCentavos(c.valor), 0);
    // Reembolso parcial: desconta a parte do médico (90% do reembolsado),
    // espelhando itemDaConsulta em repasse.ts.
    const antes = l.brutoCentavos - l.comissaoCentavos - l.taxaCentavos;
    const reembolsos = Math.min(
      antes,
      Math.round((totalReembolsadoCentavos(c.pagamento?.reembolsos) * parteMedicoPct) / 100),
    );
    d.brutoCentavos += l.brutoCentavos;
    d.comissaoCentavos += l.comissaoCentavos;
    d.taxaCentavos += l.taxaCentavos;
    d.liquidoCentavos += antes - reembolsos;
    d.consultas += 1;
  }
  const somarMulta = (quando: Date, multa: number) => {
    const d = mapa.get(dataIsoClinica(quando));
    if (d && multa > 0) d.multasMedicoCentavos += divisaoDaMulta(multa).medicoCentavos;
  };
  for (const m of params.multasCancelamento) if (!multaCancelamentoDevolvida(m)) somarMulta(m.em, m.multaCentavos);
  for (const m of params.multasRemarcacao) if (!multaRemarcacaoDevolvida(m)) somarMulta(m.quando, m.multaCentavos);

  const dias = [...mapa.values()];
  const totais = zero();
  for (const d of dias) {
    d.totalCentavos = d.liquidoCentavos + d.multasMedicoCentavos;
    totais.liquidoCentavos += d.liquidoCentavos;
    totais.brutoCentavos += d.brutoCentavos;
    totais.comissaoCentavos += d.comissaoCentavos;
    totais.taxaCentavos += d.taxaCentavos;
    totais.multasMedicoCentavos += d.multasMedicoCentavos;
    totais.totalCentavos += d.totalCentavos;
    totais.consultas += d.consultas;
  }
  return {
    de: params.de,
    ate: params.ate,
    dias,
    totais,
    regra: { comissaoPct: COMISSAO_APP_PCT, multaParteMedicoPct: MULTA_PARTE_MEDICO_PCT },
  };
}
