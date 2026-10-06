import "server-only";
import { db } from "@/lib/db";
import { quandoClinica } from "@/lib/server/fuso";
import { aplicarFalhaTecnica, registrarEvento } from "@/lib/server/financeiro";
import { REEMBOLSO_MANUAL_PRAZO_DIAS } from "@/lib/server/dados";
import { SALA_FECHA_DEPOIS_MIN } from "@/lib/janela-sala";
import { medicoEsperouAteOLimite, SINAL_PARADO_MS, type PresencaRegra } from "@/components/bion/medico/metricas";

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
/*  - falta do médico (regra aprovada pelo Alisson): o paciente entrou e */
/*    o médico nunca entrou, em consulta PAGA → mesmo tratamento da      */
/*    falha técnica: aplicarFalhaTecnica com motivo "falta_medico"       */
/*    (evento tipo falha_tecnica, motivo falta_medico). Não paga: nada.  */
/* Os dois eventos nunca convivem na mesma consulta.                     */
/*                                                                      */
/* Desfecho MANUAL (regras do Alisson, 06/10/2026): o médico também     */
/* marca falta do paciente / falha técnica pela sala ou pela agenda      */
/* (POST /api/medico/consultas/[id]/desfecho), pela MESMA gravação daqui */
/* (gravarDesfecho), com por = "medico". O sistema nunca grava por cima  */
/* de um desfecho que já existe — manual ou não — e o médico também não. */
/* A presença guarda a ENTRADA da sessão atual (PresencaSala.entrouEm,   */
/* zera quando o sinal fica mais de 30 s parado) além do último sinal.   */
/* ------------------------------------------------------------------ */

/**
 * Carência depois do horário marcado: a decisão só sai quando a SALA já
 * fechou (janela única em lib/janela-sala.ts: a sala fica aberta até 2 h
 * depois do horário). Não existe duração de
 * consulta gravada no banco; esperar a sala fechar garante que um paciente
 * atrasado ainda pode entrar e que a classificação não muda depois.
 */
export const CARENCIA_APOS_INICIO_MIN = SALA_FECHA_DEPOIS_MIN;
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
  | { resultado: "falha_tecnica"; motivo: string }
  | { resultado: "falta_medico"; motivo: string };

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
  /** Entrada da última sessão do médico na sala (PresencaSala.entrouEm; null = linha antiga). */
  entrouEmMedico?: Date | null;
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
    // Mesma regra da falta marcada pelo médico (regra 1): ele precisa ter
    // ficado na sala até o horário + 15 min. Se saiu antes, não há falta nem
    // falha técnica automática: a consulta fica sem desfecho para o admin.
    const sessaoMedico: PresencaRegra = {
      entrouEm: p.entrouEmMedico?.getTime() ?? null,
      ultimoPing: p.ultimoPingMedico!.getTime(),
    };
    if (!medicoEsperouAteOLimite(inicio, sessaoMedico)) {
      return {
        resultado: "sem_evento",
        motivo: "O médico saiu da sala antes de 15 min do horário e o paciente não entrou: fica para o admin.",
      };
    }
    return { resultado: "falta_paciente", motivo: "O médico esperou na sala e o paciente não entrou." };
  }
  if (!medico && paciente) {
    // Falta do médico: mesmo tratamento da falha técnica, só em consulta paga
    // (não paga: nada a devolver nem remarcar — combinado com o Admin).
    if (!p.pago) return { resultado: "sem_evento", motivo: "Consulta não paga: o paciente esteve na sala e o médico não entrou." };
    return { resultado: "falta_medico", motivo: "O paciente esteve na sala e o médico não entrou." };
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

export type ConsultaAvaliada = {
  id: string;
  pacienteId: string;
  medicoId: string;
  especialidade: string;
  status: string;
  pago: boolean;
  dataInicio: Date;
  updatedAt: Date;
};

/** Desfecho gravado na consulta (evento falta_paciente ou falha_tecnica). */
export type Desfecho = "falta_paciente" | "falha_tecnica" | "falta_medico";

/** Quem grava: o sistema (presença, por = "sistema") ou o médico dono (por = "medico"). */
export type AutorDesfecho = { por: "sistema" } | { por: "medico"; id: string; nome: string };

const ROTULO_DESFECHO: Record<Desfecho, string> = {
  falta_paciente: "Falta do paciente",
  falha_tecnica: "Falha técnica",
  falta_medico: "Falta do médico",
};

/** Tipos de evento que encerram a questão "a consulta aconteceu?". */
export const TIPOS_DESFECHO = ["falta_paciente", "falha_tecnica"];

/** Auditoria do desfecho (aparece para o admin em /auditoria). */
function dadosAudit(c: ConsultaAvaliada, tipo: Desfecho, motivo: string, autor: AutorDesfecho) {
  const manual = autor.por === "medico";
  return {
    acao:
      tipo === "falta_paciente"
        ? "CONSULTA_FALTA_PACIENTE"
        : tipo === "falta_medico"
          ? "CONSULTA_FALTA_MEDICO"
          : "CONSULTA_FALHA_TECNICA",
    categoria: "consulta",
    severidade: "warning",
    usuarioId: manual ? autor.id : null,
    usuarioNome: manual ? autor.nome : "Sistema BION",
    role: manual ? "MEDICO" : "sistema",
    entidade: "consulta",
    entidadeId: c.id,
    detalhes: `${ROTULO_DESFECHO[tipo]} registrada ${manual ? "pelo médico" : "automaticamente"} — ${c.especialidade} (${quandoClinica(c.dataInicio)}). ${motivo}`,
  };
}

/**
 * Grava o desfecho, numa transação só. Usado pela verificação automática
 * (autor "sistema") e pela rota do médico (autor "medico"). Idempotente:
 * - trava a consulta com updateMany condicionado ao status e ao updatedAt
 *   lidos (outra requisição que mexeu nela no meio faz esta desistir);
 * - NUNCA grava por cima de um desfecho que já existe (falta_paciente OU
 *   falha_tecnica, de quem for): manual ou automático, o primeiro vale;
 * - falha técnica e falta do médico passam por aplicarFalhaTecnica
 *   (financeiro.ts, do Admin), que tem a própria checagem; a falta do médico
 *   grava evento falha_tecnica com motivo "falta_medico".
 * Devolve o desfecho gravado (e o novo status) ou null se nada foi gravado.
 */
export async function gravarDesfecho(
  c: ConsultaAvaliada,
  tipo: Desfecho,
  motivo: string,
  autor: AutorDesfecho = { por: "sistema" },
): Promise<{ tipo: Desfecho; status: string } | null> {
  try {
    return await db.$transaction(async (tx) => {
      const { count } = await tx.consulta.updateMany({
        where: { id: c.id, status: c.status, updatedAt: c.updatedAt },
        data: { status: c.status },
      });
      if (count === 0) throw new SemAlteracao();
      const jaTem = await tx.eventoConsulta.findFirst({
        where: { consultaId: c.id, tipo: { in: TIPOS_DESFECHO } },
        select: { id: true },
      });
      if (jaTem) throw new SemAlteracao();

      const atorId = autor.por === "medico" ? autor.id : null;
      let status = c.status;
      if (tipo === "falta_paciente") {
        await registrarEvento(tx, {
          consultaId: c.id,
          tipo: "falta_paciente",
          por: autor.por,
          atorId,
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
        const faltaMedico = tipo === "falta_medico";
        const r = await aplicarFalhaTecnica(tx, c.id, { motivo: faltaMedico ? "falta_medico" : "falha_tecnica" });
        if (!r) throw new SemAlteracao();
        status = r.status;
        if (autor.por === "medico") {
          // PROVISÓRIO até o PR do Admin: aplicarFalhaTecnica ainda grava
          // sempre por = "sistema". Corrige o autor do evento NA MESMA
          // transação; com o PR dele, vira aplicarFalhaTecnica(tx, id,
          // { motivo, por: "medico", atorId }) e estas linhas saem.
          await tx.eventoConsulta.update({ where: { id: r.evento.id }, data: { por: "medico", atorId } });
        }
        const causa = faltaMedico ? "porque o médico não entrou na sala" : "por falha técnica";
        await tx.notificacao.create({
          data: {
            tipo: "agenda",
            titulo: faltaMedico ? "O médico não compareceu" : "Falha técnica na consulta",
            texto:
              r.status === "aguardando_reagendamento"
                ? `A consulta de ${c.especialidade} (${quandoClinica(c.dataInicio)}) não pôde acontecer ${causa}. Escolha no app: remarcar sem custo ou reembolso integral.`
                : `A consulta de ${c.especialidade} (${quandoClinica(c.dataInicio)}) não pôde acontecer ${causa} e foi cancelada, sem custo.`,
            usuarioId: c.pacienteId,
          },
        });
      }
      await tx.auditLog.create({ data: dadosAudit(c, tipo, motivo, autor) });
      return { tipo, status };
    });
  } catch (e) {
    if (e instanceof SemAlteracao) return null;
    throw e;
  }
}

/** Grava (se for o caso) o evento da classificação automática. */
async function gravarClassificacao(c: ConsultaAvaliada, cl: Classificacao) {
  if (cl.resultado === "aguardar" || cl.resultado === "sem_evento") return null;
  const r = await gravarDesfecho(c, cl.resultado, cl.motivo, { por: "sistema" });
  return r ? r.tipo : null;
}

/** Presença de cada participante na sala (ms), para as regras de metricas.ts. */
export type PresencasConsulta = { medico: PresencaRegra; paciente: PresencaRegra };

/** Lê a presença (entrada da sessão atual + último sinal) do médico e do paciente da consulta. */
export async function lerPresencas(c: { id: string; medicoId: string; pacienteId: string }): Promise<PresencasConsulta> {
  const linhas = await db.presencaSala.findMany({
    where: { consultaId: c.id },
    select: { usuarioId: true, ultimoPing: true, entrouEm: true },
  });
  const de = (usuarioId: string): PresencaRegra => {
    const l = linhas.find((x) => x.usuarioId === usuarioId);
    return l ? { entrouEm: l.entrouEm?.getTime() ?? null, ultimoPing: l.ultimoPing.getTime() } : null;
  };
  return { medico: de(c.medicoId), paciente: de(c.pacienteId) };
}

/** A consulta já tem desfecho (evento falta_paciente / falha_tecnica)? Devolve o evento ou null. */
export async function desfechoExistente(consultaId: string) {
  return db.eventoConsulta.findFirst({
    where: { consultaId, tipo: { in: TIPOS_DESFECHO } },
    select: { id: true, tipo: true, motivo: true, por: true, atorId: true },
    orderBy: { em: "asc" },
  });
}

/** Lê a presença e grava (se for o caso) o evento de UMA consulta. */
async function avaliarConsulta(c: ConsultaAvaliada, agora: Date) {
  const [presencas, encerrada] = await Promise.all([
    lerPresencas(c),
    db.sinalSala.findFirst({
      where: { consultaId: c.id, tipo: "controle", payload: { contains: '"encerrada"' } },
      select: { id: true },
    }),
  ]);
  const data = (ms: number | null | undefined) => (ms == null ? null : new Date(ms));
  const cl = classificarPresenca({
    dataInicio: c.dataInicio,
    agora,
    pago: c.pago,
    ultimoPingMedico: data(presencas.medico?.ultimoPing),
    ultimoPingPaciente: data(presencas.paciente?.ultimoPing),
    entrouEmMedico: data(presencas.medico?.entrouEm),
    encerradaPeloBotao: !!encerrada,
  });
  return gravarClassificacao(c, cl);
}

export const selectAvaliada = {
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
    eventos: { none: { tipo: { in: TIPOS_DESFECHO } } },
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

/* ------------------------------------------------------------------ */
/* Heartbeat e limpeza da sala (usados por /api/telemedicina/[id]/sala) */
/* ------------------------------------------------------------------ */

/**
 * Entrada da sessão atual depois de um heartbeat (PURA, testada):
 * primeira vez, linha antiga sem entrada, ou sinal parado há mais de
 * SINAL_PARADO_MS → a sessão recomeça agora; senão mantém a entrada.
 */
export function entradaAposSinal(
  existente: { ultimoPing: Date; entrouEm: Date | null } | null,
  agora: Date,
): Date {
  if (!existente || !existente.entrouEm) return agora;
  if (agora.getTime() - existente.ultimoPing.getTime() > SINAL_PARADO_MS) return agora;
  return existente.entrouEm;
}

/** A consulta já tem desfecho: saiu dos status "ia acontecer" ou tem evento de falta/falha. */
export async function consultaTemDesfecho(consultaId: string): Promise<boolean> {
  const c = await db.consulta.findUnique({
    where: { id: consultaId },
    select: { status: true, eventos: { where: { tipo: { in: TIPOS_DESFECHO } }, select: { id: true }, take: 1 } },
  });
  if (!c) return true;
  return !STATUS_AVALIAVEIS.includes(c.status) || c.eventos.length > 0;
}

/**
 * Limpeza da sala: apaga sinais já consumidos com mais de 30 min. Enquanto a
 * consulta NÃO tem desfecho, guarda a presença (prova da espera / da entrada
 * do paciente) e o sinal de controle "encerrada" (a classificação automática
 * usa os dois). Com desfecho, também apaga as presenças paradas há mais de 1 h.
 */
export async function limparSala(consultaId: string, agora: Date = new Date()) {
  const temDesfecho = await consultaTemDesfecho(consultaId);
  const t = agora.getTime();
  await db.sinalSala.deleteMany({
    where: {
      consultaId,
      consumido: true,
      createdAt: { lt: new Date(t - 30 * 60 * 1000) },
      ...(temDesfecho ? {} : { NOT: { tipo: "controle", payload: { contains: '"encerrada"' } } }),
    },
  });
  if (temDesfecho) {
    await db.presencaSala.deleteMany({ where: { consultaId, ultimoPing: { lt: new Date(t - 60 * 60 * 1000) } } });
  }
  return { temDesfecho };
}
