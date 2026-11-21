import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  LIMITE_JSON_ATALHOS,
  bancoTemConteudo,
  normalizarBancoKits,
  normalizarModelosMensagem,
} from "@/lib/atalhos-medico";
import { bancoVazio } from "@/lib/kits-prescricao";

/**
 * GET/PUT /api/medico/atalhos — modelos de mensagem, kits de receita e
 * pacotes de exame do PRÓPRIO médico. Sem id na URL. Não entra no
 * diretório público. A tabela ainda precisa da migração 20261120a.
 */
const CORPO_MAX = LIMITE_JSON_ATALHOS + 2_000;

function resposta(linha: { modelosMensagem: string; bancoKits: string; atualizadoEm: Date } | null) {
  let modelos: unknown = [];
  if (linha) {
    try {
      modelos = JSON.parse(linha.modelosMensagem);
    } catch {
      modelos = [];
    }
  }
  return {
    existe: !!linha,
    modelosMensagem: normalizarModelosMensagem(modelos),
    bancoKits: linha ? normalizarBancoKits(linha.bancoKits) : bancoVazio(),
    atualizadoEm: linha?.atualizadoEm.toISOString() ?? null,
  };
}

export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const linha = await db.atalhoMedico.findUnique({ where: { userId: medico.id } });
    return ok(resposta(linha));
  } catch (erro) {
    return falha(erro);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const bruto = await req.text();
    if (bruto.length > CORPO_MAX) {
      return Response.json({ erro: "Dados enviados excedem o tamanho permitido." }, { status: 413 });
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    if (!corpo || typeof corpo !== "object") {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const entrada = corpo as { modelosMensagem?: unknown; bancoKits?: unknown };
    const patch: { modelosMensagem?: string; bancoKits?: string } = {};
    if ("modelosMensagem" in entrada) patch.modelosMensagem = JSON.stringify(normalizarModelosMensagem(entrada.modelosMensagem));
    if ("bancoKits" in entrada) {
      const banco = normalizarBancoKits(entrada.bancoKits);
      if (!bancoTemConteudo(banco) && entrada.bancoKits && typeof entrada.bancoKits === "object") {
        const texto = JSON.stringify(entrada.bancoKits);
        if (texto.length > LIMITE_JSON_ATALHOS) {
          return Response.json({ erro: "Kits grandes demais." }, { status: 413 });
        }
      }
      patch.bancoKits = JSON.stringify(banco);
    }
    if (!patch.modelosMensagem && !patch.bancoKits) {
      return Response.json({ erro: "Nada para salvar." }, { status: 400 });
    }
    const linha = await db.atalhoMedico.upsert({
      where: { userId: medico.id },
      create: { userId: medico.id, ...patch },
      update: patch,
    });
    return ok(resposta(linha));
  } catch (erro) {
    return falha(erro);
  }
}
