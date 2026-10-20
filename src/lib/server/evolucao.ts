import "server-only";
import { db } from "@/lib/db";

/**
 * Teleconsulta v2 — Médicos: evolução e trava do próximo atendimento.
 * Decisão do Alisson: a trava BLOQUEIA SEMPRE (sem prazo que vire alerta)
 * enquanto o médico tiver uma evolução em rascunho de outra consulta.
 * Só as rotas do médico respondem 409 { erro: "evolucao_pendente" }.
 */

export const SECOES_EVOLUCAO = ["dados", "triagem", "exames", "medicamentos", "conduta"] as const;
export type SecaoEvolucao = (typeof SECOES_EVOLUCAO)[number];
export const LIMITE_SECAO = 20_000; // caracteres do JSON de cada seção

export type EvolucaoPendente = { evolucaoId: string; consultaId: string; paciente: string };

/** Evolução em rascunho do médico em OUTRA consulta (a que trava), ou null. */
export async function evolucaoPendenteDoMedico(
  medicoId: string,
  excetoConsultaId?: string,
): Promise<EvolucaoPendente | null> {
  const ev = await db.evolucao.findFirst({
    where: {
      medicoId,
      status: "rascunho",
      ...(excetoConsultaId ? { consultaId: { not: excetoConsultaId } } : {}),
    },
    orderBy: { criadoEm: "asc" },
    select: { id: true, consultaId: true, paciente: { select: { nome: true } } },
  });
  return ev ? { evolucaoId: ev.id, consultaId: ev.consultaId, paciente: ev.paciente.nome } : null;
}

/** Resposta 409 padrão da trava. */
export function respostaEvolucaoPendente(p: EvolucaoPendente) {
  return Response.json(
    {
      erro: "evolucao_pendente",
      mensagem: `Conclua a evolução de ${p.paciente} para atender o próximo.`,
      consultaId: p.consultaId,
      evolucaoId: p.evolucaoId,
    },
    { status: 409, headers: { "Cache-Control": "no-store, private" } },
  );
}

/** Cria (se não existir) a evolução em rascunho da consulta. Idempotente. */
export async function garantirEvolucao(c: { id: string; medicoId: string; pacienteId: string }) {
  return db.evolucao.upsert({
    where: { consultaId: c.id },
    create: { consultaId: c.id, medicoId: c.medicoId, pacienteId: c.pacienteId },
    update: {},
  });
}

/** Normaliza uma seção recebida do cliente: objeto/array -> JSON limitado. */
export function secaoJson(v: unknown, padrao: "{}" | "[]" = "{}"): string | null {
  if (v === undefined) return null;
  if (v === null) return padrao;
  if (typeof v !== "object") return null;
  const s = JSON.stringify(v);
  if (s.length > LIMITE_SECAO) {
    const err = new Error("Seção da evolução grande demais.") as Error & { status?: number };
    err.status = 413;
    throw err;
  }
  return s;
}

export function lerJson<T>(s: string | null | undefined, padrao: T): T {
  if (!s) return padrao;
  try {
    return JSON.parse(s) as T;
  } catch {
    return padrao;
  }
}

type EvolucaoRow = {
  id: string; consultaId: string; medicoId: string; pacienteId: string;
  dados: string; triagem: string; exames: string; medicamentos: string; conduta: string;
  cid: string | null; documentos: string; rascunho: string; status: string;
  criadoEm: Date; concluidaEm: Date | null; atualizadoEm: Date;
};

export function evolucaoWire(e: EvolucaoRow) {
  return {
    id: e.id,
    consultaId: e.consultaId,
    medicoId: e.medicoId,
    pacienteId: e.pacienteId,
    dados: lerJson(e.dados, {}),
    triagem: lerJson(e.triagem, {}),
    exames: lerJson(e.exames, {}),
    medicamentos: lerJson(e.medicamentos, {}),
    conduta: lerJson(e.conduta, {}),
    cid: e.cid,
    documentos: lerJson(e.documentos, [] as unknown[]),
    rascunho: lerJson(e.rascunho, {}),
    status: e.status as "rascunho" | "concluida",
    criadoEm: e.criadoEm.toISOString(),
    concluidaEm: e.concluidaEm?.toISOString() ?? null,
    atualizadoEm: e.atualizadoEm.toISOString(),
  };
}

export function erroHttp(status: number, msg: string) {
  const err = new Error(msg) as Error & { status?: number };
  err.status = status;
  return err;
}
