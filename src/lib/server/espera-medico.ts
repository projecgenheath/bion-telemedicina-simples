import "server-only";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { conferirMedicoAtivoNaTransacao, consultaEmHorarioVedado, OPCOES_TX_TRAVA } from "@/lib/server/bloqueio-agenda";
import {
  cancelarReservasPendentes,
  criarReembolsoSeDevido,
  REEMBOLSO_STATUS_ATIVOS,
  reaisParaCentavos,
  registrarEvento,
  STATUS_ABERTOS,
  travarDias,
} from "@/lib/server/financeiro";
import { confirmarPagamento, modoGateway } from "@/lib/server/pagamentos";
// B-28: janelas UNIFICADAS com a rota de listagem (medico-livre.ts) — antes
// havia cópias locais com borda divergente (`lte` aqui, `lt` na listagem):
// médico com consulta EXATAMENTE 40 min à frente aparecia livre na lista e
// era recusado na remarcação.
import {
  ANDAMENTO_MIN as CONSULTA_EM_ANDAMENTO_MIN,
  PROXIMA_CONSULTA_MIN as SEM_CONSULTA_PROXIMOS_MIN,
} from "@/lib/server/medico-livre";
import { decisaoCobranca, ERRO_PAGAMENTO_INDISPONIVEL, stripeAtivo } from "@/lib/stripe-checkout-logica";
import {
  calcularDiferenca,
  RESERVA_DIFERENCA_MIN,
  calcularExpiraEm,
  conferirDiferencaEsperada,
  segundosRestantes,
  statusEfetivo,
  transicaoPermitida,
  type StatusEspera,
} from "@/lib/espera-medico-logica";

/* ------------------------------------------------------------------ */
/* Espera do médico (Admin). Regras puras em lib/espera-medico-logica.  */
/*                                                                      */
/* Dinheiro (centavos):                                                 */
/*  - cancelar: consulta "cancelada" e reembolso INTEGRAL do pagamento  */
/*    confirmado (criarReembolsoSeDevido, multa 0, motivo falta_medico). */
/*  - remarcar: a consulta antiga fica "cancelada" com o Pagamento dela  */
/*    (fora do faturamento: o 1º médico não recebe). A consulta nova     */
/*    nasce com valor = preço do médico novo e consultaOrigemId = antiga, */
/*    e ganha um Pagamento próprio, então o repasse vai ao médico novo:  */
/*      diferença 0  → Pagamento novo de R$ 0, "confirmado" (crédito);   */
/*      diferença <0 → idem + Reembolso parcial do Pagamento ANTIGO;     */
/*      diferença >0 → espera "remarcando": a antiga continua valendo,  */
/*                     a nova fica "em_espera" (reservada 10 min) com   */
/*                     cobrança pendente SÓ da diferença. Pago (webhook */
/*                     → confirmarRemarcacaoEspera): cancela a antiga e */
/*                     marca remarcada. Venceu/desistiu: cobrança e     */
/*                     nova canceladas, espera volta a "expirada". Pago */
/*                     atrasado: reembolso desse pagamento.             */
/*    Assim o app recebe o valor novo no total e o repasse do médico novo */
/*    sai de liquidoDaConsulta(valor novo), sem mexer em repasse.ts.      */
/*  - AuditLog só com ids e tipos (sem dado de saúde, nome ou valor).     */
/* ------------------------------------------------------------------ */

export const ERRO_ESPERA_NAO_EXPIRADA = "A espera ainda não terminou.";
/** 409 ao tentar remarcar com outro médico um retorno grátis (valor 0, sem Pagamento). */
export const ERRO_REMARCAR_RETORNO_GRATIS =
  "Este retorno é gratuito e não pode ser remarcado com outro médico. Cancele, e o seu direito ao retorno grátis volta.";
const MOTIVO_CANCELAMENTO = "O médico não entrou na sala em até 10 minutos";

type Tx = Prisma.TransactionClient;
/** Códigos estáveis das falhas da espera (o front decide por `codigo`, não pelo texto de `erro`). */
export const CODIGOS_ESPERA = [
  "nao_encontrada", "acesso_negado", "corpo_invalido", "sem_espera", "espera_nao_expirada", "espera_resolvida",
  "consulta_encerrada", "nao_pago", "sem_remarcacao", "medico_entrou", "preco_mudou", "medico_indisponivel",
  "remarcando", "pagamento_confirmado", "pagamento_indisponivel",
] as const;
export type CodigoEspera = (typeof CODIGOS_ESPERA)[number];
type Falha = { ok: false; status: number; codigo: CodigoEspera; erro: string; extra?: Record<string, unknown> };
const falhar = (status: number, codigo: CodigoEspera, erro: string, extra?: Record<string, unknown>): Falha => ({ ok: false, status, codigo, erro, extra });

type EsperaRow = Awaited<ReturnType<typeof db.esperaMedico.findUnique>> & {};

export function esperaWire(e: NonNullable<EsperaRow>, agora: Date = new Date()) {
  const status = statusEfetivo(e, agora);
  return {
    consultaId: e.consultaId,
    status,
    iniciadaEm: e.iniciadaEm.toISOString(),
    expiraEm: e.expiraEm.toISOString(),
    segundosRestantes: status === "aguardando" ? segundosRestantes(e.expiraEm, agora) : status === "remarcando" && e.reservaExpiraEm ? segundosRestantes(e.reservaExpiraEm, agora) : 0,
    reservaExpiraEm: e.reservaExpiraEm?.toISOString() ?? null,
    podeEscolher: status === "expirada",
    consultaNovaId: e.consultaNovaId,
    diferencaCentavos: e.diferencaCentavos,
    resolvidoEm: e.resolvidoEm?.toISOString() ?? null,
  };
}

async function auditar(tx: Tx, acao: string, p: { usuarioId: string | null; role: string; consultaId: string; detalhes: string }) {
  await tx.auditLog.create({
    data: {
      acao,
      categoria: "consulta",
      severidade: "info",
      usuarioId: p.usuarioId,
      usuarioNome: p.usuarioId ? "Paciente" : "Sistema",
      role: p.role,
      entidade: "consulta",
      entidadeId: p.consultaId,
      detalhes: p.detalhes,
    },
  });
}

/** Trava a linha da espera (FOR UPDATE) e a devolve. */
async function travarEspera(tx: Tx, consultaId: string) {
  await tx.$queryRaw`SELECT "id" FROM "EsperaMedico" WHERE "consultaId" = ${consultaId} FOR UPDATE`;
  return tx.esperaMedico.findUnique({ where: { consultaId } });
}

/* ---------------- abrir / fechar ---------------- */

type Cliente = Prisma.TransactionClient | typeof db;

/**
 * Abre a espera quando o paciente atende. Idempotente MESMO com chamadas
 * simultâneas: INSERT … ON CONFLICT ("consultaId") DO NOTHING e relê
 * (datas gravadas em UTC, como o Prisma grava TIMESTAMP(3)). Não
 * gera erro de unicidade, então pode rodar dentro da transação de quem chama
 * (`tx`, padrão `db`) sem abortá-la. Consulta inexistente ou encerrada → null.
 */
export async function abrirEspera(consultaId: string, atendidaPacienteEm: Date, tx: Cliente = db) {
  const existente = await tx.esperaMedico.findUnique({ where: { consultaId } });
  if (existente) return existente;
  const c = await tx.consulta.findUnique({ where: { id: consultaId }, select: { dataInicio: true, status: true } });
  if (!c || !STATUS_ABERTOS.includes(c.status)) return null;
  const expiraEm = calcularExpiraEm(c.dataInicio, atendidaPacienteEm);
  // B-33: os parâmetros seguem como timestamptz (ISO com offset, sem
  // ambiguidade) — o `AT TIME ZONE 'UTC'` antigo re interpretava o instante
  // na timezone da SESSÃO do banco (hoje UTC; se a configuração mudasse, as
  // datas deslocariam).
  await tx.$executeRaw`
    INSERT INTO "EsperaMedico" ("id", "consultaId", "iniciadaEm", "expiraEm", "status")
    VALUES (${crypto.randomUUID()}, ${consultaId}, ${atendidaPacienteEm}::timestamptz, ${expiraEm}::timestamptz, 'aguardando')
    ON CONFLICT ("consultaId") DO NOTHING`;
  return tx.esperaMedico.findUnique({ where: { consultaId } });
}

export type DesfechoEspera = "cancelada" | "remarcada" | "remarcando";
export type ResultadoFechar =
  | { resultado: "fechada" }
  | { resultado: "ja_fechada" }
  | { resultado: "espera_encerrada"; desfecho: DesfechoEspera };

/**
 * O médico atendeu: fecha como medico_entrou SÓ se a espera ainda está
 * `aguardando` ou `expirada` sem escolha do paciente. Idempotente (updateMany
 * condicional). `tx` opcional, padrão `db`.
 *  - fechada: esta chamada fechou;
 *  - ja_fechada: já estava medico_entrou, ou a consulta não tem espera;
 *  - espera_encerrada: o paciente já escolheu (cancelada/remarcada) ou está
 *    pagando a diferença (remarcando) → a rota de entrada do médico responde
 *    409 `espera_encerrada`.
 */
export async function fecharEsperaMedicoEntrou(consultaId: string, em: Date = new Date(), tx: Cliente = db): Promise<ResultadoFechar> {
  const { count } = await tx.esperaMedico.updateMany({
    where: { consultaId, status: { in: ["aguardando", "expirada"] } },
    data: { status: "medico_entrou", resolvidoEm: em },
  });
  if (count > 0) return { resultado: "fechada" };
  const desfecho = await esperaEncerrada(consultaId, tx);
  return desfecho ? { resultado: "espera_encerrada", desfecho } : { resultado: "ja_fechada" };
}

/** O paciente já escolheu (ou está pagando a diferença)? Devolve o desfecho, ou null. `tx` opcional. */
export async function esperaEncerrada(consultaId: string, tx: Cliente = db): Promise<DesfechoEspera | null> {
  const e = await tx.esperaMedico.findUnique({ where: { consultaId }, select: { status: true } });
  return e && (e.status === "cancelada" || e.status === "remarcada" || e.status === "remarcando") ? e.status : null;
}

/* ---------------- job ---------------- */

export type ResultadoJobEspera = { abertas: number; medicoEntrou: number; expiradas: number; reservasExpiradas: number; remarcadasNoJob: number };

/**
 * Rodada do job (/api/cron/espera-medico). Idempotente:
 *  1) abre a espera das consultas abertas em que o paciente já atendeu o
 *     toque e o médico não (respondidaEm do paciente = atendidaPacienteEm);
 *  2) fecha como medico_entrou as que o médico atendeu;
 *  3) marca expirada as aguardando com expiraEm vencido.
 * As rotas do toque podem chamar abrirEspera/fecharEsperaMedicoEntrou na
 * hora; o job garante o estado mesmo sem isso.
 */
export async function rodarEsperaMedico(agora: Date = new Date()): Promise<ResultadoJobEspera> {
  const desde = new Date(agora.getTime() - 3 * 3_600_000);
  const consultas = await db.consulta.findMany({
    where: {
      status: { in: STATUS_ABERTOS },
      dataInicio: { gte: desde, lte: new Date(agora.getTime() + 30 * 60_000) },
      esperaMedico: null,
      chamadas: { some: { papel: "paciente", status: "atendida" } },
    },
    select: { id: true, medicoId: true, chamadas: { where: { status: "atendida" }, select: { papel: true, respondidaEm: true, tocouEm: true } } },
    take: 200,
  });
  let abertas = 0;
  for (const c of consultas) {
    if (c.chamadas.some((x) => x.papel === "medico")) continue;
    const p = c.chamadas.filter((x) => x.papel === "paciente").map((x) => (x.respondidaEm ?? x.tocouEm).getTime());
    if (!p.length) continue;
    if (await abrirEspera(c.id, new Date(Math.min(...p)))) abertas++;
  }
  const abertasComMedico = await db.esperaMedico.findMany({
    where: { status: { in: ["aguardando", "expirada"] }, consulta: { chamadas: { some: { papel: "medico", status: "atendida" } } } },
    select: { consultaId: true, consulta: { select: { chamadas: { where: { papel: "medico", status: "atendida" }, select: { respondidaEm: true } } } } },
    take: 500,
  });
  let medicoEntrou = 0;
  for (const e of abertasComMedico) {
    const em = e.consulta.chamadas.map((x) => x.respondidaEm).find(Boolean) ?? agora;
    if ((await fecharEsperaMedicoEntrou(e.consultaId, em)).resultado === "fechada") medicoEntrou++;
  }
  const { count: expiradas } = await db.esperaMedico.updateMany({
    where: { status: "aguardando", expiraEm: { lte: agora } },
    data: { status: "expirada" },
  });
  // 4) remarcando com a reserva de 10 min vencida: pagou no limite → troca;
  //    senão cancela a cobrança e a consulta nova e volta para expirada.
  const vencidas = await db.esperaMedico.findMany({ where: { status: "remarcando", reservaExpiraEm: { lte: agora } }, select: { consultaId: true }, take: 200 });
  let reservasExpiradas = 0;
  let remarcadasNoJob = 0;
  for (const v of vencidas) {
    const r = await expirarReservaDiferenca(v.consultaId, agora);
    if (r === "expirada") reservasExpiradas++;
    if (r === "remarcada") remarcadasNoJob++;
  }
  return { abertas, medicoEntrou, expiradas, reservasExpiradas, remarcadasNoJob };
}

/* ---------------- leitura do paciente ---------------- */

/**
 * Estado da espera (SÓ LEITURA). Se o médico já atendeu (ChamadaConsulta do
 * médico "atendida") e a espera ainda está aguardando/expirada, devolve
 * status "medico_entrou" e podeEscolher false sem gravar (o job ou a
 * próxima escolha do paciente fecha de verdade).
 */
export async function estadoEsperaDoPaciente(consultaId: string, pacienteId: string, agora: Date = new Date()) {
  const c = await db.consulta.findUnique({ where: { id: consultaId }, select: { pacienteId: true, esperaMedico: true } });
  if (!c) return falhar(404, "nao_encontrada", "Consulta não encontrada.");
  if (c.pacienteId !== pacienteId) return falhar(403, "acesso_negado", "Acesso negado.");
  if (!c.esperaMedico) return { ok: true as const, espera: null };
  const wire = esperaWire(c.esperaMedico, agora);
  if (wire.status === "aguardando" || wire.status === "expirada") {
    const medico = await db.chamadaConsulta.findFirst({ where: { consultaId, papel: "medico", status: "atendida" }, select: { id: true } });
    if (medico) return { ok: true as const, espera: { ...wire, status: "medico_entrou" as const, podeEscolher: false, segundosRestantes: 0 } };
  }
  return { ok: true as const, espera: wire };
}

/* ---------------- cobrança da diferença ---------------- */

/**
 * Cobrança da diferença como vai ao paciente. Paga só com CARTÃO no checkout
 * Stripe (POST /api/pagamentos/stripe/checkout { pagamentoId }); o app não
 * cobra por Pix. `pagarComCartao`: a tela mostra o botão Pagar.
 */
export type CobrancaEspera = {
  pagamentoId: string;
  valorCentavos: number;
  status: string;
  reservaExpiraEm: string | null;
  metodo: "cartao";
  pagarComCartao: boolean;
};
function cobrancaWire(p: { pagamentoId: string; valorCentavos: number; status: string; reservaExpiraEm: Date | null }): CobrancaEspera {
  const pagarComCartao = p.status === "pendente" && decisaoCobranca(stripeAtivo(), modoGateway()) === "stripe";
  return { ...p, reservaExpiraEm: p.reservaExpiraEm?.toISOString() ?? null, metodo: "cartao", pagarComCartao };
}

/* ---------------- validação comum ---------------- */

async function carregarParaEscolha(tx: Tx, consultaId: string, pacienteId: string, agora: Date) {
  const consulta = await tx.consulta.findUnique({
    where: { id: consultaId },
    select: { id: true, pacienteId: true, medicoId: true, especialidade: true, dataInicio: true, status: true, valor: true, pago: true, motivoConsulta: true, pagamento: { select: { id: true, status: true } } },
  });
  if (!consulta) return { falha: falhar(404, "nao_encontrada", "Consulta não encontrada.") } as const;
  if (consulta.pacienteId !== pacienteId) return { falha: falhar(403, "acesso_negado", "Acesso negado.") } as const;
  const espera = await travarEspera(tx, consultaId);
  if (!espera) return { falha: falhar(409, "sem_espera", "Esta consulta não tem espera do médico.") } as const;
  // O médico já atendeu (atendidaMedicoEm = ChamadaConsulta do médico "atendida"):
  // fecha a espera como medico_entrou e o paciente não escolhe mais.
  if (espera.status === "aguardando" || espera.status === "expirada") {
    const medico = await tx.chamadaConsulta.findFirst({ where: { consultaId, papel: "medico", status: "atendida" }, select: { respondidaEm: true } });
    if (medico) {
      await tx.esperaMedico.update({ where: { id: espera.id }, data: { status: "medico_entrou", resolvidoEm: medico.respondidaEm ?? agora } });
      return { falha: falhar(409, "medico_entrou", "medico_entrou") } as const;
    }
  }
  return { consulta, espera, status: statusEfetivo(espera, agora) } as const;
}

/* ---------------- cancelar ---------------- */

export async function cancelarPorEspera(params: { consultaId: string; pacienteId: string; agora?: Date }) {
  const agora = params.agora ?? new Date();
  return db.$transaction(async (tx) => {
    const r = await carregarParaEscolha(tx, params.consultaId, params.pacienteId, agora);
    if ("falha" in r) return r.falha!;
    const { consulta, espera, status } = r;
    if (status === "cancelada") return { ok: true as const, jaProcessada: true, espera: esperaWire(espera, agora), reembolsoId: espera.reembolsoId };
    if (status === "remarcando") return falhar(409, "remarcando", "remarcando", { status });
    if (status !== "expirada") return falhar(409, status === "aguardando" ? "espera_nao_expirada" : "espera_resolvida", status === "aguardando" ? ERRO_ESPERA_NAO_EXPIRADA : "A espera já foi resolvida.", { status });
    if (!transicaoPermitida(status, "cancelada")) return falhar(409, "espera_resolvida", "A espera já foi resolvida.");

    const { count } = await tx.consulta.updateMany({
      where: { id: consulta.id, status: { in: STATUS_ABERTOS } },
      data: { status: "cancelada", motivoCancelamento: MOTIVO_CANCELAMENTO },
    });
    if (count === 0) return falhar(409, "consulta_encerrada", "A consulta já foi encerrada.");
    await registrarEvento(tx, { consultaId: consulta.id, tipo: "cancelada", por: "sistema", dataAnterior: consulta.dataInicio, motivo: "falta_medico", multaCentavos: 0 });
    const reembolso = await criarReembolsoSeDevido(tx, {
      consultaId: consulta.id,
      valorCentavos: reaisParaCentavos(consulta.valor),
      multaCentavos: 0,
      motivo: "falta_medico",
      solicitadoPor: params.pacienteId,
    });
    await cancelarReservasPendentes(tx, consulta.id);
    const atual = await tx.esperaMedico.update({
      where: { id: espera.id },
      data: { status: "cancelada", resolvidoEm: agora, reembolsoId: reembolso?.id ?? null },
    });
    await auditar(tx, "ESPERA_MEDICO_CANCELADA", {
      usuarioId: params.pacienteId,
      role: "PACIENTE",
      consultaId: consulta.id,
      detalhes: JSON.stringify({ consultaId: consulta.id, esperaId: espera.id, reembolsoId: reembolso?.id ?? null }),
    });
    return { ok: true as const, jaProcessada: false, espera: esperaWire(atual, agora), reembolsoId: reembolso?.id ?? null };
  }, OPCOES_TX_TRAVA);
}

/* ---------------- remarcar ---------------- */

/** Confere, na transação, que o médico está livre AGORA (regra do Médicos). Devolve o valor dele em centavos ou null. */
export async function medicoLivreAgora(tx: Tx, p: { medicoId: string; especialidade: string; excetoMedicoId: string; agora: Date }) {
  if (p.medicoId === p.excetoMedicoId) return null;
  if (consultaEmHorarioVedado(p.agora)) return null;
  const m = await tx.user.findUnique({
    where: { id: p.medicoId },
    select: { role: true, status: true, perfilMedico: { select: { especialidade: true, status: true, valor: true } }, dadosRecebimento: { select: { id: true } } },
  });
  if (!m || m.role !== "MEDICO" || m.status !== "ativo" || !m.perfilMedico || m.perfilMedico.status !== "ativo") return null;
  if (m.perfilMedico.especialidade !== p.especialidade || !m.dadosRecebimento) return null;
  const ocupado = await tx.consulta.findFirst({
    where: {
      medicoId: p.medicoId,
      status: { in: STATUS_ABERTOS },
      dataInicio: {
        gte: new Date(p.agora.getTime() - CONSULTA_EM_ANDAMENTO_MIN * 60_000),
        lt: new Date(p.agora.getTime() + SEM_CONSULTA_PROXIMOS_MIN * 60_000),
      },
    },
    select: { id: true },
  });
  if (ocupado) return null;
  return { valorCentavos: reaisParaCentavos(m.perfilMedico.valor), valorReais: m.perfilMedico.valor };
}

export async function remarcarPorEspera(params: {
  consultaId: string;
  pacienteId: string;
  medicoId: string;
  diferencaEsperadaCentavos: number;
  agora?: Date;
}) {
  const agora = params.agora ?? new Date();
  const inicio = new Date(Math.floor(agora.getTime() / 60_000) * 60_000);
  const res = await db.$transaction(async (tx) => {
    // Mesma trava (médico, dia) do agendamento: ninguém marca o médico novo no meio.
    await travarDias(tx, [{ medicoId: params.medicoId, instante: inicio }]);
    const r = await carregarParaEscolha(tx, params.consultaId, params.pacienteId, agora);
    if ("falha" in r) return r.falha!;
    const { consulta, espera, status } = r;
    if (status === "remarcada") {
      return { ok: true as const, jaProcessada: true, espera: esperaWire(espera, agora), consultaNovaId: espera.consultaNovaId, cobranca: null as CobrancaEspera | null, reembolsoId: espera.reembolsoId };
    }
    if (status === "remarcando") {
      const pg = espera.consultaNovaId ? await tx.pagamento.findUnique({ where: { consultaId: espera.consultaNovaId } }) : null;
      return {
        ok: true as const, jaProcessada: true, espera: esperaWire(espera, agora), consultaNovaId: espera.consultaNovaId,
        cobranca: pg ? cobrancaWire({ pagamentoId: pg.id, valorCentavos: espera.diferencaCentavos ?? 0, status: pg.status, reservaExpiraEm: espera.reservaExpiraEm }) : null,
        reembolsoId: null,
      };
    }
    if (status !== "expirada") return falhar(409, status === "aguardando" ? "espera_nao_expirada" : "espera_resolvida", status === "aguardando" ? ERRO_ESPERA_NAO_EXPIRADA : "A espera já foi resolvida.", { status });
    if (!transicaoPermitida(status, "remarcada")) return falhar(409, "espera_resolvida", "A espera já foi resolvida.");
    if (!STATUS_ABERTOS.includes(consulta.status)) return falhar(409, "consulta_encerrada", "A consulta já foi encerrada.");
    if (!consulta.pago || consulta.pagamento?.status !== "confirmado") return falhar(409, "nao_pago", reaisParaCentavos(consulta.valor) === 0 ? ERRO_REMARCAR_RETORNO_GRATIS : "Só dá para remarcar uma consulta paga. Escolha cancelar.");

    if (await conferirMedicoAtivoNaTransacao(tx, params.medicoId)) return falhar(409, "medico_indisponivel", "medico_indisponivel");
    const livre = await medicoLivreAgora(tx, { medicoId: params.medicoId, especialidade: consulta.especialidade, excetoMedicoId: consulta.medicoId, agora });
    if (!livre) return falhar(409, "medico_indisponivel", "medico_indisponivel");
    const dif = calcularDiferenca(reaisParaCentavos(consulta.valor), livre.valorCentavos);
    const conf = conferirDiferencaEsperada(params.diferencaEsperadaCentavos, dif.diferencaCentavos);
    if (!conf.ok) return falhar(409, "preco_mudou", conf.erro, { diferencaAtualCentavos: conf.diferencaAtualCentavos });

    const cobrar = dif.acao === "cobrar";
    // Só cartão (checkout Stripe). Desligado com gateway real: 503 antes de
    // mexer em qualquer coisa (a transação não grava nada). Nunca Pix.
    if (cobrar && decisaoCobranca(stripeAtivo(), modoGateway()) === "indisponivel") {
      return falhar(503, "pagamento_indisponivel", ERRO_PAGAMENTO_INDISPONIVEL);
    }
    // 1) Antiga: cancelada já (sem diferença a pagar) ou só quando a diferença
    //    for paga (confirmarRemarcacaoEspera). Até lá ela continua valendo.
    if (!cobrar && !(await cancelarAntiga(tx, consulta))) return falhar(409, "consulta_encerrada", "A consulta já foi encerrada.");

    // 2) Nova: médico livre, agora, valor dele, ligada à antiga.
    const nova = await tx.consulta.create({
      data: {
        pacienteId: consulta.pacienteId,
        medicoId: params.medicoId,
        especialidade: consulta.especialidade,
        dataInicio: inicio,
        status: cobrar ? "em_espera" : "confirmada",
        motivoConsulta: consulta.motivoConsulta,
        valor: livre.valorReais,
        pago: !cobrar,
        remarcada: true,
        consultaOrigemId: consulta.id,
      },
      select: { id: true },
    });

    // 3) Dinheiro.
    let reembolsoId: string | null = null;
    let pagamentoNovoId: string | null = null;
    if (cobrar) {
      const p = await tx.pagamento.create({
        data: { consultaId: nova.id, valor: dif.diferencaCentavos / 100, metodo: "cartao", status: "pendente", via: "webhook", gatewayRef: `espera:${espera.id}` },
      });
      pagamentoNovoId = p.id;
    } else {
      const p = await tx.pagamento.create({
        data: { consultaId: nova.id, valor: 0, metodo: "credito", status: "confirmado", via: "espera_medico", gatewayRef: `espera:${espera.id}`, confirmadoEm: agora },
      });
      pagamentoNovoId = p.id;
      if (dif.acao === "devolver") {
        const reemb = await criarReembolsoSeDevido(tx, {
          consultaId: consulta.id,
          valorCentavos: -dif.diferencaCentavos,
          multaCentavos: 0,
          motivo: "falta_medico",
          solicitadoPor: params.pacienteId,
        });
        reembolsoId = reemb?.id ?? null;
      }
    }

    const reservaExpiraEm = cobrar ? new Date(agora.getTime() + RESERVA_DIFERENCA_MIN * 60_000) : null;
    const atual = await tx.esperaMedico.update({
      where: { id: espera.id },
      data: {
        status: cobrar ? "remarcando" : "remarcada",
        resolvidoEm: cobrar ? null : agora,
        reservaExpiraEm,
        consultaNovaId: nova.id,
        valorAntigoCentavos: dif.valorAntigoCentavos,
        valorNovoCentavos: dif.valorNovoCentavos,
        diferencaCentavos: dif.diferencaCentavos,
        reembolsoId,
      },
    });
    await auditar(tx, cobrar ? "ESPERA_MEDICO_REMARCANDO" : "ESPERA_MEDICO_REMARCADA", {
      usuarioId: params.pacienteId,
      role: "PACIENTE",
      consultaId: consulta.id,
      detalhes: JSON.stringify({ consultaId: consulta.id, consultaNovaId: nova.id, esperaId: espera.id, medicoNovoId: params.medicoId, pagamentoNovoId, reembolsoId, acao: dif.acao }),
    });
    return {
      ok: true as const,
      jaProcessada: false,
      espera: esperaWire(atual, agora),
      consultaNovaId: nova.id,
      cobranca: cobrar ? cobrancaWire({ pagamentoId: pagamentoNovoId!, valorCentavos: dif.diferencaCentavos, status: "pendente", reservaExpiraEm }) : null,
      reembolsoId,
    };
  }, OPCOES_TX_TRAVA);

  // Demonstração: gateway simulado confirma a diferença no servidor, como no
  // agendar (só com a flag Stripe desligada; ligada, quem confirma é o webhook).
  if (res.ok && res.cobranca && decisaoCobranca(stripeAtivo(), modoGateway()) === "simulado") {
    const p = await confirmarPagamento(res.cobranca.pagamentoId, "simulado");
    if (p?.status === "confirmado") {
      res.cobranca.status = "confirmado";
      const res2 = await confirmarRemarcacaoEspera(p.id, agora);
      if (res2) await avisarPacienteEspera(p.id, res2);
      const e = await db.esperaMedico.findUnique({ where: { consultaId: params.consultaId } });
      if (e) res.espera = esperaWire(e, agora);
    }
  }
  return res;
}

/** Cancela a consulta antiga (sem multa, fora do faturamento: o 1º médico não recebe). */
async function cancelarAntiga(tx: Tx, c: { id: string; dataInicio: Date }) {
  const { count } = await tx.consulta.updateMany({
    where: { id: c.id, status: { in: STATUS_ABERTOS } },
    data: { status: "cancelada", motivoCancelamento: MOTIVO_CANCELAMENTO },
  });
  if (count === 0) return false;
  await registrarEvento(tx, { consultaId: c.id, tipo: "cancelada", por: "sistema", dataAnterior: c.dataInicio, motivo: "falta_medico", multaCentavos: 0 });
  await cancelarReservasPendentes(tx, c.id);
  return true;
}

const ERRO_RESERVA = "Pagamento da diferença não chegou em 10 minutos";

/**
 * Desfaz a reserva da consulta nova (remarcando → expirada): a cobrança
 * pendente vira "falhou" e a consulta nova "cancelada" (deixa de ocupar o
 * médico). O paciente pode escolher de novo. Chamar com a espera travada.
 */
async function liberarReserva(tx: Tx, espera: { id: string; consultaId: string; consultaNovaId: string | null }, motivo: string) {
  if (espera.consultaNovaId) {
    await tx.pagamento.updateMany({ where: { consultaId: espera.consultaNovaId, status: "pendente" }, data: { status: "falhou" } });
    await tx.consulta.updateMany({
      where: { id: espera.consultaNovaId, status: { notIn: ["cancelada", "concluida"] } },
      data: { status: "cancelada", motivoCancelamento: motivo },
    });
  }
  return tx.esperaMedico.update({
    where: { id: espera.id },
    data: { status: "expirada", consultaNovaId: null, reservaExpiraEm: null, valorAntigoCentavos: null, valorNovoCentavos: null, diferencaCentavos: null },
  });
}

/**
 * Pagamento da diferença CONFIRMADO (webhook ou simulado). Idempotente:
 *  - espera remarcando com esta consulta nova → cancela a antiga e marca
 *    remarcada ("remarcada");
 *  - já remarcada com esta consulta nova → nada ("ja_remarcada");
 *    pagamento inteiro ("reembolsada"); webhook repetido → "ja_reembolsada" (sem novo aviso nem auditoria);
 *    pagamento inteiro ("reembolsada");
 *  - pagamento que não é de espera → null.
 * Chamar DEPOIS de confirmarPagamento.
 */
export async function confirmarRemarcacaoEspera(pagamentoId: string, agora: Date = new Date()) {
  const p0 = await db.pagamento.findUnique({ where: { id: pagamentoId }, select: { gatewayRef: true } });
  const esperaId = p0?.gatewayRef?.startsWith("espera:") ? p0.gatewayRef.slice("espera:".length) : null;
  if (!esperaId) return null;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "EsperaMedico" WHERE "id" = ${esperaId} FOR UPDATE`;
    const p = await tx.pagamento.findUnique({ where: { id: pagamentoId } });
    const espera = await tx.esperaMedico.findUnique({ where: { id: esperaId } });
    if (!p || !p.consultaId || !espera || p.status !== "confirmado" || p.valor <= 0) return null;
    if (espera.status === "remarcada" && espera.consultaNovaId === p.consultaId) return "ja_remarcada" as const;
    if (espera.status === "remarcando" && espera.consultaNovaId === p.consultaId) {
      const antiga = await tx.consulta.findUnique({ where: { id: espera.consultaId }, select: { id: true, dataInicio: true } });
      if (antiga) await cancelarAntiga(tx, antiga);
      await tx.esperaMedico.update({ where: { id: espera.id }, data: { status: "remarcada", resolvidoEm: agora, reservaExpiraEm: null } });
      await auditar(tx, "ESPERA_MEDICO_REMARCADA", {
        usuarioId: null, role: "SISTEMA", consultaId: espera.consultaId,
        detalhes: JSON.stringify({ consultaId: espera.consultaId, consultaNovaId: p.consultaId, esperaId: espera.id, pagamentoNovoId: p.id, acao: "cobrar" }),
      });
      return "remarcada" as const;
    }
    // Pagamento depois da reserva vencer (ou da desistência): devolve este pagamento.
    // Webhook repetido: o reembolso deste pagamento já existe → não repete o
    // cancelamento, a auditoria nem o aviso "Pagamento devolvido".
    const jaReembolsado = await tx.reembolso.findFirst({
      where: { pagamentoId: p.id, status: { in: REEMBOLSO_STATUS_ATIVOS } },
      select: { id: true },
    });
    if (jaReembolsado) return "ja_reembolsada" as const;
    const reemb = await criarReembolsoSeDevido(tx, { consultaId: p.consultaId, valorCentavos: reaisParaCentavos(p.valor), multaCentavos: 0, motivo: "falta_medico", solicitadoPor: "sistema" });
    await tx.consulta.updateMany({ where: { id: p.consultaId, status: { notIn: ["cancelada", "concluida"] } }, data: { status: "cancelada", motivoCancelamento: ERRO_RESERVA } });
    // Reembolsada: a consulta nova cancelada não fica como paga.
    await tx.consulta.update({ where: { id: p.consultaId }, data: { pago: false } });
    await auditar(tx, "ESPERA_MEDICO_PAGAMENTO_ATRASADO", {
      usuarioId: null, role: "SISTEMA", consultaId: espera.consultaId,
      detalhes: JSON.stringify({ consultaId: espera.consultaId, consultaNovaId: p.consultaId, esperaId: espera.id, pagamentoNovoId: p.id, reembolsoId: reemb?.id ?? null }),
    });
    return "reembolsada" as const;
  }, OPCOES_TX_TRAVA);
}

/** Cron: reserva de 10 min vencida. Se o pagamento já confirmou, faz a troca; senão libera. */
async function expirarReservaDiferenca(consultaId: string, agora: Date) {
  const pre = await db.esperaMedico.findUnique({ where: { consultaId }, select: { consultaNovaId: true } });
  const pg = pre?.consultaNovaId ? await db.pagamento.findUnique({ where: { consultaId: pre.consultaNovaId }, select: { id: true, status: true } }) : null;
  if (pg?.status === "confirmado") return (await confirmarRemarcacaoEspera(pg.id, agora)) === "remarcada" ? "remarcada" : null;
  return db.$transaction(async (tx) => {
    const espera = await travarEspera(tx, consultaId);
    if (!espera || espera.status !== "remarcando" || !espera.reservaExpiraEm || espera.reservaExpiraEm > agora) return null;
    const p = espera.consultaNovaId ? await tx.pagamento.findUnique({ where: { consultaId: espera.consultaNovaId }, select: { status: true } }) : null;
    if (p?.status === "confirmado") return null; // confirmou no meio: a próxima rodada (ou o webhook) troca
    await liberarReserva(tx, espera, ERRO_RESERVA);
    await auditar(tx, "ESPERA_MEDICO_RESERVA_EXPIRADA", { usuarioId: null, role: "SISTEMA", consultaId, detalhes: JSON.stringify({ consultaId, esperaId: espera.id }) });
    return "expirada" as const;
  }, OPCOES_TX_TRAVA);
}

/** Paciente desistiu de pagar a diferença: cancela a cobrança e a consulta nova; espera volta para expirada. Idempotente. */
export async function desistirRemarcacao(params: { consultaId: string; pacienteId: string; agora?: Date }) {
  const agora = params.agora ?? new Date();
  return db.$transaction(async (tx) => {
    const r = await carregarParaEscolha(tx, params.consultaId, params.pacienteId, agora);
    if ("falha" in r) return r.falha!;
    const { espera, status } = r;
    if (status === "expirada" && !espera.consultaNovaId) return { ok: true as const, jaProcessada: true, espera: esperaWire(espera, agora) };
    if (status !== "remarcando") return falhar(409, "sem_remarcacao", "Não há remarcação esperando pagamento.", { status });
    const p = espera.consultaNovaId ? await tx.pagamento.findUnique({ where: { consultaId: espera.consultaNovaId }, select: { status: true } }) : null;
    if (p?.status === "confirmado") return falhar(409, "pagamento_confirmado", "pagamento_confirmado");
    const atual = await liberarReserva(tx, espera, "O paciente desistiu de pagar a diferença");
    await auditar(tx, "ESPERA_MEDICO_REMARCACAO_DESISTIDA", { usuarioId: params.pacienteId, role: "PACIENTE", consultaId: espera.consultaId, detalhes: JSON.stringify({ consultaId: espera.consultaId, esperaId: espera.id }) });
    return { ok: true as const, jaProcessada: false, espera: esperaWire(atual, agora) };
  }, OPCOES_TX_TRAVA);
}

/* ---------------- Fila do admin ---------------- */

export type EsperaFila = {
  consultaId: string;
  status: Extract<StatusEspera, "aguardando" | "expirada">;
  iniciadaEm: string;
  expiraEm: string;
  dataInicio: string;
  medico: string;
  paciente: string;
  especialidade: string;
};

/** Esperas ativas e expiradas sem desfecho (últimas 24 h), mais antigas primeiro. */
export async function listarEsperasFila(agora: Date = new Date(), limite = 200): Promise<EsperaFila[]> {
  const linhas = await db.esperaMedico.findMany({
    where: { status: { in: ["aguardando", "expirada"] }, iniciadaEm: { gte: new Date(agora.getTime() - 24 * 3_600_000) } },
    orderBy: { expiraEm: "asc" },
    take: Math.min(Math.max(limite, 1), 500),
    select: {
      consultaId: true, status: true, iniciadaEm: true, expiraEm: true,
      consulta: { select: { dataInicio: true, especialidade: true, medico: { select: { nome: true } }, paciente: { select: { nome: true } } } },
    },
  });
  return linhas.map((l) => ({
    consultaId: l.consultaId,
    status: statusEfetivo(l, agora) === "expirada" ? "expirada" : "aguardando",
    iniciadaEm: l.iniciadaEm.toISOString(),
    expiraEm: l.expiraEm.toISOString(),
    dataInicio: l.consulta.dataInicio.toISOString(),
    medico: l.consulta.medico.nome,
    paciente: l.consulta.paciente.nome,
    especialidade: l.consulta.especialidade,
  }));
}

/**
 * Aviso ao paciente depois do pagamento da diferença (webhook ou simulado).
 * Substitui o aviso padrão de "triagem até 5 min antes", que não vale para
 * uma consulta que começa agora. Sem dado de saúde no texto.
 */
export async function avisarPacienteEspera(pagamentoId: string, resultado: "remarcada" | "ja_remarcada" | "reembolsada" | "ja_reembolsada") {
  if (resultado === "ja_remarcada" || resultado === "ja_reembolsada") return null;
  const p = await db.pagamento.findUnique({
    where: { id: pagamentoId },
    select: { consulta: { select: { pacienteId: true, medico: { select: { nome: true } } } } },
  });
  if (!p?.consulta) return null; // pagamento de renovação não tem consulta
  const texto =
    resultado === "remarcada"
      ? `Pagamento aprovado. Sua consulta com Dr(a). ${p.consulta.medico.nome} começa agora; entre na sala.`
      : "O pagamento da diferença chegou depois do prazo da reserva. A consulta nova foi cancelada e o valor será devolvido.";
  return db.notificacao.create({
    data: { tipo: resultado === "remarcada" ? "agenda" : "pagamento", titulo: resultado === "remarcada" ? "Consulta remarcada" : "Pagamento devolvido", texto, usuarioId: p.consulta.pacienteId },
  });
}
