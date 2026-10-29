import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  SECOES_EVOLUCAO, evolucaoPendenteDoMedico, evolucaoWire, lerJson, respostaEvolucaoPendente, secaoJson,
} from "@/lib/server/evolucao";

/**
 * Evolução do MÉDICO dono da consulta (Teleconsulta v2).
 *
 * GET /api/medico/consultas/[id]/evolucao
 *   → { evolucao | null, paciente, medicoes, exames, documentos, medicamentosEmUso,
 *       pedidosMedicao, anamnese, historico[] }
 *   historico = outras consultas do paciente, de QUALQUER médico (decisão do
 *   Alisson), SOMENTE LEITURA: anamnese, evolução concluída e documentos.
 *   Cada leitura que inclui consulta de outro médico vai para a Auditoria
 *   (HISTORICO_OUTRO_MEDICO, só ids).
 *
 * PUT /api/medico/consultas/[id]/evolucao   (autosave do rascunho)
 *   { dados?, triagem?, exames?, medicamentos?, conduta?, documentos?, rascunho?, cid? }
 *   Seções = objetos JSON (documentos = array). Só os campos enviados mudam.
 *   Cria a evolução se não existir. 409 { erro: "evolucao_pendente" } se o
 *   médico tem rascunho de OUTRA consulta; 409 { erro: "evolucao_concluida" }
 *   depois de concluída.
 */

async function consultaDoMedico(id: string, medicoId: string) {
  return db.consulta.findFirst({
    where: { id, medicoId },
    select: { id: true, medicoId: true, pacienteId: true, status: true, dataInicio: true, tipoAtendimento: true, consultaOrigemId: true },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const consulta = await consultaDoMedico(id, medico.id);
    if (!consulta) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    const pid = consulta.pacienteId;

    const [evolucao, paciente, medicoes, exames, documentos, medicamentos, pedidos, anamnese, outras] = await Promise.all([
      db.evolucao.findUnique({ where: { consultaId: id } }),
      db.user.findUnique({
        where: { id: pid },
        select: {
          id: true, nome: true,
          perfilPaciente: { select: { dataNascimento: true, idade: true, genero: true, alergias: true, comorbidades: true, peso: true, altura: true, tipoSanguineo: true } },
        },
      }),
      db.medicao.findMany({ where: { usuarioId: pid }, orderBy: { criadoEm: "desc" }, take: 60, select: { id: true, tipo: true, valor1: true, valor2: true, criadoEm: true, origem: true, consultaId: true, pedidoId: true } }),
      db.exameLaboratorial.findMany({ where: { usuarioId: pid }, orderBy: { dataColeta: "desc" }, take: 50, select: { id: true, titulo: true, dataColeta: true, itens: true, origem: true } }),
      db.documento.findMany({
        where: { pacienteId: pid },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, tipo: true, titulo: true, medicamento: true, posologia: true, duracao: true, cid: true, controlado: true, consultaId: true, medicoId: true, createdAt: true, medico: { select: { nome: true } } },
      }),
      db.medicamentoEmUso.findMany({ where: { pacienteId: pid, ativo: true }, orderBy: { criadoEm: "desc" }, select: { id: true, nome: true, dose: true, via: true, posologia: true, usoContinuo: true, controlado: true, origem: true, inicio: true, fim: true } }),
      db.pedidoMedicao.findMany({ where: { consultaId: id }, orderBy: { criadoEm: "desc" }, select: { id: true, tipos: true, status: true, criadoEm: true, atendidoEm: true } }),
      db.anamnese.findUnique({ where: { consultaId: id }, select: { status: true, coleta: true, documentos: true, updatedAt: true } }),
      db.consulta.findMany({
        where: { pacienteId: pid, id: { not: id }, status: { not: "cancelada" } },
        orderBy: { dataInicio: "desc" },
        take: 30,
        select: {
          id: true, dataInicio: true, especialidade: true, status: true, tipoAtendimento: true, medicoId: true,
          medico: { select: { nome: true } },
          anamnese: { select: { status: true, coleta: true } },
          evolucao: { select: { status: true, conduta: true, cid: true, concluidaEm: true } },
        },
      }),
    ]);

    const deOutros = outras.filter((c) => c.medicoId !== medico.id).map((c) => c.id);
    if (deOutros.length) {
      await registrarAudit(medico, {
        acao: "HISTORICO_OUTRO_MEDICO",
        categoria: "prontuario",
        entidade: "consulta",
        entidadeId: id,
        detalhes: `pacienteId=${pid} consultas=${deOutros.join(",")}`,
      });
    }

    const p = paciente?.perfilPaciente;
    return ok({
      consulta: { id: consulta.id, status: consulta.status, dataInicio: consulta.dataInicio.toISOString(), tipoAtendimento: consulta.tipoAtendimento, consultaOrigemId: consulta.consultaOrigemId },
      evolucao: evolucao ? evolucaoWire(evolucao) : null,
      paciente: {
        id: pid,
        nome: paciente?.nome ?? "",
        dataNascimento: p?.dataNascimento?.toISOString().slice(0, 10) ?? null,
        idade: p?.idade ?? null,
        genero: p?.genero ?? "",
        alergias: lerJson(p?.alergias, [] as string[]),
        comorbidades: lerJson(p?.comorbidades, [] as string[]),
        peso: p?.peso ?? null,
        altura: p?.altura ?? null,
        tipoSanguineo: p?.tipoSanguineo ?? "",
      },
      medicoes: medicoes.map((m) => ({ ...m, criadoEm: m.criadoEm.toISOString() })),
      exames: exames.map((e) => ({ ...e, dataColeta: e.dataColeta.toISOString(), itens: lerJson(e.itens, [] as unknown[]) })),
      documentos: documentos.map((d) => ({ ...d, medico: d.medico.nome, createdAt: d.createdAt.toISOString(), deOutroMedico: d.medicoId !== medico.id })),
      medicamentosEmUso: medicamentos.map((m) => ({ ...m, posologia: lerJson(m.posologia, {}), inicio: m.inicio.toISOString(), fim: m.fim?.toISOString() ?? null })),
      pedidosMedicao: pedidos.map((x) => ({ ...x, tipos: lerJson(x.tipos, [] as string[]), criadoEm: x.criadoEm.toISOString(), atendidoEm: x.atendidoEm?.toISOString() ?? null })),
      anamnese: anamnese ? { status: anamnese.status, coleta: lerJson(anamnese.coleta, {}), documentos: lerJson(anamnese.documentos, [] as unknown[]), atualizadaEm: anamnese.updatedAt.toISOString() } : null,
      historico: outras.map((c) => ({
        consultaId: c.id,
        dataInicio: c.dataInicio.toISOString(),
        especialidade: c.especialidade,
        status: c.status,
        tipoAtendimento: c.tipoAtendimento,
        medico: c.medico.nome,
        deOutroMedico: c.medicoId !== medico.id,
        somenteLeitura: true,
        anamnese: c.anamnese ? { status: c.anamnese.status, coleta: lerJson(c.anamnese.coleta, {}) } : null,
        evolucao: c.evolucao?.status === "concluida"
          ? { conduta: lerJson(c.evolucao.conduta, {}), cid: c.evolucao.cid, concluidaEm: c.evolucao.concluidaEm?.toISOString() ?? null }
          : null,
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const consulta = await consultaDoMedico(id, medico.id);
    if (!consulta) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    if (consulta.status === "cancelada") return Response.json({ erro: "consulta_cancelada" }, { status: 409 });
    if (consulta.status === "falta_paciente") return Response.json({ erro: "consulta_falta_paciente" }, { status: 409 });
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

    const data: Record<string, string | null> = {};
    for (const s of SECOES_EVOLUCAO) {
      const v = secaoJson(body[s]);
      if (v !== null) data[s] = v;
    }
    if (body.documentos !== undefined) {
      if (body.documentos !== null && !Array.isArray(body.documentos)) return Response.json({ erro: "documentos deve ser uma lista." }, { status: 400 });
      data.documentos = secaoJson(body.documentos, "[]") ?? "[]";
    }
    const r = secaoJson(body.rascunho);
    if (r !== null) data.rascunho = r;
    if (body.cid !== undefined) data.cid = typeof body.cid === "string" && body.cid.trim() ? body.cid.trim().slice(0, 20) : null;

    const atual = await db.evolucao.findUnique({ where: { consultaId: id }, select: { status: true } });
    if (atual?.status === "concluida") return Response.json({ erro: "evolucao_concluida" }, { status: 409 });
    if (!atual) {
      const pendente = await evolucaoPendenteDoMedico(medico.id, id);
      if (pendente) return respostaEvolucaoPendente(pendente);
    }

    // M-19 da auditoria: checagem de trava e gravação ATÔMICAS — antes, dois
    // autosaves de consultas diferentes passavam na pré-checagem e criavam
    // dois rascunhos, violando a regra de um rascunho por médico. A trava por
    // médico serializa os autosaves; a re-checagem dentro dela decide.
    const ev = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"evolucao-rascunho:" + medico.id}::text))`;
      const existe = await tx.evolucao.findUnique({ where: { consultaId: id }, select: { id: true, status: true } });
      if (existe?.status === "concluida") throw new erroEvolucaoConcluida();
      if (!existe) {
        const pendente = await evolucaoPendenteDoMedico(medico.id, id);
        // Dentro da trava, agora é impossível criar o segundo rascunho.
        if (pendente) return { pendente } as const;
      }
      const salvo = await tx.evolucao.upsert({
        where: { consultaId: id },
        create: { consultaId: id, medicoId: medico.id, pacienteId: consulta.pacienteId, ...data },
        update: data,
      });
      return { salvo } as const;
    });
    if ("pendente" in ev && ev.pendente) return respostaEvolucaoPendente(ev.pendente);
    if (ev.salvo.status === "concluida") return Response.json({ erro: "evolucao_concluida" }, { status: 409 });
    return ok({ evolucao: evolucaoWire(ev.salvo) });
  } catch (erro) {
    if ((erro as Error)?.message === "evolucao_concluida") {
      return Response.json({ erro: "evolucao_concluida" }, { status: 409 });
    }
    return falha(erro);
  }
}

/** Sinaliza evolução já concluída detectada DENTRO da transação do upsert. */
class erroEvolucaoConcluida extends Error {
  constructor() {
    super("evolucao_concluida");
  }
}
