import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import {
  carregarDados,
  aplicarSideEffects,
  pacienteIdPorNome,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Emissão de documento clínico (receita/atestado/exame) — apenas médicos. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("MEDICO");
    const body = (await req.json()) as {
      tipo: string;
      titulo: string;
      conteudo: string;
      paciente: string;
      medicamento?: string;
      posologia?: string;
      duracao?: string;
      observacoes?: string;
      cid?: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    if (!body.tipo || !body.titulo || !body.conteudo || !body.paciente) {
      return Response.json(
        { erro: "Informe tipo, título, conteúdo e paciente do documento." },
        { status: 400 },
      );
    }

    const pacienteId = await pacienteIdPorNome(body.paciente);
    if (!pacienteId) {
      return Response.json({ erro: `Paciente "${body.paciente}" não encontrado.` }, { status: 400 });
    }

    const doc = await db.documento.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo,
        conteudo: body.conteudo,
        medicoId: usuario.id,
        pacienteId,
        medicamento: body.medicamento || null,
        posologia: body.posologia || null,
        duracao: body.duracao || null,
        observacoes: body.observacoes || null,
        cid: body.cid || null,
      },
    });

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "DOCUMENTO_EMITIDO",
        categoria: "documento",
        detalhes: `${body.tipo === "receita" ? "Receita" : body.tipo === "atestado" ? "Atestado" : "Solicitação de exame"}: ${body.titulo} para ${body.paciente}`,
      }),
      entidade: "documento",
      entidadeId: doc.id,
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
