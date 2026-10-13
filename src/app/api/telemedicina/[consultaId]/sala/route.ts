import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { topicoSala } from "@/lib/server/sala-canal";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { entradaAposSinal, limparSala, verificarPresencaConsultaSemFalhar } from "@/lib/server/presenca-consulta";
import { estadoJanelaSala, janelaSala, SALA_ABRE_ANTES_MIN, SALA_FECHA_DEPOIS_MIN } from "@/lib/janela-sala";

/**
 * Sinalização WebRTC da sala de teleconsulta (vídeo P2P).
 *
 * GET  /api/telemedicina/[consultaId]/sala
 *      Heartbeat de presença + pull de sinais não consumidos vindos do outro
 *      participante (oferta/resposta SDP, ICE candidates, chat, controle).
 *      Cada GET marca os sinais entregues como consumidos (entrega única).
 *      Devolve também `canal`: o tópico Realtime PRIVADO da sala
 *      (lib/server/sala-canal.ts), só para os dois participantes.
 *      Os ICE servers (STUN/TURN) saíram daqui: GET .../ice.
 *
 * POST /api/telemedicina/[consultaId]/sala
 *      Body: { acao: "sinal", tipo: "oferta"|"resposta"|"candidato"|"chat"|"controle", payload: string }
 *      Publica um sinal destinado ao outro participante da consulta (grava
 *      no banco e repassa pelo Realtime privado, dentro de after()).
 *      tipo "candidato" aceita payload de UM candidato (objeto) OU um LOTE
 *      (array de até MAX_CANDIDATOS_POR_LOTE).
 *      tipo "controle": { acao: "entrei" | "saiu" | "encerrada", s: sessão }.
 *      Só o MÉDICO encerra a consulta: "encerrada" vinda do paciente vira
 *      "saiu" (o paciente sai da chamada; o médico pode esperar ele voltar).
 *      Body: { acao: "eco", nonce } → o servidor manda um broadcast "eco"
 *      de volta: o cliente confirma que o Realtime ENTREGA (não só que
 *      assinou) e só então espaça o polling.
 *
 * GET /api/telemedicina/[consultaId]/sala?espiar=1
 *      Modo SÓ DE LEITURA (pré-sala do paciente): devolve se o outro está na
 *      sala, o status da consulta e a janela da sala. NÃO grava presença,
 *      NÃO grava auditoria de entrada, NÃO consome sinais/mensagens, não roda
 *      a verificação de presença. A presença só conta nas chamadas normais,
 *      feitas pela /consulta depois de "Entrar".
 *
 * Janela (lib/janela-sala.ts): fora de [horário − 30 min, horário + 2 h] o
 * GET normal e o POST de sinais respondem 409. O 409 do GET traz também
 * `motivo` ("antes" | "depois") e `abreEm` ou `fechouEm` (ISO), para a tela
 * mostrar "A sala abre às HH:MM" / "A sala já fechou" (o sinal de controle
 * continua aceito, para quem encerra no limite). O modo espiar funciona a
 * qualquer hora.
 *
 * Verificação automática de falta/falha (presenca-consulta.ts): só pode
 * gravar algo DEPOIS que a sala fecha (CARENCIA_APOS_INICIO_MIN = fim da
 * janela). Por isso saiu do caminho quente do GET: roda só quando o GET cai
 * no 409 de "sala fechada", dentro de after() (não atrasa a resposta). Os
 * bootstraps do médico e do paciente (dados.ts) continuam rodando a mesma
 * verificação para todas as consultas pendentes.
 *
 * Segurança: apenas o paciente e o médico da consulta acessam a sala (403 para
 * qualquer outro papel, inclusive admin — sala é 1:1). Sinais só são aceitos
 * enquanto a consulta estiver ativa (confirmada | em_espera).
 */

/**
 * Presença válida por 25 s. Com mídia fluindo o cliente manda o heartbeat a
 * cada 10 s; 25 s tolera um heartbeat perdido sem o outro lado "sumir".
 * Fica abaixo do SINAL_PARADO_MS (30 s, metricas.ts) que zera a entrada.
 */
const JANELA_ONLINE_MS = 25_000;
const TAM_MAX_PAYLOAD = 64 * 1024; // 64KB por sinal (SDP/candidate são pequenos)
const TIPOS_SINAL = ["oferta", "resposta", "candidato", "chat", "controle"] as const;
const ACOES_CONTROLE = ["entrei", "saiu", "encerrada"] as const;
const LIMITE_SINAIS_POR_MINUTO = 240;
const MAX_CANDIDATOS_POR_LOTE = 24;

type ErroComStatus = Error & { status?: number };

function erroHttp(status: number, mensagem: string): ErroComStatus {
  const err = new Error(mensagem) as ErroComStatus;
  err.status = status;
  return err;
}

/** Consulta + autorização (403 se não for o médico ou o paciente). Nomes só quando pedidos (modo espiar). */
async function carregarConsultaAutorizada(consultaId: string, usuarioId: string, comNomes = false) {
  const consulta = await db.consulta.findUnique({
    where: { id: consultaId },
    select: {
      id: true,
      status: true,
      dataInicio: true,
      especialidade: true,
      pacienteId: true,
      medicoId: true,
      ...(comNomes ? { paciente: { select: { nome: true } }, medico: { select: { nome: true } } } : {}),
    },
  });
  if (!consulta) throw erroHttp(404, "Consulta não encontrada.");
  if (consulta.pacienteId !== usuarioId && consulta.medicoId !== usuarioId) {
    throw erroHttp(403, "Acesso negado: você não participa desta consulta.");
  }
  return consulta as typeof consulta & { paciente?: { nome: string }; medico?: { nome: string } };
}

/** 409 fora da janela da sala (antes de abrir ou depois de fechar). */
function exigirJanelaAberta(dataInicio: Date) {
  const estado = estadoJanelaSala(dataInicio, Date.now());
  if (estado === "antes") {
    throw erroHttp(409, `A sala ainda não abriu: ela abre ${SALA_ABRE_ANTES_MIN} min antes do horário.`);
  }
  if (estado === "fechada") {
    throw erroHttp(409, `A sala já fechou: ela fica aberta até ${SALA_FECHA_DEPOIS_MIN / 60} h depois do horário.`);
  }
}

/**
 * 409 do GET normal fora da janela, com os horários para a tela da sala:
 *   antes de abrir → { erro, motivo: "antes", abreEm }   (ISO)
 *   depois de fechar → { erro, motivo: "depois", fechouEm } (ISO)
 * null com a sala aberta. (O POST continua com exigirJanelaAberta: só `erro`.)
 */
function respostaForaDaJanela(dataInicio: Date): NextResponse | null {
  const estado = estadoJanelaSala(dataInicio, Date.now());
  if (estado === "aberta") return null;
  const { abreEm, fechaEm } = janelaSala(dataInicio);
  const corpo =
    estado === "antes"
      ? {
          erro: `A sala ainda não abriu: ela abre ${SALA_ABRE_ANTES_MIN} min antes do horário.`,
          motivo: "antes" as const,
          abreEm: new Date(abreEm).toISOString(),
        }
      : {
          erro: `A sala já fechou: ela fica aberta até ${SALA_FECHA_DEPOIS_MIN / 60} h depois do horário.`,
          motivo: "depois" as const,
          fechouEm: new Date(fechaEm).toISOString(),
        };
  return NextResponse.json(corpo, { status: 409, headers: { "Cache-Control": "no-store, private" } });
}

function janelaWire(dataInicio: Date) {
  const { abreEm, fechaEm } = janelaSala(dataInicio);
  return {
    estado: estadoJanelaSala(dataInicio, Date.now()),
    abreEm: new Date(abreEm).toISOString(),
    fechaEm: new Date(fechaEm).toISOString(),
  };
}

function papelDe(consulta: { pacienteId: string; medicoId: string }, usuarioId: string) {
  return consulta.pacienteId === usuarioId ? "PACIENTE" : "MEDICO";
}

function idDoOutro(consulta: { pacienteId: string; medicoId: string }, usuarioId: string) {
  return consulta.pacienteId === usuarioId ? consulta.medicoId : consulta.pacienteId;
}

/** Broadcast no canal privado da sala, depois da resposta (after). */
function repassarRealtime(consultaId: string, event: string, payload: Record<string, unknown>) {
  after(() => broadcastCanal(topicoSala(consultaId), event, payload, { privado: true }));
}

/**
 * Limpeza em ~8% dos GETs: sinais consumidos antigos; presença e o sinal
 * "encerrada" só depois que a consulta tem desfecho (ver limparSala).
 */
function limpezaPeriodica(consultaId: string) {
  if (Math.random() > 0.08) return;
  after(() =>
    limparSala(consultaId).catch((e) => console.error("[sala] falha na limpeza periódica", consultaId, e)),
  );
}

/** GET: heartbeat + estado da sala + pull de sinais novos. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ consultaId: string }> },
) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    const espiar = req.nextUrl.searchParams.get("espiar") === "1";

    const consulta = await carregarConsultaAutorizada(consultaId, usuario.id, espiar);
    const papel = papelDe(consulta, usuario.id);
    const outroId = idDoOutro(consulta, usuario.id);

    // Modo só de leitura (pré-sala): nada é gravado nem consumido.
    if (espiar) {
      const online = await db.presencaSala.findFirst({
        where: { consultaId, usuarioId: outroId, ultimoPing: { gte: new Date(Date.now() - JANELA_ONLINE_MS) } },
        select: { usuarioId: true },
      });
      return ok({
        espiar: true,
        consulta: {
          id: consulta.id,
          status: consulta.status,
          especialidade: consulta.especialidade,
          paciente: consulta.paciente?.nome ?? "",
          medico: consulta.medico?.nome ?? "",
        },
        eu: { id: usuario.id, nome: usuario.nome, papel },
        outroOnline: online !== null,
        janela: janelaWire(consulta.dataInicio),
      });
    }

    // Sala fechada: é só aqui que a verificação automática de falta/falha
    // pode gravar algo (ela exige a sala fechada). Roda depois da resposta,
    // no máximo 1x/min por consulta e nunca lança.
    if (estadoJanelaSala(consulta.dataInicio, Date.now()) === "fechada") {
      after(() => verificarPresencaConsultaSemFalhar(consultaId));
    }

    // Fora da janela (30 min antes … 2 h depois): 409 com abreEm/fechouEm,
    // sem presença nem auditoria.
    const foraDaJanela = respostaForaDaJanela(consulta.dataInicio);
    if (foraDaJanela) return foraDaJanela;

    // Presença dos dois numa consulta só (antes: duas).
    const agoraPing = new Date();
    const presencas = await db.presencaSala.findMany({
      where: { consultaId, usuarioId: { in: [usuario.id, outroId] } },
      select: { usuarioId: true, ultimoPing: true, entrouEm: true },
    });
    const presencaExistente = presencas.find((p) => p.usuarioId === usuario.id) ?? null;
    const presencaOutro = presencas.find((p) => p.usuarioId === outroId) ?? null;

    // Heartbeat de presença (upsert; "criado" = primeira entrada nesta consulta).
    // "entrouEm" = início da sessão atual: recomeça quando o sinal ficou mais
    // de 30 s parado (prova de quanto tempo a pessoa esperou na sala).
    const criado = presencaExistente === null;
    const entrouEm = entradaAposSinal(presencaExistente, agoraPing);
    await db.presencaSala.upsert({
      where: { consultaId_usuarioId: { consultaId, usuarioId: usuario.id } },
      create: { consultaId, usuarioId: usuario.id, papel, ultimoPing: agoraPing, entrouEm },
      update: { ultimoPing: agoraPing, papel, entrouEm },
    });

    // Audit apenas na primeira entrada na sala
    if (criado) {
      await registrarAudit(usuario, {
        acao: "TELECONSULTA_SALA_ENTRADA",
        categoria: "consulta",
        severidade: "info",
        entidade: "consulta",
        entidadeId: consultaId,
        detalhes: `Entrou na sala de teleconsulta (${papel.toLowerCase()})`,
      });
      repassarRealtime(consultaId, "presenca", { usuarioId: usuario.id, papel, online: true });
    }

    const sinaisPendentes = await db.sinalSala.findMany({
      where: { consultaId, consumido: false, deUsuarioId: { not: usuario.id } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { id: true, tipo: true, payload: true, createdAt: true },
    });

    // Entrega única: marca como consumidos os sinais enviados neste pull
    if (sinaisPendentes.length > 0) {
      await db.sinalSala.updateMany({
        where: { id: { in: sinaisPendentes.map((s) => s.id) } },
        data: { consumido: true },
      });
    }

    limpezaPeriodica(consultaId);

    const outroOnline =
      presencaOutro !== null && agoraPing.getTime() - presencaOutro.ultimoPing.getTime() <= JANELA_ONLINE_MS;

    return ok({
      consulta: { id: consulta.id, status: consulta.status },
      eu: { id: usuario.id, papel },
      outroOnline,
      janela: janelaWire(consulta.dataInicio),
      canal: topicoSala(consultaId),
      sinais: sinaisPendentes,
    });
  } catch (erro) {
    return falha(erro);
  }
}

/** POST: publica um sinal (oferta/resposta/candidato/chat/controle) ou pede o eco do Realtime. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ consultaId: string }> },
) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    const body = (await req.json()) as { acao?: string; tipo?: string; payload?: string; nonce?: string };

    // Eco: confirma ao cliente que o Realtime privado entrega mensagens a ele.
    if (body.acao === "eco") {
      if (typeof body.nonce !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(body.nonce)) {
        throw erroHttp(400, "nonce inválido.");
      }
      const consulta = await carregarConsultaAutorizada(consultaId, usuario.id);
      exigirJanelaAberta(consulta.dataInicio);
      repassarRealtime(consultaId, "eco", { usuarioId: usuario.id, nonce: body.nonce });
      return ok({ ok: true });
    }

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
    const papel = papelDe(consulta, usuario.id);
    const ativa = ["confirmada", "em_espera"].includes(consulta.status);
    if (!ativa && body.tipo !== "controle") {
      throw erroHttp(409, `Sala fechada: consulta está "${consulta.status}".`);
    }
    // Fora da janela da sala, só o controle (ex.: "encerrada" no limite) passa.
    if (body.tipo !== "controle") exigirJanelaAberta(consulta.dataInicio);

    // Controle: só ações conhecidas; o paciente não encerra a consulta.
    let payload = body.payload;
    let acaoControle = "";
    if (body.tipo === "controle") {
      let c: { acao?: unknown; s?: unknown; motivo?: unknown };
      try {
        c = JSON.parse(body.payload) as typeof c;
      } catch {
        throw erroHttp(400, "Payload de controle não é JSON válido.");
      }
      acaoControle = typeof c.acao === "string" ? c.acao : "";
      if (!(ACOES_CONTROLE as readonly string[]).includes(acaoControle)) {
        throw erroHttp(400, `Ação de controle inválida: ${acaoControle || "(vazia)"}`);
      }
      if (acaoControle === "encerrada" && papel === "PACIENTE") {
        // Só o médico encerra. Clientes antigos do paciente mandavam
        // "encerrada" ao sair: vira "saiu" (não fecha a chamada do médico
        // nem conta como encerramento na verificação de presença).
        acaoControle = "saiu";
        payload = JSON.stringify({ acao: "saiu", s: typeof c.s === "string" ? c.s : undefined, motivo: "botao" });
      }
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

    // Lote de candidatos ICE: payload é um ARRAY — um POST, N linhas
    // (menos round trips e menos consumo do rate limit no handshake).
    if (body.tipo === "candidato") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw erroHttp(400, "Payload do candidato não é JSON válido.");
      }
      const lote = Array.isArray(parsed) ? parsed : [parsed];
      if (lote.length === 0) throw erroHttp(400, "Lista de candidatos vazia.");
      if (lote.length > MAX_CANDIDATOS_POR_LOTE) {
        throw erroHttp(400, `Lote de candidatos excede ${MAX_CANDIDATOS_POR_LOTE} itens.`);
      }
      if (lote.some((c) => typeof c !== "object" || c === null || Array.isArray(c))) {
        throw erroHttp(400, "Candidato inválido no lote.");
      }
      const criados = await db.sinalSala.createManyAndReturn({
        data: lote.map((c) => ({
          consultaId,
          deUsuarioId: usuario.id,
          deRole: papel,
          tipo: "candidato",
          payload: JSON.stringify(c),
        })),
        select: { id: true, payload: true, createdAt: true },
      });
      // Realtime: os mesmos ids do banco (o cliente deduplica Realtime × polling por id).
      repassarRealtime(consultaId, "sinal", {
        tipo: "candidato",
        lote: true,
        deUsuarioId: usuario.id,
        itens: criados.map((s) => ({ id: s.id, payload: s.payload, createdAt: s.createdAt.toISOString() })),
      });
      return ok({ ok: true, total: criados.length });
    }

    const sinal = await db.sinalSala.create({
      data: {
        consultaId,
        deUsuarioId: usuario.id,
        deRole: papel,
        tipo: body.tipo,
        payload,
      },
      select: { id: true, createdAt: true },
    });

    repassarRealtime(consultaId, "sinal", {
      id: sinal.id,
      tipo: body.tipo,
      payload,
      deUsuarioId: usuario.id,
      createdAt: sinal.createdAt.toISOString(),
    });

    // Encerramento pelo médico e saída do paciente pelo botão: auditoria.
    if (acaoControle === "encerrada") {
      await registrarAudit(usuario, {
        acao: "TELECONSULTA_ENCERRADA_SALA",
        categoria: "consulta",
        severidade: "info",
        entidade: "consulta",
        entidadeId: consultaId,
        detalhes: "O médico encerrou a videochamada",
      });
    } else if (acaoControle === "saiu" && papel === "PACIENTE" && /"motivo":"botao"/.test(payload)) {
      await registrarAudit(usuario, {
        acao: "TELECONSULTA_PACIENTE_SAIU",
        categoria: "consulta",
        severidade: "info",
        entidade: "consulta",
        entidadeId: consultaId,
        detalhes: "O paciente saiu da videochamada pelo botão (pode voltar enquanto a sala estiver aberta)",
      });
    }

    return ok({ ok: true, id: sinal.id });
  } catch (erro) {
    return falha(erro);
  }
}
