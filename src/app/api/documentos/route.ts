import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, documentoWire } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";

/** Emissão de documento clínico (receita/atestado/exame) — apenas médicos.
 *  Paciente identificado por ID (nunca por nome — homônimos existem).
 *  Notificações e auditoria geradas PELO SERVIDOR.
 *
 *  HARDENING (V3): o médico só emite para pacientes COM QUEM TEM CONSULTA
 *  (não cancelada) — impede receita/atestado forjado em prontuário de
 *  terceiro; tipo tem whitelist; título/conteúdo têm limite de tamanho. */
const TIPOS_DOCUMENTO = new Set(["receita", "atestado", "exame", "exame_solicitado"]);

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("MEDICO");
    // B1: guarda de objeto/tipo — corpo null ou campo não-string virava 500
    // em .trim()/.slice() abaixo.
    const bruto = corpoObjeto(await lerCorpoJson(req));
    if (!bruto) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const body = {
      tipo: textoDoCorpo(bruto.tipo) ?? "",
      titulo: textoDoCorpo(bruto.titulo) ?? "",
      conteudo: textoDoCorpo(bruto.conteudo) ?? "",
      pacienteId: textoDoCorpo(bruto.pacienteId) ?? "",
      /** B-12: consulta em que o documento foi emitido (opcional). */
      consultaId: textoDoCorpo(bruto.consultaId) ?? null,
      medicamento: textoDoCorpo(bruto.medicamento),
      posologia: textoDoCorpo(bruto.posologia),
      duracao: textoDoCorpo(bruto.duracao),
      observacoes: textoDoCorpo(bruto.observacoes),
      cid: textoDoCorpo(bruto.cid),
      /** Receita de controlado: só vale para tipo "receita"; default false. */
      controlado: bruto.controlado as boolean | undefined,
    };

    if (!body.tipo || !body.titulo || !body.conteudo || !body.pacienteId) {
      return Response.json(
        { erro: "Informe tipo, título, conteúdo e pacienteId do documento." },
        { status: 400 },
      );
    }
    if (!TIPOS_DOCUMENTO.has(body.tipo)) {
      return Response.json(
        { erro: "Tipo de documento inválido (receita, atestado ou exame)." },
        { status: 400 },
      );
    }
    if (body.controlado !== undefined && typeof body.controlado !== "boolean") {
      return Response.json(
        { erro: "O campo controlado deve ser verdadeiro ou falso." },
        { status: 400 },
      );
    }
    // Receita sem fármaco/dose não é receita: medicamento e posologia são
    // obrigatórios para tipo "receita" (antes, nada impedia emitir receita
    // vazia — medicamento/posologia/duracao são opcionais no schema).
    if (body.tipo === "receita" && (!body.medicamento?.trim() || !body.posologia?.trim())) {
      return Response.json(
        { erro: "Receita precisa de medicamento e posologia." },
        { status: 400 },
      );
    }

    const paciente = await db.user.findFirst({
      where: { id: body.pacienteId, role: "PACIENTE" },
      select: { id: true, nome: true },
    });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 400 });
    }

    // Vínculo assistencial: existe consulta (não cancelada) entre o médico
    // da sessão e o paciente alvo.
    const vinculo = await db.consulta.findFirst({
      where: { medicoId: usuario.id, pacienteId: paciente.id, status: { not: "cancelada" } },
      select: { id: true },
    });
    if (!vinculo) {
      return Response.json(
        { erro: "Você só pode emitir documentos para pacientes com consulta agendada ou realizada com você." },
        { status: 403 },
      );
    }

    // B-12: vínculo com a consulta (quando informado) — precisa ser consulta
    // do PRÓPRIO médico com o MESMO paciente; id fornecido mas inválido (ou
    // de outro médico/paciente) é 400, não descartado em silêncio para null.
    let consultaId: string | null = null;
    if (typeof body.consultaId === "string" && body.consultaId) {
      const consulta = await db.consulta.findFirst({
        where: { id: body.consultaId, medicoId: usuario.id, pacienteId: paciente.id },
        select: { id: true },
      });
      if (!consulta) {
        return Response.json(
          { erro: "Consulta não encontrada para este médico e paciente." },
          { status: 400 },
        );
      }
      consultaId = consulta.id;
    }

    const doc = await db.documento.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo.trim().slice(0, 160),
        conteudo: body.conteudo.slice(0, 6000),
        medicoId: usuario.id,
        pacienteId: paciente.id,
        consultaId, // B-12: consulta em que o documento foi emitido
        medicamento: body.medicamento?.trim().slice(0, 200) || null,
        posologia: body.posologia?.trim().slice(0, 300) || null,
        duracao: body.duracao?.trim().slice(0, 100) || null,
        observacoes: body.observacoes?.trim().slice(0, 1000) || null,
        cid: body.cid?.trim().slice(0, 20) || null,
        // Só receita pode nascer sinalizada como controlado; qualquer outro
        // tipo ignora o flag (default false no schema). É este flag que a
        // guarda controlado_exige_chamada da renovação passa a ler.
        controlado: body.tipo === "receita" && body.controlado === true,
      },
      include: {
        medico: { select: { nome: true } },
        paciente: { select: { nome: true } },
      },
    });

    const rotulo = body.tipo === "receita" ? "Receita" : body.tipo === "atestado" ? "Atestado" : "Solicitação de exame";
    // Contrato delta (auditoria FASE 2): devolve APENAS o documento criado
    // + efeitos (notificação/auditoria) — sem recarregar o estado inteiro.
    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "receita",
          titulo:
            body.tipo === "receita"
              ? "Receita digital disponível"
              : body.tipo === "atestado"
                ? "Atestado emitido"
                : "Solicitação de exames disponível",
          texto: `${rotulo} emitido por ${usuario.nome}. Documento eletrônico sem assinatura digital ICP-Brasil.`,
          usuarioId: paciente.id,
        },
      ],
      {
        acao: "DOCUMENTO_EMITIDO",
        categoria: "documento",
        entidade: "documento",
        entidadeId: doc.id,
        detalhes: `${rotulo}: ${body.titulo} para ${paciente.nome}`,
      },
    );

    return ok({ documento: documentoWire(doc), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
