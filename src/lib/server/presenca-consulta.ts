import "server-only";
import { db } from "@/lib/db";
import { quandoClinica } from "@/lib/server/fuso";
import { aplicarFalhaTecnica, registrarEvento } from "@/lib/server/financeiro";
import { REEMBOLSO_MANUAL_PRAZO_DIAS } from "@/lib/server/dados";

/* ------------------------------------------------------------------ */
/* Falta do paciente / falha técnica detectadas pela PRESENÇA na sala.  */
/*                                                                      */
/* Depois que a janela da consulta termina, lê os registros de          */
/* PresencaSala (heartbeat de cada participante, ver                    */
/* /api/telemedicina/[consultaId]/sala) e grava UM EventoConsulta por    */
/* consulta, com por = "sistema" (mesmo mecanismo de financeiro.ts):     */
/*  - falta_paciente: o médico esteve na sala e o paciente não entrou.   */
/*    Status NÃO muda e não há reembolso automático: o paciente pode     */
/*    pedir o reembolso pelo app em até REEMBOLSO_MANUAL_PRAZO_DIAS e o   */
/*    admin decide em "Reembolsos".                                      */
/*  - falha_tecnica (regra do Alisson): SÓ quando alguém que já estava   */
/*    conectado caiu e a chamada não seguiu, OU quando NINGUÉM conseguiu */
/*    entrar. Gravada por aplicarFalhaTecnica (financeiro.ts, do Admin): */
/*    paga → aguardando_reagendamento; não paga → cancelada.             */
/* Os dois eventos nunca convivem na mesma consulta.                     */
/* ------------------------------------------------------------------ */

/**
 * Carência depois do horário marcado: a decisão só sai quando a SALA já
 * fechou (mesma janela de `salaAberta` em components/bion/medico/metricas.ts:
 * a sala fica aberta até 2 h depois do horário). Não existe duração de
 * consulta gravada no banco; esperar a sala fechar garante que um paciente
 * atrasado ainda pode entrar e que a classificação não muda depois.
 */
export const CARENCIA_APOS_INICIO_MIN = 120;
/**
 * Queda: os dois entraram, mas um parou de mandar heartbeat e o outro ficou
 * na sala pelo menos este tempo esperando (sem ninguém encerrar a chamada).
 */
export const QUEDA_MIN = 5;
/** Só consultas a partir desta data (00:00 de 02/10/2026 em Brasília): nada retroativo. */
export const INICIO_DETECCAO = new Date("2026-10-02T03:00:00.000Z");
/** E só as dos últimos dias (depois disso o paciente já não pede reembolso). */
export const JANELA_RETROATIVA_DIAS = REEMBOLSO_MANUAL_PRAZO_DIAS;
/** Status em que a consulta ainda "ia acontecer" (os demais já têm desfecho). */
export const STATUS_AVALIAVEIS = ["confirmada", "em_espera", "pendente_anamnese"];
/** Máximo de consultas avaliadas por chamada do bootstrap (custo limitado). */
const MAX_POR_CHAMADA = 20;

export type Classificacao =
  | { resultado: "aguardar"; motivo: string }
  | { resultado: "sem_evento"; motivo: string }
  | { resultado: "falta_paciente"; motivo: string }
  | { resultado: "falha_tecnica"; motivo: string };

/**
 * Classificação PURA (sem banco), testada em presenca-consulta.teste.ts.
 * `ultimoPingMedico/Paciente`: último heartbeat de cada um na sala (null =
 * nunca entrou). Heartbeat ANTES do horário marcado não conta como presença
 * (entrou e saiu antes de a consulta começar).
 */
export function classificarPresenca(p: {
  dataInicio: Date;
  agora: Date;
  pago: boolean;
  ultimoPingMedico: Date | null;
  ultimoPingPaciente: Date | null;
  /** Algum participante encerrou a chamada pelo botão (sinal de controle "encerrada"). */
  encerradaPeloBotao: boolean;
}): Classificacao {
  const inicio = p.dataInicio.getTime();
  if (p.agora.getTime() < inicio + CARENCIA_APOS_INICIO_MIN * 60_000) {
    return { resultado: "aguardar", motivo: "A sala ainda não fechou." };
  }
  const presente = (d: Date | null) => d !== null && d.getTime() >= inicio;
  const medico = presente(p.ultimoPingMedico);
  const paciente = presente(p.ultimoPingPaciente);

  if (!medico && !paciente) {
    // Consulta não paga em que ninguém entrou: é uma reserva que não foi paga,
    // não uma falha técnica. Fica como está.
    if (!p.pago) return { resultado: "sem_evento", motivo: "Consulta não paga e ninguém entrou na sala." };
    return { resultado: "falha_tecnica", motivo: "Nem o médico nem o paciente conseguiram entrar na sala." };
  }
  if (medico && !paciente) {
    return { resultado: "falta_paciente", motivo: "O médico esteve na sala e o paciente não entrou." };
  }
  if (!medico && paciente) {
    // Não é falta do paciente nem falha técnica pela regra: fica para o admin.
    return { resultado: "sem_evento", motivo: "O paciente esteve na sala e o médico não entrou." };
  }
  // Os dois entraram: só é falha se alguém caiu e o outro ficou esperando.
  if (p.encerradaPeloBotao) return { resultado: "sem_evento", motivo: "A chamada foi encerrada pelo botão." };
  const tM = p.ultimoPingMedico!.getTime();
  const tP = p.ultimoPingPaciente!.getTime();
  if (Math.abs(tM - tP) >= QUEDA_MIN * 60_000) {
    const caiu = tM < tP ? "médico" : "paciente";
    return {
      resultado: "falha_tecnica",
      motivo: `Os dois entraram, a conexão do ${caiu} caiu e a chamada não seguiu.`,
    };
  }
  return { resultado: "sem_evento", motivo: "Os dois estiveram na sala até o fim (o médico conclui a consulta)." };
}

/** Erro interno para desfazer a transação sem gravar nada. */
class SemAlteracao extends Error {}

type ConsultaAvaliada = {
  id: string;
  pacienteId: string;
  medicoId: string;
  especialidade: string;
  status: string;
  pago: boolean;
  dataInicio: Date;
  updatedAt: Date;
};

/** Auditoria do evento gravado pelo sistema (aparece para o admin em /auditoria). */
function dadosAudit(c: ConsultaAvaliada, tipo: "falta_paciente" | "falha_tecnica", motivo: string) {
  return {
    acao: tipo === "falta_paciente" ? "CONSULTA_FALTA_PACIENTE" : "CONSULTA_FALHA_TECNICA",
    categoria: "consulta",
    severidade: "warning",
    usuarioNome: "Sistema BION",
    role: "sistema",
    entidade: "consulta",
    entidadeId: c.id,
    detalhes: `${tipo === "falta_paciente" ? "Falta do paciente" : "Falha técnica"} registrada automaticamente — ${c.especialidade} (${quandoClinica(c.dataInicio)}). ${motivo}`,
  };
}

/**
 * Grava o evento da classificação, numa transação só. Idempotente:
 * - trava a consulta com updateMany condicionado ao status e ao updatedAt
 *   lidos (outra requisição que mexeu nela no meio faz esta desistir);
 * - não grava se já existe falta_paciente OU falha_tecnica;
 * - falha técnica passa por aplicarFalhaTecnica (que tem a própria checagem).
 */
async function gravarClassificacao(c: ConsultaAvaliada, cl: Classificacao) {
  if (cl.resultado !== "falta_paciente" && cl.resultado !== "falha_tecnica") return null;
  const tipo = cl.resultado;
  try {
    return await db.$transaction(async (tx) => {
      const { count } = await tx.consulta.updateMany({
        where: { id: c.id, status: c.status, updatedAt: c.updatedAt },
        data: { status: c.status },
      });
      if (count === 0) throw new SemAlteracao();
      const jaTem = await tx.eventoConsulta.findFirst({
        where: { consultaId: c.id, tipo: { in: ["falta_paciente", "falha_tecnica"] } },
        select: { id: true },
      });
      if (jaTem) throw new SemAlteracao();

      if (tipo === "falta_paciente") {
        await registrarEvento(tx, {
          consultaId: c.id,
          tipo: "falta_paciente",
          por: "sistema",
          atorId: null,
          dataAnterior: c.dataInicio,
          motivo: "falta_paciente",
          multaCentavos: 0,
        });
        await tx.notificacao.create({
          data: {
            tipo: "agenda",
            titulo: "Falta registrada",
            texto: `Você não entrou na sala da consulta de ${c.especialidade} (${quandoClinica(c.dataInicio)}). Se teve um imprevisto, peça o reembolso pelo app em até ${REEMBOLSO_MANUAL_PRAZO_DIAS} dias.`,
            usuarioId: c.pacienteId,
          },
        });
      } else {
        const r = await aplicarFalhaTecnica(tx, c.id);
        if (!r) throw new SemAlteracao();
        await tx.notificacao.create({
          data: {
            tipo: "agenda",
            titulo: "Falha técnica na consulta",
            texto:
              r.status === "aguardando_reagendamento"
                ? `A consulta de ${c.especialidade} (${quandoClinica(c.dataInicio)}) não pôde acontecer por falha técnica. Escolha no app: remarcar sem custo ou reembolso integral.`
                : `A consulta de ${c.especialidade} (${quandoClinica(c.dataInicio)}) não pôde acontecer por falha técnica e foi cancelada, sem custo.`,
            usuarioId: c.pacienteId,
          },
        });
      }
      await tx.auditLog.create({ data: dadosAudit(c, tipo, cl.motivo) });
      return tipo;
    });
  } catch (e) {
    if (e instanceof SemAlteracao) return null;
    throw e;
  }
}

/** Lê a presença e grava (se for o caso) o evento de UMA consulta. */
async function avaliarConsulta(c: ConsultaAvaliada, agora: Date) {
  const [presencas, encerrada] = await Promise.all([
    db.presencaSala.findMany({ where: { consultaId: c.id }, select: { usuarioId: true, ultimoPing: true } }),
    db.sinalSala.findFirst({
      where: { consultaId: c.id, tipo: "controle", payload: { contains: '"encerrada"' } },
      select: { id: true },
    }),
  ]);
  const ping = (usuarioId: string) => presencas.find((x) => x.usuarioId === usuarioId)?.ultimoPing ?? null;
  const cl = classificarPresenca({
    dataInicio: c.dataInicio,
    agora,
    pago: c.pago,
    ultimoPingMedico: ping(c.medicoId),
    ultimoPingPaciente: ping(c.pacienteId),
    encerradaPeloBotao: !!encerrada,
  });
  return gravarClassificacao(c, cl);
}

const selectAvaliada = {
  id: true,
  pacienteId: true,
  medicoId: true,
  especialidade: true,
  status: true,
  pago: true,
  dataInicio: true,
  updatedAt: true,
} as const;

/**
 * Filtro das consultas que já passaram da carência e ainda não têm desfecho
 * de presença (exportado para o teste). Mesmos limites para médico, paciente
 * e sala: INICIO_DETECCAO, JANELA_RETROATIVA_DIAS e STATUS_AVALIAVEIS.
 */
export function filtroPendentes(agora: Date) {
  const limiteRecente = new Date(agora.getTime() - JANELA_RETROATIVA_DIAS * 86_400_000);
  return {
    status: { in: STATUS_AVALIAVEIS },
    dataInicio: {
      gte: limiteRecente > INICIO_DETECCAO ? limiteRecente : INICIO_DETECCAO,
      lte: new Date(agora.getTime() - CARENCIA_APOS_INICIO_MIN * 60_000),
    },
    eventos: { none: { tipo: { in: ["falta_paciente", "falha_tecnica"] } } },
  };
}

/** Uma consulta (chamado pela sala de teleconsulta). Devolve o evento gravado ou null. */
export async function verificarPresencaConsulta(consultaId: string, agora: Date = new Date()) {
  const c = await db.consulta.findFirst({ where: { id: consultaId, ...filtroPendentes(agora) }, select: selectAvaliada });
  if (!c) return null;
  return avaliarConsulta(c, agora);
}

/** Dono das consultas avaliadas no bootstrap (ids de User — Consulta.medicoId/pacienteId apontam para User.id). */
export type DonoConsultas = { medicoId: string } | { pacienteId: string };

/** Consultas passadas de um médico OU de um paciente (até MAX_POR_CHAMADA por chamada). */
async function verificarPresencasDe(dono: DonoConsultas, agora: Date) {
  const lista = await db.consulta.findMany({
    where: { ...dono, ...filtroPendentes(agora) },
    select: selectAvaliada,
    orderBy: { dataInicio: "asc" },
    take: MAX_POR_CHAMADA,
  });
  const gravados: { consultaId: string; tipo: string }[] = [];
  for (const c of lista) {
    const tipo = await avaliarConsulta(c, agora);
    if (tipo) gravados.push({ consultaId: c.id, tipo });
  }
  return gravados;
}

/** Consultas passadas do médico (chamado pelo bootstrap da sessão do médico). */
export async function verificarPresencasDoMedico(medicoId: string, agora: Date = new Date()) {
  return verificarPresencasDe({ medicoId }, agora);
}

/**
 * Consultas passadas do paciente (chamado pelo bootstrap da sessão do
 * paciente): se o médico não abrir mais o app, o paciente ainda vê o
 * desfecho (falta / falha técnica) na mesma requisição.
 */
export async function verificarPresencasDoPaciente(pacienteId: string, agora: Date = new Date()) {
  return verificarPresencasDe({ pacienteId }, agora);
}

/* Throttle por instância para a sala (heartbeat a cada ~1,5 s). */
const ultimaVerificacao = new Map<string, number>();
const INTERVALO_SALA_MS = 60_000;

/**
 * Versão "segura" para rotas compartilhadas: no máximo uma vez por minuto por
 * consulta (por instância) e NUNCA lança — erro vira log e a rota segue.
 */
export async function verificarPresencaConsultaSemFalhar(consultaId: string) {
  const agora = Date.now();
  const ultima = ultimaVerificacao.get(consultaId) ?? 0;
  if (agora - ultima < INTERVALO_SALA_MS) return;
  ultimaVerificacao.set(consultaId, agora);
  if (ultimaVerificacao.size > 500) {
    for (const [id, t] of ultimaVerificacao) if (agora - t > INTERVALO_SALA_MS) ultimaVerificacao.delete(id);
  }
  try {
    await verificarPresencaConsulta(consultaId);
  } catch (e) {
    console.error("[presenca-consulta] falha ao verificar a presença da consulta", consultaId, e);
  }
}

/** Idem para o bootstrap do médico. */
export async function verificarPresencasDoMedicoSemFalhar(medicoId: string) {
  try {
    await verificarPresencasDoMedico(medicoId);
  } catch (e) {
    console.error("[presenca-consulta] falha ao verificar as presenças do médico", medicoId, e);
  }
}

/** Idem para o bootstrap do paciente. Nunca lança. */
export async function verificarPresencasDoPacienteSemFalhar(pacienteId: string) {
  try {
    await verificarPresencasDoPaciente(pacienteId);
  } catch (e) {
    console.error("[presenca-consulta] falha ao verificar as presenças do paciente", pacienteId, e);
  }
}
