import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { topicoNotificacoesUsuario } from "@/lib/server/usuario-canal";
import { enviarPushParaUsuario, pushAtivo, SEM_INSCRICAO, type Urgencia } from "@/lib/server/web-push";
import { SALA_ABRE_ANTES_MIN } from "@/lib/janela-sala";
import { STATUS_AVALIAVEIS } from "@/lib/server/presenca-consulta";
import { ESPERA_FALTA_MIN, SINAL_PARADO_MS } from "@/components/bion/medico/metricas";
import { STATUS_ABERTOS, TIPOS_EVENTO_DESFECHO, EVENTO_VIGENTE } from "@/lib/server/financeiro";
import { consultaSemDesfecho } from "@/lib/server/repasse";

/* ------------------------------------------------------------------ */
/* Toque da consulta (PR 7 do plano teleconsulta-v2 — Admin).            */
/*                                                                      */
/* Job chamado a cada minuto (pg_cron + pg_net → /api/cron/toque):       */
/*  1. linhas `tocando` com expiraEm no passado → `expirada` e evento     */
/*     `chamada_expirada` { consultaId, tentativa, em, ultima } ao dono;  */
/*  2. consultas que ainda "iam acontecer" cujo horário chegou há no      */
/*     máximo ESPERA_FALTA_MIN (15 min, a janela da falta): para o        */
/*     paciente e o médico que NÃO entraram na sala e não atenderam nem   */
/*     recusaram, abre a próxima tentativa (1..3) — toca 2 min e repete    */
/*     a cada 5 (a próxima sai 3 min depois de a anterior expirar);       */
/*     INSERT … ON CONFLICT DO NOTHING: só quem inseriu envia; o médico   */
/*     que está em OUTRA sala (sinal há até 30 s) fica para o minuto       */
/*     seguinte, sem linha;                                               */
/*  3. `chamada_tocando` { consultaId, contraparte, especialidade,        */
/*     inicioEm, expiraEm, tentativa } no tópico PRIVADO de notificações  */
/*     do usuário (#53) + Web Push { tipo, consultaId, tentativa,         */
/*     inicioEm, expiraEm, url, titulo, corpo:"" } com texto genérico     */
/*     (decisão do Alisson: sem nome nem especialidade na tela            */
/*     bloqueada). inicioEm = horário MARCADO da consulta (ISO).          */
/* `chamada_atendida`/`chamada_recusada` são da rota do Pacientes          */
/* (POST /api/telemedicina/[consultaId]/chamada), não daqui.               */
/* A FALTA continua definida pela presença na sala, não pelo toque.       */
/* Idempotente (trava única + UPDATE condicionado), tempo limitado e log  */
/* só com contagens.                                                      */
/* ------------------------------------------------------------------ */

export const TOQUE_DURACAO_MS = 2 * 60_000;
export const TOQUE_INTERVALO_MS = 5 * 60_000; // de um toque ao próximo
export const TOQUE_PAUSA_MS = TOQUE_INTERVALO_MS - TOQUE_DURACAO_MS; // 3 min depois de expirar
export const TOQUE_MAX_TENTATIVAS = 3;
export const TOQUE_JANELA_MS = ESPERA_FALTA_MIN * 60_000;
export const TITULO_PUSH = "Sua consulta vai começar";
/** Corpo vazio: a tela de bloqueio mostra só o título (decisão do Alisson). */
export const CORPO_PUSH = "";
const MAX_CONSULTAS = 200;
const MAX_EXPIRAR = 500;
/**
 * Orçamento de uma rodada: menor que o timeout do pg_net (10 s, migração
 * 20261019a) e que o maxDuration da rota (10 s, plano Hobby). O que sobrar
 * fica para o minuto seguinte (`incompleto: true`).
 */
export const ORCAMENTO_MS = 7_000;
/**
 * Só começa um participante (INSERT + broadcast, que tem limite de 3 s em
 * broadcast.ts) se sobrar pelo menos isto do orçamento: assim a linha nunca
 * fica gravada `tocando` sem o broadcast, mesmo no pior caso. Sem orçamento,
 * não grava e o participante toca no minuto seguinte.
 */
export const RESERVA_PARTICIPANTE_MS = 3_500;
/** Limite de cada push: min(5 s, restante − 1 s); abaixo de 500 ms o push é pulado (fica só o Realtime). */
export const PUSH_MAX_MS = 5_000;
export const PUSH_MIN_MS = 500;
export const PUSH_MARGEM_MS = 1_000;
/** Reenvio do push só se faltarem pelo menos 20 s para o toque expirar. */
export const REENVIO_MIN_MS = 20_000;
/** Máximo de reenvios por rodada (os mais urgentes primeiro): cabe no orçamento junto com os toques novos. */
export const REENVIO_MAX = 50;
/**
 * Linha em "push" com tocouEm mais antigo que isto é ÓRFÃ: o "push" só é
 * reivindicado na rodada que criou a linha (tocouEm = agora daquela rodada) e
 * essa rodada termina em ORCAMENTO_MS (7 s). Passado o limite, a rodada morreu
 * (timeout da função, push cortado no prazo, processo congelado) e o reenvio
 * pode reivindicá-la.
 */
export const PUSH_ORFAO_MS = 15_000;

/*
 * Estado do push na linha, só com o campo `canal` que já existe (sem coluna nova):
 *   "realtime" → só o broadcast saiu; o push está livre (nunca tentado, pulado ou falhou);
 *   "push"     → push REIVINDICADO pela rodada que criou a linha (em
 *                andamento); com tocouEm há mais de PUSH_ORFAO_MS é órfão e
 *                o reenvio pode reivindicá-lo;
 *   "reenvio"  → reenvio reivindicado (no máximo um por toque: com 2 min de
 *                toque e o corte de 20 s, só cabe uma rodada de reenvio);
 *   "ambos"    → algum aparelho aceitou (pushEnviado = true);
 *   "sem_inscricao" → o usuário não tem nenhum aparelho inscrito: não tenta
 *                de novo (nem reenvio). Só o toque.ts lê `canal`.
 * A reivindicação é um UPDATE condicionado (count === 1): duas rodadas
 * sobrepostas nunca mandam o mesmo push duas vezes.
 */

type Corrida<T> = { cortado: false; valor: T } | { cortado: true };
/** Promise.race contra o prazo absoluto: nada da fase de push passa de `prazo`. */
async function comPrazo<T>(p: Promise<T>, prazo: number): Promise<Corrida<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<Corrida<T>>((resolve) => {
    timer = setTimeout(() => resolve({ cortado: true }), Math.max(0, prazo - Date.now()));
  });
  try {
    return await Promise.race([p.then((valor) => ({ cortado: false as const, valor })), limite]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Payload cifrado do push (contrato com o service worker do Pacientes). O
 * mesmo para o envio e o reenvio: sem nome nem especialidade; corpo vazio.
 */
export function payloadPush(consultaId: string, tentativa: number, inicio: Date, expiraEm: Date): Record<string, unknown> {
  return {
    tipo: "chamada_tocando",
    consultaId,
    tentativa,
    inicioEm: inicio.toISOString(),
    expiraEm: expiraEm.toISOString(),
    url: `/consulta?consulta=${encodeURIComponent(consultaId)}`,
    titulo: TITULO_PUSH,
    corpo: CORPO_PUSH,
  };
}
/**
 * Folga nas comparações de tempo: o pg_cron dispara alguns décimos (ou
 * segundos) antes ou depois do minuto cheio. Sem folga, um disparo 0,3 s
 * adiantado empurra a expiração para o minuto seguinte e o ritmo vira 0/6/12.
 */
export const TOQUE_FOLGA_MS = 5_000;

/** Horário "nominal" da tentativa n: horário da consulta + (n-1) × 5 min (0/5/10). */
export const horarioTentativa = (dataInicio: Date, tentativa: number) =>
  dataInicio.getTime() + (tentativa - 1) * TOQUE_INTERVALO_MS;

/**
 * expiraEm da tentativa: ancorado no horário nominal quando o cron disparou
 * perto dele (±folga), para a variação de um minuto não somar no seguinte;
 * se o job atrasou mais que isso (ficou fora do ar), conta a partir de agora.
 */
export function expiraEmTentativa(agora: Date, dataInicio: Date, tentativa: number): Date {
  const nominal = horarioTentativa(dataInicio, tentativa);
  const base = Math.abs(agora.getTime() - nominal) <= TOQUE_FOLGA_MS ? nominal : agora.getTime();
  return new Date(base + TOQUE_DURACAO_MS);
}

export type Papel = "paciente" | "medico";
export type EventoToque = "chamada_tocando" | "chamada_expirada";
export type DependenciasToque = {
  /** Broadcast no tópico privado de notificações do usuário. */
  enviarEvento?: (usuarioId: string, evento: EventoToque, payload: Record<string, unknown>) => Promise<void>;
  /** Web Push para os aparelhos do usuário; null = desligado, número = aceitos, SEM_INSCRICAO = nenhum aparelho. */
  enviarPush?: (
    usuarioId: string,
    payload: Record<string, unknown>,
    /** prazo = instante absoluto (ms) em que a rodada termina; timeoutMs = limite do POST ao serviço. */
    opcoes: { ttl: number; urgencia: Urgencia; timeoutMs: number; prazo: number },
  ) => Promise<number | null | typeof SEM_INSCRICAO>;
};

const eventoPadrao: NonNullable<DependenciasToque["enviarEvento"]> = (usuarioId, evento, payload) =>
  broadcastCanal(topicoNotificacoesUsuario(usuarioId), evento, payload, { privado: true });

/** "Maria Clara Souza" → "Maria". */
export function primeiroNome(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "Paciente";
}

/** "Dr. João Silva" / "Dra. Ana" / "João Silva" → "Dr(a). João Silva". */
export function rotuloMedico(nome: string): string {
  const limpo = (nome ?? "").trim().replace(/^(dr|dra|dr\(a\))\.?\s+/i, "").trim();
  return `Dr(a). ${limpo || "BION"}`;
}

type ChamadaMin = { tentativa: number; status: string; expiraEm: Date };

/**
 * Regra PURA da próxima tentativa para UM participante (testada em
 * scripts/teste_toque.ts). null = não toca agora.
 */
export function proximaTentativa(p: {
  agora: Date;
  dataInicio: Date;
  /** Entrou na sala desde a abertura (PresencaSala). */
  entrouNaSala: boolean;
  chamadas: ChamadaMin[];
}): number | null {
  const agora = p.agora.getTime();
  const inicio = p.dataInicio.getTime();
  if (agora < inicio - TOQUE_FOLGA_MS || agora > inicio + TOQUE_JANELA_MS + TOQUE_FOLGA_MS) return null;
  if (p.entrouNaSala) return null;
  // Atendeu ou recusou QUALQUER tentativa desta consulta (gravado pela rota do
  // Pacientes, POST /api/telemedicina/[consultaId]/chamada): não toca mais para ele.
  if (p.chamadas.some((c) => c.status === "atendida" || c.status === "recusada")) return null;
  if (p.chamadas.length === 0) return 1;
  const ultima = p.chamadas.reduce((a, b) => (b.tentativa > a.tentativa ? b : a));
  if (ultima.tentativa >= TOQUE_MAX_TENTATIVAS) return null;
  if (ultima.status !== "expirada") return null; // ainda tocando
  if (agora - ultima.expiraEm.getTime() < TOQUE_PAUSA_MS - TOQUE_FOLGA_MS) return null;
  return ultima.tentativa + 1;
}

/** Bearer CRON_SECRET em tempo constante (mesma regra do fechar-repasses). null = segredo não configurado. */
export function autorizadoCron(req: { headers: Headers }, segredoEnv = process.env.CRON_SECRET): boolean | null {
  const segredo = segredoEnv?.trim();
  if (!segredo) return null;
  const recebido = req.headers.get("authorization") ?? "";
  const a = crypto.createHash("sha256").update(`Bearer ${segredo}`).digest();
  const b = crypto.createHash("sha256").update(recebido).digest();
  return crypto.timingSafeEqual(a, b);
}

export type ResultadoToque = {
  expiradas: number;
  tocadas: number;
  /** Participantes com pelo menos um aparelho que aceitou o push. */
  push: number;
  /** Pushes pulados por falta de orçamento (a linha e o broadcast ficam). */
  pushPulados: number;
  consultas: number;
  /** Pushes reenviados (reivindicados por esta rodada) de toques anteriores ainda tocando. */
  reenvios: number;
  /** Pushes que não terminaram até o prazo absoluto da rodada (cortados pelo Promise.race). */
  pushCortados: number;
  /** Pushes não enviados porque o usuário não tem aparelho inscrito (linha marcada "sem_inscricao"). */
  semInscricao: number;
  /** Toques ao médico adiados porque ele está atendendo outra consulta. */
  medicoOcupado: number;
  /**
   * Toques ao médico pulados porque ele tem uma Evolução em rascunho de OUTRA
   * consulta (mesmo critério do medicoLivreAgora e da Fila do admin). O
   * paciente toca normalmente (a espera de 10 min começa); o médico volta a
   * ser chamado nas tentativas seguintes quando concluir a evolução.
   */
  medicoEvolucaoPendente: number;
  /** Sobrou trabalho para o minuto seguinte (orçamento acabou). */
  incompleto: boolean;
};

export async function rodarToque(agora: Date = new Date(), dep: DependenciasToque = {}): Promise<ResultadoToque> {
  const t0 = Date.now();
  const enviarEvento = dep.enviarEvento ?? eventoPadrao;
  const enviarPush = dep.enviarPush ?? ((u, payload, o) => enviarPushParaUsuario(u, payload, o));
  const pushLigado = dep.enviarPush !== undefined || pushAtivo();
  /** Prazo ABSOLUTO da rodada: toda a fase de push (inscrições, fila do pool, POSTs) termina antes dele. */
  const prazo = t0 + ORCAMENTO_MS;
  const r: ResultadoToque = { expiradas: 0, tocadas: 0, push: 0, pushPulados: 0, reenvios: 0, pushCortados: 0, semInscricao: 0, consultas: 0, medicoOcupado: 0, medicoEvolucaoPendente: 0, incompleto: false };
  const restante = () => ORCAMENTO_MS - (Date.now() - t0);
  /** Cabe mais um passo "grava + broadcast"? Conferido ANTES de cada UPDATE/INSERT. */
  const cabeParticipante = () => restante() >= RESERVA_PARTICIPANTE_MS;

  /* 1. Expira o que passou do tempo. O UPDATE condicionado a status=tocando
        garante um único evento mesmo com duas execuções ao mesmo tempo. */
  const vencidas = await db.chamadaConsulta.findMany({
    // Folga: um disparo do cron um pouco adiantado já expira o toque deste minuto.
    where: { status: "tocando", expiraEm: { lte: new Date(agora.getTime() + TOQUE_FOLGA_MS) } },
    select: { id: true, consultaId: true, paraUsuarioId: true, tentativa: true, expiraEm: true },
    orderBy: { expiraEm: "asc" },
    take: MAX_EXPIRAR,
  });
  for (const v of vencidas) {
    if (!cabeParticipante()) { r.incompleto = true; break; }
    const u = await db.chamadaConsulta.updateMany({ where: { id: v.id, status: "tocando" }, data: { status: "expirada" } });
    if (u.count !== 1) continue;
    r.expiradas++;
    await enviarEvento(v.paraUsuarioId, "chamada_expirada", {
      consultaId: v.consultaId,
      tentativa: v.tentativa,
      em: v.expiraEm.toISOString(),
      ultima: v.tentativa >= TOQUE_MAX_TENTATIVAS,
    });
  }

  /* 2. Consultas cujo horário chegou há no máximo 15 min. */
  const consultas = await db.consulta.findMany({
    where: {
      status: { in: STATUS_AVALIAVEIS },
      dataInicio: {
        lte: new Date(agora.getTime() + TOQUE_FOLGA_MS),
        gte: new Date(agora.getTime() - TOQUE_JANELA_MS - TOQUE_FOLGA_MS),
      },
    },
    select: {
      id: true,
      pacienteId: true,
      medicoId: true,
      especialidade: true,
      dataInicio: true,
      paciente: { select: { nome: true, role: true } },
      medico: { select: { nome: true, role: true } },
      presencasSala: { select: { usuarioId: true, ultimoPing: true } },
      chamadas: { select: { paraUsuarioId: true, tentativa: true, status: true, expiraEm: true } },
    },
    orderBy: { dataInicio: "asc" },
    take: MAX_CONSULTAS,
  });
  r.consultas = consultas.length;

  /* 3. Grava e avisa pelo Realtime, um participante por vez, enquanto couber
        no orçamento; os pushes ficam para o fim, todos em paralelo. */
  // Médico atendendo OUTRA consulta agora (sinal na sala há até SINAL_PARADO_MS,
  // a mesma janela de "presente" da presença): não toca nem grava linha; tenta
  // de novo no minuto seguinte, dentro da janela de 15 min. O paciente toca normal.
  const ocupados = new Map<string, Set<string>>(); // medicoId → consultas com presença recente
  const medicoIds = [...new Set(consultas.map((c) => c.medicoId))];
  if (medicoIds.length) {
    const ativos = await db.presencaSala.findMany({
      where: { usuarioId: { in: medicoIds }, ultimoPing: { gte: new Date(agora.getTime() - SINAL_PARADO_MS) } },
      select: { usuarioId: true, consultaId: true },
    });
    for (const a of ativos) {
      if (!ocupados.has(a.usuarioId)) ocupados.set(a.usuarioId, new Set());
      ocupados.get(a.usuarioId)!.add(a.consultaId);
    }
  }
  const medicoEmOutraSala = (medicoId: string, consultaId: string) =>
    [...(ocupados.get(medicoId) ?? [])].some((id) => id !== consultaId);
  // Médico com Evolução em rascunho de OUTRA consulta: não toca para ele nem
  // grava a linha dele (a do paciente segue normal, para a espera começar).
  // O rascunho da PRÓPRIA consulta não bloqueia.
  const rascunhos = new Map<string, Set<string>>(); // medicoId → consultas com evolução em rascunho
  if (medicoIds.length) {
    const evs = await db.evolucao.findMany({
      where: { medicoId: { in: medicoIds }, status: "rascunho" },
      select: { medicoId: true, consultaId: true },
    });
    for (const e of evs) {
      if (!rascunhos.has(e.medicoId)) rascunhos.set(e.medicoId, new Set());
      rascunhos.get(e.medicoId)!.add(e.consultaId);
    }
  }
  const medicoComEvolucaoPendente = (medicoId: string, consultaId: string) =>
    [...(rascunhos.get(medicoId) ?? [])].some((id) => id !== consultaId);

  type PushPendente = {
    id?: string;
    consultaId: string;
    usuarioId: string;
    tentativa: number;
    expiraEm: Date;
    payload: Record<string, unknown>;
    reenvio: boolean;
  };
  const pendentes: PushPendente[] = [];

  // Reenvio: toque de rodada anterior ainda `tocando` cujo push não chegou a
  // nenhum aparelho (falhou, foi cortado ou pulado por orçamento). Payload
  // IDÊNTICO ao original (mesma tentativa, expiraEm e inicioEm — o service
  // worker deduplica por consultaId:tentativa); sem novo broadcast; pula se
  // faltar menos de REENVIO_MIN_MS para expirar.
  // Só linhas com o push livre ("realtime") ou órfão ("push" há mais de PUSH_ORFAO_MS);
  // "reenvio", "ambos" e "sem_inscricao" ficam fora. Até REENVIO_MAX, as que expiram antes primeiro.
  const reenviavel = {
    canal: { in: ["realtime", "push"] },
    tocouEm: { lt: new Date(agora.getTime() - PUSH_ORFAO_MS) },
  };
  const reenvios = !pushLigado
    ? []
    : await db.chamadaConsulta.findMany({
        where: {
          status: "tocando",
          pushEnviado: false,
          ...reenviavel,
          expiraEm: { gte: new Date(agora.getTime() + REENVIO_MIN_MS) },
          consulta: { status: { in: STATUS_AVALIAVEIS } },
        },
        select: { id: true, consultaId: true, paraUsuarioId: true, tentativa: true, expiraEm: true, consulta: { select: { dataInicio: true } } },
        orderBy: { expiraEm: "asc" },
        take: REENVIO_MAX,
      });
  for (const l of reenvios) {
    pendentes.push({
      id: l.id,
      reenvio: true,
      consultaId: l.consultaId,
      usuarioId: l.paraUsuarioId,
      tentativa: l.tentativa,
      expiraEm: l.expiraEm,
      payload: payloadPush(l.consultaId, l.tentativa, l.consulta.dataInicio, l.expiraEm),
    });
  }
  consultas: for (const c of consultas) {
    const abriu = c.dataInicio.getTime() - SALA_ABRE_ANTES_MIN * 60_000;
    // Nunca toca para ADMIN (o admin não entra na chamada — LGPD), mesmo em dado inconsistente.
    const participantes = (
      [
        { usuarioId: c.pacienteId, papel: "paciente", contraparte: rotuloMedico(c.medico.nome), role: c.paciente.role },
        { usuarioId: c.medicoId, papel: "medico", contraparte: primeiroNome(c.paciente.nome), role: c.medico.role },
      ] as { usuarioId: string; papel: Papel; contraparte: string; role: string }[]
    ).filter((p) => p.role !== "ADMIN");
    for (const p of participantes) {
      const tentativa = proximaTentativa({
        agora,
        dataInicio: c.dataInicio,
        entrouNaSala: c.presencasSala.some((x) => x.usuarioId === p.usuarioId && x.ultimoPing.getTime() >= abriu),
        chamadas: c.chamadas.filter((x) => x.paraUsuarioId === p.usuarioId),
      });
      if (tentativa === null) continue;
      if (p.papel === "medico" && medicoEmOutraSala(p.usuarioId, c.id)) { r.medicoOcupado++; continue; }
      if (p.papel === "medico" && medicoComEvolucaoPendente(p.usuarioId, c.id)) { r.medicoEvolucaoPendente++; continue; }
      // Orçamento ANTES do INSERT: sem tempo para o broadcast, não grava (toca no minuto seguinte).
      if (!cabeParticipante()) { r.incompleto = true; break consultas; }
      const expiraEm = expiraEmTentativa(agora, c.dataInicio, tentativa);
      // ON CONFLICT DO NOTHING na trava (consultaId, paraUsuarioId, tentativa): só quem inseriu envia.
      const ins = await db.chamadaConsulta.createMany({
        data: [{ consultaId: c.id, paraUsuarioId: p.usuarioId, papel: p.papel, tentativa, tocouEm: agora, expiraEm }],
        skipDuplicates: true,
      });
      if (ins.count !== 1) continue;
      r.tocadas++;
      await enviarEvento(p.usuarioId, "chamada_tocando", {
        consultaId: c.id,
        contraparte: p.contraparte,
        especialidade: c.especialidade,
        inicioEm: c.dataInicio.toISOString(),
        expiraEm: expiraEm.toISOString(),
        tentativa,
      });
      // Push: contrato combinado com o Pacientes (service worker do PR 5/8). Sem nome nem especialidade.
      pendentes.push({
        reenvio: false,
        consultaId: c.id,
        usuarioId: p.usuarioId,
        tentativa,
        expiraEm,
        payload: payloadPush(c.id, tentativa, c.dataInicio, expiraEm),
      });
    }
  }

  /* 4. Pushes em paralelo contra o PRAZO ABSOLUTO (t0 + ORCAMENTO_MS): cada
        um reivindica a linha (UPDATE condicionado), tem AbortSignal de
        min(5 s, prazo − agora − 1 s) no fetch e corre contra um timer do
        prazo (Promise.race) — nem o findMany das inscrições nem a fila do
        pool passam do prazo. Restante < 500 ms: pula (registra; não desfaz
        a linha nem o broadcast). */
  if (!pushLigado) {
    // Sem VAPID: nada a enviar (o toque segue só pelo Realtime).
  } else if (pendentes.length) {
    const linhaDe = (pp: PushPendente) =>
      pp.id ? { id: pp.id } : { consultaId: pp.consultaId, paraUsuarioId: pp.usuarioId, tentativa: pp.tentativa };
    const umPush = async (pp: PushPendente): Promise<"ok" | "falhou" | "pulado" | "ocupado" | "sem_inscricao"> => {
      if (prazo - Date.now() - PUSH_MARGEM_MS < PUSH_MIN_MS) return "pulado";
      // Reivindica: só uma rodada envia cada push (e cada reenvio). O original
      // (linha recém-criada NESTA rodada) só sai de "realtime"; o reenvio pega
      // "realtime" ou "push" órfão, com as mesmas condições do findMany.
      const dono = await db.chamadaConsulta.updateMany({
        where: pp.reenvio
          ? {
              ...linhaDe(pp),
              ...reenviavel,
              status: "tocando",
              pushEnviado: false,
              expiraEm: { gte: new Date(agora.getTime() + REENVIO_MIN_MS) },
            }
          : { ...linhaDe(pp), status: "tocando", pushEnviado: false, canal: "realtime" },
        data: { canal: pp.reenvio ? "reenvio" : "push" },
      });
      if (dono.count !== 1) return "ocupado";
      const timeoutMs = Math.min(PUSH_MAX_MS, prazo - Date.now() - PUSH_MARGEM_MS);
      if (timeoutMs < PUSH_MIN_MS) {
        // Sem tempo depois de reivindicar: devolve a linha (o original fica reenviável).
        if (!pp.reenvio) await db.chamadaConsulta.updateMany({ where: { ...linhaDe(pp), canal: "push" }, data: { canal: "realtime" } });
        return "pulado";
      }
      const ttl = Math.max(0, Math.floor((pp.expiraEm.getTime() - agora.getTime() - (Date.now() - t0)) / 1000));
      const aceitos = await enviarPush(pp.usuarioId, pp.payload, { ttl, urgencia: "high", timeoutMs, prazo }).catch(() => 0);
      if (aceitos === SEM_INSCRICAO) {
        // Nenhum aparelho inscrito: marca e NÃO volta para "realtime" (o reenvio não a pega de novo).
        await db.chamadaConsulta.updateMany({ where: { ...linhaDe(pp), canal: { in: ["push", "reenvio"] } }, data: { canal: SEM_INSCRICAO } });
        return "sem_inscricao";
      }
      if (aceitos) {
        await db.chamadaConsulta.updateMany({ where: linhaDe(pp), data: { pushEnviado: true, canal: "ambos" } });
        return "ok";
      }
      // O original que falhou volta a ficar livre para UM reenvio na rodada seguinte.
      if (!pp.reenvio) await db.chamadaConsulta.updateMany({ where: { ...linhaDe(pp), canal: "push" }, data: { canal: "realtime" } });
      return "falhou";
    };
    const res = await Promise.all(
      pendentes.map(async (pp) => {
        const x = await comPrazo(umPush(pp).catch(() => "falhou" as const), prazo);
        return { pp, x: x.cortado ? ("cortado" as const) : x.valor };
      }),
    );
    for (const { pp, x } of res) {
      if (x === "ok") r.push++;
      if (x === "pulado") r.pushPulados++;
      if (x === "cortado") r.pushCortados++;
      if (x === "sem_inscricao") r.semInscricao++;
      if (pp.reenvio && x !== "ocupado" && x !== "pulado") r.reenvios++;
    }
    if (r.pushPulados) console.warn("[Toque] push pulado: sem orçamento", { pulados: r.pushPulados });
    if (r.pushCortados) console.warn("[Toque] push cortado no prazo da rodada", { cortados: r.pushCortados });
  }

  console.info("[Toque] rodada", { ...r, ms: Date.now() - t0 });
  return r;
}

/* ---------------- Fila do admin: chamadas não atendidas ---------------- */

export type NaoAtendeu = { papel: Papel; nome: string; motivo: "recusada" | "expirada"; em: string };
export type ChamadaNaoAtendida = {
  consultaId: string;
  dataInicio: string;
  medico: string;
  paciente: string;
  especialidade: string;
  quem: NaoAtendeu[];
};

/** Um participante "não atendeu" quando recusou ou deixou expirar a 3ª tentativa. Pura. */
export function naoAtendeu(chamadas: (ChamadaMin & { respondidaEm?: Date | null })[]): { motivo: "recusada" | "expirada"; em: Date } | null {
  if (chamadas.some((c) => c.status === "atendida")) return null;
  const recusa = chamadas.find((c) => c.status === "recusada");
  if (recusa) return { motivo: "recusada", em: recusa.respondidaEm ?? recusa.expiraEm };
  const ultima = chamadas.find((c) => c.tentativa >= TOQUE_MAX_TENTATIVAS && c.status === "expirada");
  return ultima ? { motivo: "expirada", em: ultima.expiraEm } : null;
}

/**
 * Consultas das últimas `horas` (24 h) em que alguém não atendeu o toque (e
 * não entrou na sala daquela consulta) e
 * que ainda não têm desfecho (depois de 24 h sem desfecho, a consulta já
 * aparece em "Sem desfecho"). Mais recentes primeiro.
 */
export async function listarChamadasNaoAtendidas(agora: Date = new Date(), horas = 24, limite = 200): Promise<ChamadaNaoAtendida[]> {
  const linhas = await db.consulta.findMany({
    where: {
      status: { in: STATUS_ABERTOS },
      dataInicio: { gte: new Date(agora.getTime() - horas * 3_600_000), lte: agora },
      chamadas: { some: { OR: [{ status: "recusada" }, { status: "expirada", tentativa: { gte: TOQUE_MAX_TENTATIVAS } }] } },
    },
    orderBy: { dataInicio: "desc" },
    take: Math.min(Math.max(limite, 1), 500),
    select: {
      id: true,
      pacienteId: true,
      medicoId: true,
      especialidade: true,
      dataInicio: true,
      status: true,
      paciente: { select: { nome: true } },
      medico: { select: { nome: true } },
      eventos: { where: { tipo: { in: TIPOS_EVENTO_DESFECHO }, ...EVENTO_VIGENTE }, select: { id: true, tipo: true, motivo: true, em: true, dataAnterior: true, corrigidoEm: true } },
      chamadas: { select: { paraUsuarioId: true, tentativa: true, status: true, expiraEm: true, respondidaEm: true } },
      presencasSala: { select: { usuarioId: true, ultimoPing: true } },
    },
  });
  const out: ChamadaNaoAtendida[] = [];
  for (const l of linhas) {
    if (!consultaSemDesfecho(l)) continue;
    // Quem entrou na sala desta consulta (desde a abertura) não "deixou de
    // atender", mesmo que o 3º toque tenha expirado sozinho (entrou durante o
    // toque sem tocar em "atender"): a linha fica `expirada`, mas não conta aqui.
    const abriu = l.dataInicio.getTime() - SALA_ABRE_ANTES_MIN * 60_000;
    const entrou = (usuarioId: string) => l.presencasSala.some((x) => x.usuarioId === usuarioId && x.ultimoPing.getTime() >= abriu);
    const quem: NaoAtendeu[] = [];
    for (const [papel, usuarioId, nome] of [
      ["paciente", l.pacienteId, l.paciente.nome],
      ["medico", l.medicoId, l.medico.nome],
    ] as const) {
      if (entrou(usuarioId)) continue;
      const n = naoAtendeu(l.chamadas.filter((c) => c.paraUsuarioId === usuarioId));
      if (n) quem.push({ papel, nome, motivo: n.motivo, em: n.em.toISOString() });
    }
    if (!quem.length) continue;
    out.push({
      consultaId: l.id,
      dataInicio: l.dataInicio.toISOString(),
      medico: l.medico.nome,
      paciente: l.paciente.nome,
      especialidade: l.especialidade,
      quem,
    });
  }
  return out;
}
