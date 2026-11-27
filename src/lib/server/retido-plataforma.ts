import "server-only";
import { db } from "@/lib/db";
import {
  desfechoDaConsulta,
  EVENTO_VIGENTE,
  reaisParaCentavos,
  STATUS_FORA_DO_FATURAMENTO,
  TIPOS_EVENTO_DESFECHO,
  type EventoDesfechoMin,
} from "@/lib/server/financeiro";
import { REEMBOLSO_STATUS_EFETIVOS, totalReembolsadoCentavos } from "@/components/bion/medico/receita-servidor";
import { AVISO_RETIDO_PLATAFORMA, type RetidoPlataformaWire } from "@/lib/recebimento-modelo";

/**
 * Valor RETIDO na conta Stripe da plataforma (modelo novo, decisão do
 * Alisson de 21/11/2026 — regras 1 e 2 do arquivo compartilhado). SOMENTE
 * LEITURA para a área do médico: nada aqui cobra, transfere ou grava.
 *
 * O que dá para ler hoje: consulta paga, cobrada na plataforma (sem
 * stripeContaMedico), ainda SEM DESFECHO — o dinheiro fica na plataforma
 * até a consulta terminar. No modelo anterior (cobrança direta) todo
 * pagamento confirmado tem stripeContaMedico, então o resultado é zero:
 * nenhum número inventado enquanto o Admin não mudar a cobrança.
 *
 * Fora deste bloco, por desenho:
 *  - desfecho "realizada": a transferência pós-consulta é parte do Admin
 *    (registro de transferência ainda não existe; quando existir, entra
 *    aqui o que aguarda transferência);
 *  - falta/falha: o reembolso automático (regras 4 e 5) é parte do Admin.
 */

type ReembolsoMin = { status: string; valorCentavos: number; origem?: string | null };

export type ConsultaRetidaCandidata = {
  id: string;
  status: string;
  dataInicio: Date;
  valor: number;
  pago: boolean;
  eventos?: EventoDesfechoMin[] | null;
  pagamento: {
    status: string;
    stripeContaMedico?: string | null;
    reembolsos?: ReembolsoMin[] | null;
  } | null;
};

/**
 * Quanto desta consulta ainda está retido na plataforma (PURA).
 * Zero quando: não paga, pagamento não confirmado, cobrança direta na conta
 * do médico (modelo anterior), status fora do faturamento, já tem desfecho
 * (realizada/falta/falha) ou valor zero. Reembolso efetivo abate do retido.
 */
export function valorRetidoDaConsulta(c: ConsultaRetidaCandidata): number {
  if (!c.pago || c.pagamento?.status !== "confirmado") return 0;
  // Cobrança direta (modelo anterior): o dinheiro já caiu na conta do médico.
  if (c.pagamento.stripeContaMedico?.trim()) return 0;
  if (STATUS_FORA_DO_FATURAMENTO.includes(c.status)) return 0;
  if (desfechoDaConsulta(c) !== "sem_desfecho") return 0;
  const brutoCentavos = reaisParaCentavos(c.valor);
  if (brutoCentavos <= 0) return 0;
  const reembolsado = totalReembolsadoCentavos(c.pagamento.reembolsos);
  return Math.max(0, brutoCentavos - reembolsado);
}

const selEventoDesfecho = { id: true, tipo: true, motivo: true, em: true, dataAnterior: true, corrigidoEm: true } as const;

/**
 * Lê as consultas do PRÓPRIO médico com valor retido na plataforma.
 * `medicoId` vem da sessão na rota; nunca de query/corpo.
 */
export async function retidoNaPlataforma(medicoId: string, limite = 50): Promise<RetidoPlataformaWire> {
  const rows = await db.consulta.findMany({
    where: {
      medicoId,
      pago: true,
      status: { notIn: STATUS_FORA_DO_FATURAMENTO },
      pagamento: { status: "confirmado" },
    },
    orderBy: { dataInicio: "asc" },
    take: 200,
    select: {
      id: true,
      status: true,
      dataInicio: true,
      valor: true,
      pago: true,
      eventos: { where: { tipo: { in: TIPOS_EVENTO_DESFECHO }, ...EVENTO_VIGENTE }, select: selEventoDesfecho },
      pagamento: {
        select: {
          status: true,
          stripeContaMedico: true,
          reembolsos: { where: { status: { in: REEMBOLSO_STATUS_EFETIVOS } }, select: { status: true, valorCentavos: true, origem: true } },
        },
      },
    },
  });
  const itens = rows
    .map((c) => ({ consulta: c, valorCentavos: valorRetidoDaConsulta(c) }))
    .filter((x) => x.valorCentavos > 0)
    .slice(0, limite)
    .map((x) => ({
      consultaId: x.consulta.id,
      dataInicio: x.consulta.dataInicio.toISOString(),
      valorCentavos: x.valorCentavos,
      situacao: "aguardando_consulta" as const,
    }));
  return {
    aviso: AVISO_RETIDO_PLATAFORMA,
    totalCentavos: itens.reduce((s, i) => s + i.valorCentavos, 0),
    itens,
  };
}
