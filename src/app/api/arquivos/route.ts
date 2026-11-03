import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { podeAcessarArquivo, resolverDestinoUpload } from "@/lib/server/arquivos-acesso";
import { aplicarSideEffects, arquivoWire } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";
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
    // A3/A4 (auditoria 2026-09): mesma regra da LISTAGEM (helper único em
    // arquivos-acesso.ts). Antes o MÉDICO baixava QUALQUER arquivo por id.
    if (!(await podeAcessarArquivo(usuario, arquivo.id))) {
      return Response.json({ erro: "Acesso negado." }, { status: 403 });
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
    // B2: download como anexo — upload de paciente nunca renderiza inline.
    const url = await urlAssinadaDocumento(arquivo.storagePath, 600, true);
    return ok({ url, nome: arquivo.nome });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * B2: whitelist de upload multipart — antes só o tamanho era validado e o
 * `file.type` (controlado pelo cliente) era repassado como contentType,
 * permitindo .html/.svg/executável disfarçado de exame. Aceita só
 * PDF/JPEG/PNG/HEIC/WebP, conferindo extensão + MIME + magic bytes.
 */
const TIPOS_UPLOAD: Record<string, { mimes: string[]; magic: (b: Buffer) => boolean }> = {
  pdf: {
    mimes: ["application/pdf"],
    magic: (b) => b.subarray(0, 4).toString("latin1") === "%PDF",
  },
  jpg: {
    mimes: ["image/jpeg"],
    magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  jpeg: {
    mimes: ["image/jpeg"],
    magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  png: {
    mimes: ["image/png"],
    magic: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  heic: {
    mimes: ["image/heic", "image/heif"],
    magic: (b) => b.length >= 12 && b.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1)/.test(b.subarray(8, 12).toString("latin1")),
  },
  webp: {
    mimes: ["image/webp"],
    magic: (b) => b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
};

function extensaoDe(nome: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
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
    let pacienteId: string | null = null;

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
      // B2: whitelist por extensão + MIME + magic bytes (o buffer é lido
      // uma vez e reusado no upload abaixo).
      const regra = TIPOS_UPLOAD[extensaoDe(nome) || extensaoDe(file.name)];
      const buf = Buffer.from(await file.arrayBuffer());
      if (!regra || !regra.mimes.includes((file.type || "").toLowerCase()) || !regra.magic(buf)) {
        return Response.json(
          { erro: "Tipo de arquivo não permitido. Envie PDF, JPEG, PNG, HEIC ou WebP." },
          { status: 400 },
        );
      }
      const contentTypeSeguro = regra.mimes[0];
      // A3: valida o destinatário ANTES de subir o blob ao Storage.
      const destino = await resolverDestinoUpload(usuario, form.get("pacienteId"), form.get("consultaId"));
      if (!destino.ok) return Response.json({ erro: destino.erro }, { status: destino.status });
      pacienteId = destino.pacienteId;

      if (supabaseServiceRoleKey()) {
        try {
          await garantirBuckets();
          const up = await uploadDocumento(usuario.id, nome, buf, contentTypeSeguro);
          storagePath = up.path;
        } catch (e) {
          console.error("[Storage] upload falhou, gravando só metadados", e);
        }
      }
    } else {
      // B1: guarda de objeto/tipo no ramo JSON — corpo null ou nome/tipo
      // não-string viravam 500 em .trim().
      const bruto = corpoObjeto(await lerCorpoJson(req));
      if (!bruto) {
        return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
      }
      const body = {
        nome: textoDoCorpo(bruto.nome),
        tipo: textoDoCorpo(bruto.tipo),
        tamanhoKb: typeof bruto.tamanhoKb === "number" && Number.isFinite(bruto.tamanhoKb) ? bruto.tamanhoKb : 0,
        consulta: textoDoCorpo(bruto.consulta),
        pacienteId: bruto.pacienteId,
        consultaId: bruto.consultaId,
      };
      if (!body.nome || !body.tipo) {
        return Response.json({ erro: "Informe nome e tipo do arquivo." }, { status: 400 });
      }
      nome = body.nome.trim().slice(0, 200);
      tipo = body.tipo.trim().slice(0, 60);
      tamanhoKb = Math.max(0, Math.min(20480, Math.round(body.tamanhoKb)));
      consulta = body.consulta?.trim().slice(0, 160) ?? "";
      const destino = await resolverDestinoUpload(usuario, body.pacienteId, body.consultaId);
      if (!destino.ok) return Response.json({ erro: destino.erro }, { status: destino.status });
      pacienteId = destino.pacienteId;
    }

    const arquivo = await db.arquivo.create({
      data: {
        nome: nome.slice(0, 200),
        tipo: tipo.slice(0, 60),
        tamanhoKb: Math.max(0, Math.min(20480, tamanhoKb)),
        enviadoPor: usuario.role === "MEDICO" ? "medico" : "paciente",
        usuarioId: usuario.id,
        pacienteId,
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
          // B8: a notificação de upload do médico ia ao REMETENTE (ele
          // mesmo) com título "Arquivo enviado ao paciente" — o paciente,
          // destinatário real (pacienteId resolvido no servidor), não era
          // notificado. Sem destinatário distinto (upload do próprio
          // paciente, forçado a ele mesmo), segue como confirmação a ele.
          usuarioId: usuario.role === "MEDICO" && pacienteId ? pacienteId : usuario.id,
        },
      ],
      {
        acao: "ARQUIVO_ENVIADO",
        categoria: "documento",
        entidade: "arquivo",
        entidadeId: arquivo.id,
        detalhes: `${nome} (${tipo}, ${arquivo.tamanhoKb}KB)${storagePath ? " [storage]" : ""}${pacienteId && pacienteId !== usuario.id ? ` → paciente ${pacienteId}` : ""}`,
      },
    );

    return ok({ arquivo: arquivoWire(arquivo), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
