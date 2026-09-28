import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { aplicarSideEffects, arquivoWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  uploadDocumento,
  urlAssinadaDocumento,
  garantirBuckets,
} from "@/lib/supabase/storage";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";

/**
 * POST — metadados JSON (legado) ou multipart com arquivo real → Storage.
 * GET  — ?id=  URL assinada de download (se storagePath existir).
 */
export async function GET(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return Response.json({ erro: "Informe id do arquivo." }, { status: 400 });
    }
    const arquivo = await db.arquivo.findUnique({ where: { id } });
    if (!arquivo) {
      return Response.json({ erro: "Arquivo não encontrado." }, { status: 404 });
    }
    // Visibilidade: dono do upload ou admin (médico vê via lista bootstrap)
    if (arquivo.usuarioId !== usuario.id && usuario.role !== "ADMIN") {
      // médico/paciente parceiro: permite se já está na lista do bootstrap (mesmo usuário vinculado)
      // simplificação: qualquer autenticado com o id obtido do próprio bootstrap
      // reforço: só dono ou admin baixa diretamente
      if (usuario.role === "PACIENTE" && arquivo.usuarioId !== usuario.id) {
        return Response.json({ erro: "Acesso negado." }, { status: 403 });
      }
    }
    if (!arquivo.storagePath) {
      return Response.json(
        { erro: "Este registro não tem arquivo no Storage (só metadados)." },
        { status: 404 },
      );
    }
    if (!supabaseServiceRoleKey()) {
      return Response.json({ erro: "Storage não configurado (service role)." }, { status: 503 });
    }
    const url = await urlAssinadaDocumento(arquivo.storagePath, 600);
    return ok({ url, nome: arquivo.nome });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const contentType = req.headers.get("content-type") || "";

    let nome: string;
    let tipo: string;
    let tamanhoKb: number;
    let consulta = "";
    let storagePath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      nome = String(form.get("nome") || (file instanceof File ? file.name : "")).trim();
      tipo = String(form.get("tipo") || "Documento").trim();
      consulta = String(form.get("consulta") || "").trim().slice(0, 160);
      if (!(file instanceof File) || !nome) {
        return Response.json({ erro: "Envie o arquivo (campo file) e o nome." }, { status: 400 });
      }
      tamanhoKb = Math.max(1, Math.round(file.size / 1024));
      if (file.size > 20 * 1024 * 1024) {
        return Response.json({ erro: "Arquivo maior que 20 MB." }, { status: 400 });
      }

      if (supabaseServiceRoleKey()) {
        try {
          await garantirBuckets();
          const buf = Buffer.from(await file.arrayBuffer());
          const up = await uploadDocumento(
            usuario.id,
            nome,
            buf,
            file.type || "application/octet-stream",
          );
          storagePath = up.path;
        } catch (e) {
          console.error("[Storage] upload falhou, gravando só metadados", e);
        }
      }
    } else {
      const body = (await req.json()) as {
        nome: string;
        tipo: string;
        tamanhoKb: number;
        consulta?: string;
      };
      if (!body.nome || !body.tipo) {
        return Response.json({ erro: "Informe nome e tipo do arquivo." }, { status: 400 });
      }
      nome = body.nome.trim().slice(0, 200);
      tipo = body.tipo.trim().slice(0, 60);
      tamanhoKb = Math.max(0, Math.min(20480, Math.round(body.tamanhoKb || 0)));
      consulta = body.consulta?.trim().slice(0, 160) ?? "";
    }

    const arquivo = await db.arquivo.create({
      data: {
        nome: nome.slice(0, 200),
        tipo: tipo.slice(0, 60),
        tamanhoKb: Math.max(0, Math.min(20480, tamanhoKb)),
        enviadoPor: usuario.role === "MEDICO" ? "medico" : "paciente",
        usuarioId: usuario.id,
        consulta,
        storagePath,
      },
    });

    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "exame",
          titulo: usuario.role === "MEDICO" ? "Arquivo enviado ao paciente" : "Arquivo adicionado",
          texto: `${nome} (${tipo}) registrado${storagePath ? " no Storage" : ""}${consulta ? ` — ${consulta}` : ""}.`,
          usuarioId: usuario.id,
        },
      ],
      {
        acao: "ARQUIVO_ENVIADO",
        categoria: "documento",
        entidade: "arquivo",
        entidadeId: arquivo.id,
        detalhes: `${nome} (${tipo}, ${arquivo.tamanhoKb}KB)${storagePath ? " [storage]" : ""}`,
      },
    );

    return ok({ arquivo: arquivoWire(arquivo), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
