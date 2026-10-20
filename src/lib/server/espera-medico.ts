import "server-only";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { consultaEmHorarioVedado, OPCOES_TX_TRAVA } from "@/lib/server/bloqueio-agenda";
import {
  cancelarReservasPendentes,
  criarReembolsoSeDevido,
  reaisParaCentavos,
  registrarEvento,
  STATUS_ABERTOS,
  travarDias,
} from "@/lib/server/financeiro";
import { confirmarPagamento, modoGateway } from "@/lib/server/pagamentos";
import {
  calcularDiferenca,
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
/*      diferença >0 → cobrança pendente SÓ da diferença (Pagamento    */
/*                     e consulta "em_espera" até o gateway confirmar     */
/*                     (confirmarPagamento a confirma, como no agendar).  */
/*    Assim o app recebe o valor novo no total e o repasse do médico novo */
/*    sai de liquidoDaConsulta(valor novo), sem mexer em repasse.ts.      */
/*  - AuditLog só com ids e tipos (sem dado de saúde, nome ou valor).     */
/* ------------------------------------------------------------------ */

export const ERRO_ESPERA_NAO_EXPIRADA = "A espera ainda não terminou.";
const MOTIVO_CANCELAMENTO = "O médico não entrou na sala em até 10 minutos";
/** Médico "livre agora" (mesma regra da GET /api/medicos/livres-agora do Médicos). */
const SEM_CONSULTA_PROXIMOS_MIN = 40;
const CONSULTA_EM_ANDAMENTO_MIN = 60;

type Tx = Prisma.TransactionClient;
type Falha = { ok: false; status: number; erro: string; extra?: Record<string, unknown> };
const falhar = (status: number, erro: string, extra?: Record<string, unknown>): Falha => ({ ok: false, status, erro, extra });

type EsperaRow = Awaited<ReturnType<typeof db.esperaMedico.findUnique>> & {};

export function esperaWire(e: NonNullable<EsperaRow>, agora: Date = new Date()) {
  const status = statusEfetivo(e, agora);
  return {
    consultaId: e.consultaId,
    status,
    iniciadaEm: e.iniciadaEm.toISOString(),
    expiraEm: e.expiraEm.toISOString(),
    segundosRestantes: status === "aguardando" ? segundosRestantes(e.expiraEm, agora) : 0,
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
  await tx.$executeRaw`
    INSERT INTO "EsperaMedico" ("id", "consultaId", "iniciadaEm", "expiraEm", "status")
    VALUES (${crypto.randomUUID()}, ${consultaId}, (${atendidaPacienteEm}::timestamptz AT TIME ZONE 'UTC'), (${expiraEm}::timestamptz AT TIME ZONE 'UTC'), 'aguardando')
    ON CONFLICT ("consultaId") DO NOTHING`;
  return tx.esperaMedico.findUnique({ where: { consultaId } });
}

/**
 * O médico atendeu: fecha como medico_entrou SÓ se a espera ainda está
 * `aguardando` ou `expirada` (expirada = o paciente ainda não escolheu;
 * escolher grava `cancelada`/`remarcada`). Idempotente (updateMany
 * condicional). `tx` opcional, padrão `db`.
 */
export async function fecharEsperaMedicoEntrou(consultaId: string, em: Date = new Date(), tx: Cliente = db) {
  const { count } = await tx.esperaMedico.updateMany({
    where: { consultaId, status: { in: ["aguardando", "expirada"] } },
    data: { status: "medico_entrou", resolvidoEm: em },
  });
  return count > 0;
}

/* ---------------- job ---------------- */

export type ResultadoJobEspera = { abertas: number; medicoEntrou: number; expiradas: number };

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
    if (await fecharEsperaMedicoEntrou(e.consultaId, em)) medicoEntrou++;
  }
  const { count: expiradas } = await db.esperaMedico.updateMany({
    where: { status: "aguardando", expiraEm: { lte: agora } },
    data: { status: "expirada" },
  });
  return { abertas, medicoEntrou, expiradas };
}

/* ---------------- leitura do paciente ---------------- */

export async function estadoEsperaDoPaciente(consultaId: string, pacienteId: string, agora: Date = new Date()) {
  const c = await db.consulta.findUnique({ where: { id: consultaId }, select: { pacienteId: true, esperaMedico: true } });
  if (!c) return falhar(404, "Consulta não encontrada.");
  if (c.pacienteId !== pacienteId) return falhar(403, "Acesso negado.");
  return { ok: true as const, espera: c.esperaMedico ? esperaWire(c.esperaMedico, agora) : null };
}

/* ---------------- validação comum ---------------- */

async function carregarParaEscolha(tx: Tx, consultaId: string, pacienteId: string, agora: Date) {
  const consulta = await tx.consulta.findUnique({
    where: { id: consultaId },
    select: { id: true, pacienteId: true, medicoId: true, especialidade: true, dataInicio: true, status: true, valor: true, pago: true, motivoConsulta: true, pagamento: { select: { id: true, status: true } } },
  });
  if (!consulta) return { falha: falhar(404, "Consulta não encontrada.") } as const;
  if (consulta.pacienteId !== pacienteId) return { falha: falhar(403, "Acesso negado.") } as const;
  const espera = await travarEspera(tx, consultaId);
  if (!espera) return { falha: falhar(409, "Esta consulta não tem espera do médico.") } as const;
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
    if (status !== "expirada") return falhar(409, status === "aguardando" ? ERRO_ESPERA_NAO_EXPIRADA : "A espera já foi resolvida.", { status });
    if (!transicaoPermitida(status, "cancelada")) return falhar(409, "A espera já foi resolvida.");

    const { count } = await tx.consulta.updateMany({
      where: { id: consulta.id, status: { in: STATUS_ABERTOS } },
      data: { status: "cancelada", motivoCancelamento: MOTIVO_CANCELAMENTO },
    });
    if (count === 0) return falhar(409, "A consulta já foi encerrada.");
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
        lte: new Date(p.agora.getTime() + SEM_CONSULTA_PROXIMOS_MIN * 60_000),
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
      return { ok: true as const, jaProcessada: true, espera: esperaWire(espera, agora), consultaNovaId: espera.consultaNovaId, cobranca: null, reembolsoId: espera.reembolsoId };
    }
    if (status !== "expirada") return falhar(409, status === "aguardando" ? ERRO_ESPERA_NAO_EXPIRADA : "A espera já foi resolvida.", { status });
    if (!transicaoPermitida(status, "remarcada")) return falhar(409, "A espera já foi resolvida.");
    if (!STATUS_ABERTOS.includes(consulta.status)) return falhar(409, "A consulta já foi encerrada.");
    if (!consulta.pago || consulta.pagamento?.status !== "confirmado") return falhar(409, "Só dá para remarcar uma consulta paga. Escolha cancelar.");

    const livre = await medicoLivreAgora(tx, { medicoId: params.medicoId, especialidade: consulta.especialidade, excetoMedicoId: consulta.medicoId, agora });
    if (!livre) return falhar(409, "medico_indisponivel");
    const dif = calcularDiferenca(reaisParaCentavos(consulta.valor), livre.valorCentavos);
    const conf = conferirDiferencaEsperada(params.diferencaEsperadaCentavos, dif.diferencaCentavos);
    if (!conf.ok) return falhar(409, conf.erro, { diferencaAtualCentavos: conf.diferencaAtualCentavos });

    // 1) Antiga: cancelada, sem multa, fora do faturamento (o 1º médico não recebe).
    const { count } = await tx.consulta.updateMany({
      where: { id: consulta.id, status: { in: STATUS_ABERTOS } },
      data: { status: "cancelada", motivoCancelamento: MOTIVO_CANCELAMENTO },
    });
    if (count === 0) return falhar(409, "A consulta já foi encerrada.");
    await registrarEvento(tx, { consultaId: consulta.id, tipo: "cancelada", por: "sistema", dataAnterior: consulta.dataInicio, motivo: "falta_medico", multaCentavos: 0 });
    await cancelarReservasPendentes(tx, consulta.id);

    // 2) Nova: médico livre, agora, valor dele, ligada à antiga.
    const cobrar = dif.acao === "cobrar";
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
        data: { consultaId: nova.id, valor: dif.diferencaCentavos / 100, metodo: "pix", status: "pendente", via: "webhook", gatewayRef: `espera:${espera.id}` },
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

    const atual = await tx.esperaMedico.update({
      where: { id: espera.id },
      data: {
        status: "remarcada",
        resolvidoEm: agora,
        consultaNovaId: nova.id,
        valorAntigoCentavos: dif.valorAntigoCentavos,
        valorNovoCentavos: dif.valorNovoCentavos,
        diferencaCentavos: dif.diferencaCentavos,
        reembolsoId,
      },
    });
    await auditar(tx, "ESPERA_MEDICO_REMARCADA", {
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
      cobranca: cobrar ? { pagamentoId: pagamentoNovoId!, valorCentavos: dif.diferencaCentavos, status: "pendente" as string } : null,
      reembolsoId,
    };
  }, OPCOES_TX_TRAVA);

  // Demonstração: gateway simulado confirma a diferença no servidor, como no agendar.
  if (res.ok && res.cobranca && modoGateway() === "simulado") {
    const p = await confirmarPagamento(res.cobranca.pagamentoId, "simulado");
    if (p?.status === "confirmado") res.cobranca.status = "confirmado";
  }
  return res;
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
