import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { topicoNotificacoesUsuario } from "@/lib/server/usuario-canal";
import { enviarPushParaUsuario, type Urgencia } from "@/lib/server/web-push";
import { SALA_ABRE_ANTES_MIN } from "@/lib/janela-sala";
import { STATUS_AVALIAVEIS } from "@/lib/server/presenca-consulta";
import { ESPERA_FALTA_MIN } from "@/components/bion/medico/metricas";
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
/*     INSERT … ON CONFLICT DO NOTHING: só quem inseriu envia;            */
/*  3. `chamada_tocando` { consultaId, contraparte, especialidade,        */
/*     expiraEm, tentativa } no tópico PRIVADO de notificações do usuário */
/*     (#53) + Web Push com texto genérico (decisão do Alisson: sem nome  */
/*     nem especialidade na tela bloqueada).                              */
/* `chamada_atendida`/`chamada_recusada` são da rota do Pacientes          */
/* (POST /api/telemedicina/[id]/chamada), não daqui.                      */
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
export const CORPO_PUSH = "Toque para entrar na sala.";
const MAX_CONSULTAS = 200;
const MAX_EXPIRAR = 500;
const ORCAMENTO_MS = 20_000;

export type Papel = "paciente" | "medico";
export type EventoToque = "chamada_tocando" | "chamada_expirada";
export type DependenciasToque = {
  /** Broadcast no tópico privado de notificações do usuário. */
  enviarEvento?: (usuarioId: string, evento: EventoToque, payload: Record<string, unknown>) => Promise<void>;
  /** Web Push para os aparelhos do usuário; null = desligado, número = aceitos. */
  enviarPush?: (usuarioId: string, payload: Record<string, unknown>, opcoes: { ttl: number; urgencia: Urgencia }) => Promise<number | null>;
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
  if (agora < inicio || agora > inicio + TOQUE_JANELA_MS) return null;
  if (p.entrouNaSala) return null;
  // Atendeu ou recusou QUALQUER tentativa desta consulta (gravado pela rota do
  // Pacientes, POST /api/telemedicina/[id]/chamada): não toca mais para ele.
  if (p.chamadas.some((c) => c.status === "atendida" || c.status === "recusada")) return null;
  if (p.chamadas.length === 0) return 1;
  const ultima = p.chamadas.reduce((a, b) => (b.tentativa > a.tentativa ? b : a));
  if (ultima.tentativa >= TOQUE_MAX_TENTATIVAS) return null;
  if (ultima.status !== "expirada") return null; // ainda tocando
  if (agora - ultima.expiraEm.getTime() < TOQUE_PAUSA_MS) return null;
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

export type ResultadoToque = { expiradas: number; tocadas: number; push: number; consultas: number; incompleto: boolean };

export async function rodarToque(agora: Date = new Date(), dep: DependenciasToque = {}): Promise<ResultadoToque> {
  const t0 = Date.now();
  const enviarEvento = dep.enviarEvento ?? eventoPadrao;
  const enviarPush = dep.enviarPush ?? ((u, payload, o) => enviarPushParaUsuario(u, payload, o));
  const r: ResultadoToque = { expiradas: 0, tocadas: 0, push: 0, consultas: 0, incompleto: false };
  const dentroDoTempo = () => Date.now() - t0 < ORCAMENTO_MS;

  /* 1. Expira o que passou do tempo. O UPDATE condicionado a status=tocando
        garante um único evento mesmo com duas execuções ao mesmo tempo. */
  const vencidas = await db.chamadaConsulta.findMany({
    where: { status: "tocando", expiraEm: { lte: agora } },
    select: { id: true, consultaId: true, paraUsuarioId: true, tentativa: true, expiraEm: true },
    orderBy: { expiraEm: "asc" },
    take: MAX_EXPIRAR,
  });
  for (const v of vencidas) {
    if (!dentroDoTempo()) { r.incompleto = true; break; }
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
      dataInicio: { lte: agora, gte: new Date(agora.getTime() - TOQUE_JANELA_MS) },
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

  for (const c of consultas) {
    if (!dentroDoTempo()) { r.incompleto = true; break; }
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
      const expiraEm = new Date(agora.getTime() + TOQUE_DURACAO_MS);
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
        expiraEm: expiraEm.toISOString(),
        tentativa,
      });
      // Push: contrato combinado com o Pacientes (service worker do PR 5/8).
      // Sem nome nem especialidade; TTL = segundos até expirar.
      const aceitos = await enviarPush(
        p.usuarioId,
        {
          tipo: "chamada_tocando",
          consultaId: c.id,
          tentativa,
          expiraEm: expiraEm.toISOString(),
          url: `/consulta?consulta=${encodeURIComponent(c.id)}`,
          titulo: TITULO_PUSH,
          corpo: CORPO_PUSH,
        },
        { ttl: Math.max(0, Math.floor((expiraEm.getTime() - agora.getTime() - (Date.now() - t0)) / 1000)), urgencia: "high" },
      ).catch(() => 0);
      if (aceitos) {
        r.push++;
        await db.chamadaConsulta.updateMany({
          where: { consultaId: c.id, paraUsuarioId: p.usuarioId, tentativa },
          data: { pushEnviado: true, canal: "ambos" },
        });
      }
    }
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
 * Consultas das últimas `horas` (24 h) em que alguém não atendeu o toque e
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
    },
  });
  const out: ChamadaNaoAtendida[] = [];
  for (const l of linhas) {
    if (!consultaSemDesfecho(l)) continue;
    const quem: NaoAtendeu[] = [];
    for (const [papel, usuarioId, nome] of [
      ["paciente", l.pacienteId, l.paciente.nome],
      ["medico", l.medicoId, l.medico.nome],
    ] as const) {
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
