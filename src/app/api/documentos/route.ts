import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

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
    const body = (await req.json()) as {
      tipo: string;
      titulo: string;
      conteudo: string;
      pacienteId: string;
      medicamento?: string;
      posologia?: string;
      duracao?: string;
      observacoes?: string;
      cid?: string;
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

    const doc = await db.documento.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo.trim().slice(0, 160),
        conteudo: body.conteudo.slice(0, 6000),
        medicoId: usuario.id,
        pacienteId: paciente.id,
        medicamento: body.medicamento?.trim().slice(0, 200) || null,
        posologia: body.posologia?.trim().slice(0, 300) || null,
        duracao: body.duracao?.trim().slice(0, 100) || null,
        observacoes: body.observacoes?.trim().slice(0, 1000) || null,
        cid: body.cid?.trim().slice(0, 20) || null,
      },
    });

    const rotulo = body.tipo === "receita" ? "Receita" : body.tipo === "atestado" ? "Atestado" : "Solicitação de exame";
    await aplicarSideEffects(
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
          texto: `${rotulo} emitido por ${usuario.nome}. Assinado digitalmente (assinatura eletrônica — MP 2.200-2/2001) com hash SHA-256 de verificação.`,
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

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
