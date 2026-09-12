import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

/**
 * Sinalização WebRTC da sala de teleconsulta (Fase 2 — vídeo real P2P).
 *
 * GET  /api/telemedicina/[consultaId]/sala
 *      Heartbeat de presença + pull de sinais não consumidos vindos do outro
 *      participante (oferta/resposta SDP, ICE candidates, chat, controle).
 *      Cada GET marca os sinais entregues como consumidos (entrega única).
 *
 * POST /api/telemedicina/[consultaId]/sala
 *      Body: { acao: "sinal", tipo: "oferta"|"resposta"|"candidato"|"chat"|"controle", payload: string }
 *      Publica um sinal destinado ao outro participante da consulta.
 *
 * Segurança: apenas o paciente e o médico da consulta acessam a sala (403 para
 * qualquer outro papel, inclusive admin — sala é 1:1). Sinais só são aceitos
 * enquanto a consulta estiver ativa (confirmada | em_espera).
 */

const JANELA_ONLINE_MS = 12_000; // presença válida por 12s (heartbeat ~1,5s)
const TAM_MAX_PAYLOAD = 64 * 1024; // 64KB por sinal (SDP/candidate são pequenos)
const TIPOS_SINAL = ["oferta", "resposta", "candidato", "chat", "controle"] as const;
const LIMITE_SINAIS_POR_MINUTO = 240;

type ErroComStatus = Error & { status?: number };

function erroHttp(status: number, mensagem: string): ErroComStatus {
  const err = new Error(mensagem) as ErroComStatus;
  err.status = status;
  return err;
}

async function carregarConsultaAutorizada(consultaId: string, usuarioId: string) {
  const consulta = await db.consulta.findUnique({
    where: { id: consultaId },
    select: {
      id: true,
      status: true,
      especialidade: true,
      pacienteId: true,
      medicoId: true,
      paciente: { select: { nome: true } },
      medico: { select: { nome: true } },
    },
  });
  if (!consulta) throw erroHttp(404, "Consulta não encontrada.");
  if (consulta.pacienteId !== usuarioId && consulta.medicoId !== usuarioId) {
    throw erroHttp(403, "Acesso negado: você não participa desta consulta.");
  }
  return consulta;
}

function papelDe(consulta: { pacienteId: string; medicoId: string }, usuarioId: string) {
  return consulta.pacienteId === usuarioId ? "PACIENTE" : "MEDICO";
}

function idDoOutro(consulta: { pacienteId: string; medicoId: string }, usuarioId: string) {
  return consulta.pacienteId === usuarioId ? consulta.medicoId : consulta.pacienteId;
}

/** Remove sinais já consumidos e presenças órfãs (executa em ~8% dos GETs). */
function limpezaPeriodica(consultaId: string) {
  if (Math.random() > 0.08) return;
  const agora = Date.now();
  db.sinalSala
    .deleteMany({
      where: {
        consultaId,
        consumido: true,
        createdAt: { lt: new Date(agora - 30 * 60 * 1000) },
      },
    })
    .catch(() => {});
  db.presencaSala
    .deleteMany({
      where: { consultaId, ultimoPing: { lt: new Date(agora - 60 * 60 * 1000) } },
    })
    .catch(() => {});
}

/** GET: heartbeat + estado da sala + pull de sinais novos. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ consultaId: string }> },
) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;

    const consulta = await carregarConsultaAutorizada(consultaId, usuario.id);
    const papel = papelDe(consulta, usuario.id);
    const outroId = idDoOutro(consulta, usuario.id);

    // Heartbeat de presença (upsert; "criado" = primeira entrada nesta sessão)
    const presencaExistente = await db.presencaSala.findUnique({
      where: { consultaId_usuarioId: { consultaId, usuarioId: usuario.id } },
      select: { usuarioId: true },
    });
    const criado = presencaExistente === null;
    await db.presencaSala.upsert({
      where: { consultaId_usuarioId: { consultaId, usuarioId: usuario.id } },
      create: { consultaId, usuarioId: usuario.id, papel },
      update: { ultimoPing: new Date(), papel },
    });

    // Audit apenas na primeira entrada da sessão atual na sala
    if (criado) {
      await registrarAudit(usuario, {
        acao: "TELECONSULTA_SALA_ENTRADA",
        categoria: "consulta",
        severidade: "info",
        entidade: "consulta",
        entidadeId: consultaId,
        detalhes: `Entrou na sala de teleconsulta (${papel.toLowerCase()})`,
      });
    }

    const limiteOnline = new Date(Date.now() - JANELA_ONLINE_MS);
    const [presencaOutro, sinaisPendentes] = await Promise.all([
      db.presencaSala.findFirst({
        where: { consultaId, usuarioId: outroId, ultimoPing: { gte: limiteOnline } },
        select: { usuarioId: true },
      }),
      db.sinalSala.findMany({
        where: { consultaId, consumido: false, deUsuarioId: { not: usuario.id } },
        orderBy: { createdAt: "asc" },
        take: 60,
        select: { id: true, tipo: true, payload: true, createdAt: true },
      }),
    ]);

    // Entrega única: marca como consumidos os sinais enviados neste pull
    if (sinaisPendentes.length > 0) {
      await db.sinalSala.updateMany({
        where: { id: { in: sinaisPendentes.map((s) => s.id) } },
        data: { consumido: true },
      });
    }

    limpezaPeriodica(consultaId);

    return ok({
      consulta: {
        id: consulta.id,
        status: consulta.status,
        especialidade: consulta.especialidade,
        paciente: consulta.paciente.nome,
        medico: consulta.medico.nome,
      },
      eu: { id: usuario.id, nome: usuario.nome, papel },
      outroOnline: presencaOutro !== null,
      sinais: sinaisPendentes,
    });
  } catch (erro) {
    return falha(erro);
  }
}

/** POST: publica um sinal (oferta/resposta/candidato/chat/controle). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ consultaId: string }> },
) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    const body = (await req.json()) as { acao?: string; tipo?: string; payload?: string };

    if (body.acao !== "sinal" || !body.tipo || typeof body.payload !== "string") {
      throw erroHttp(400, 'Corpo inválido. Use { acao: "sinal", tipo, payload }.');
    }
    if (!(TIPOS_SINAL as readonly string[]).includes(body.tipo)) {
      throw erroHttp(400, `Tipo de sinal inválido: ${body.tipo}`);
    }
    if (body.payload.length > TAM_MAX_PAYLOAD) {
      throw erroHttp(413, "Payload do sinal excede o limite de 64KB.");
    }

    const consulta = await carregarConsultaAutorizada(consultaId, usuario.id);
    const ativa = ["confirmada", "em_espera"].includes(consulta.status);
    if (!ativa && body.tipo !== "controle") {
      throw erroHttp(409, `Sala fechada: consulta está "${consulta.status}".`);
    }

    // Anti-spam simples: cap de sinais por minuto por usuário
    const recentes = await db.sinalSala.count({
      where: {
        consultaId,
        deUsuarioId: usuario.id,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentes >= LIMITE_SINAIS_POR_MINUTO) {
      throw erroHttp(429, "Muitos sinais enviados. Tente novamente em instantes.");
    }

    const sinal = await db.sinalSala.create({
      data: {
        consultaId,
        deUsuarioId: usuario.id,
        deRole: papelDe(consulta, usuario.id),
        tipo: body.tipo,
        payload: body.payload,
      },
      select: { id: true, createdAt: true },
    });

    // Controle de encerramento: registra no audit (o status da consulta em si
    // continua sendo gerenciado pelo PATCH /api/consultas/[id] já existente)
    if (body.tipo === "controle") {
      let acao = "";
      try {
        acao = (JSON.parse(body.payload) as { acao?: string }).acao ?? "";
      } catch {}
      if (acao === "encerrada") {
        await registrarAudit(usuario, {
          acao: "TELECONSULTA_ENCERRADA_SALA",
          categoria: "consulta",
          severidade: "info",
          entidade: "consulta",
          entidadeId: consultaId,
          detalhes: "Participante encerrou a videochamada",
        });
      }
    }

    return ok({ ok: true, id: sinal.id });
  } catch (erro) {
    return falha(erro);
  }
}
