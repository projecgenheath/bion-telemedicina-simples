import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import {
  carregarDados,
  aplicarSideEffects,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de arquivo/exame anexado (metadados) — paciente ou médico. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as {
      nome: string;
      tipo: string;
      tamanhoKb: number;
      enviadoPor?: "paciente" | "medico";
      consulta?: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    if (!body.nome || !body.tipo) {
      return Response.json({ erro: "Informe nome e tipo do arquivo." }, { status: 400 });
    }

    await db.arquivo.create({
      data: {
        nome: body.nome,
        tipo: body.tipo,
        tamanhoKb: Math.max(0, Math.round(body.tamanhoKb || 0)),
        enviadoPor: body.enviadoPor ?? (usuario.role === "MEDICO" ? "medico" : "paciente"),
        usuarioId: usuario.id,
        consulta: body.consulta ?? "",
      },
    });

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "ARQUIVO_ENVIADO",
        categoria: "documento",
        detalhes: `${body.nome} (${body.tipo}, ${body.tamanhoKb}KB) enviado por ${usuario.role === "MEDICO" ? "médico" : "paciente"}`,
      }),
      entidade: "arquivo",
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
