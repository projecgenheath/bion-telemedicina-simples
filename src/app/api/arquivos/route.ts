import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de arquivo/exame anexado (metadados) — paciente ou médico.
 *  Notificações e auditoria são geradas PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as {
      nome: string;
      tipo: string;
      tamanhoKb: number;
      consulta?: string;
    };

    if (!body.nome || !body.tipo) {
      return Response.json({ erro: "Informe nome e tipo do arquivo." }, { status: 400 });
    }

    const arquivo = await db.arquivo.create({
      data: {
        nome: body.nome.trim().slice(0, 200),
        tipo: body.tipo.trim().slice(0, 60),
        tamanhoKb: Math.max(0, Math.min(20480, Math.round(body.tamanhoKb || 0))),
        // HARDENING (V6): proveniência derivada do PAPEL DA SESSÃO — o cliente
        // não define `enviadoPor` (paciente não se passa por médico).
        enviadoPor: usuario.role === "MEDICO" ? "medico" : "paciente",
        usuarioId: usuario.id,
        consulta: body.consulta?.trim().slice(0, 160) ?? "",
      },
    });

    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "exame",
          titulo: usuario.role === "MEDICO" ? "Arquivo enviado ao paciente" : "Arquivo adicionado",
          texto: `${body.nome} (${body.tipo}) registrado no histórico${body.consulta ? ` — ${body.consulta}` : ""}.`,
          usuarioId: usuario.id,
        },
      ],
      {
        acao: "ARQUIVO_ENVIADO",
        categoria: "documento",
        entidade: "arquivo",
        entidadeId: arquivo.id,
        detalhes: `${body.nome} (${body.tipo}, ${arquivo.tamanhoKb}KB) enviado por ${usuario.role === "MEDICO" ? "médico" : "paciente"}`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
