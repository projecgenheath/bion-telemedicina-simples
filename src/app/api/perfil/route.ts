import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, perfilPacienteWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { validarFotoPerfil, validarPatchPerfil } from "@/lib/server/validar-perfil";

/** Teto do corpo (texto JSON). Folga para a foto de perfil (~150 KB em base64). */
const CORPO_MAX_CHARS = 300_000;

/** Atualização do perfil do próprio paciente. */
export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");

    // A1: corpo lido com teto de tamanho e JSON validado (antes: `as` cego).
    const bruto = await req.text();
    if (bruto.length > CORPO_MAX_CHARS) {
      return Response.json({ erro: "Dados enviados excedem o tamanho permitido." }, { status: 413 });
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }

    const validacao = validarPatchPerfil(corpo);
    if (!validacao.ok) {
      return Response.json({ erro: validacao.erro, campo: validacao.campo }, { status: 400 });
    }
    const { nome, perfil, campos } = validacao.valor;

    // A2: foto validada no servidor (data URL JPEG/PNG/WebP, assinatura
    // binária coerente, ≤ ~150 KB). Antes aceitava qualquer string.
    const fotoBruta = (corpo as Record<string, unknown>).foto;
    let foto: string | null | undefined;
    if (fotoBruta !== undefined) {
      const rf = validarFotoPerfil(fotoBruta);
      if (!rf.ok) {
        return Response.json({ erro: rf.erro, campo: rf.campo }, { status: 400 });
      }
      foto = rf.valor;
      campos.push("foto");
    }

    if (!campos.length) {
      return Response.json({ erro: "Nenhum campo válido para atualizar." }, { status: 400 });
    }

    const perfilAtual = await db.perfilPaciente.findUnique({ where: { userId: usuario.id } });
    if (!perfilAtual) {
      return Response.json({ erro: "Perfil não encontrado." }, { status: 404 });
    }

    await db.$transaction([
      ...(nome !== undefined ? [db.user.update({ where: { id: usuario.id }, data: { nome } })] : []),
      db.perfilPaciente.update({
        where: { userId: usuario.id },
        data: { ...perfil, ...(foto !== undefined ? { foto } : {}) },
      }),
    ]);

    // Contrato delta (auditoria FASE 2): devolve APENAS o perfil completo
    // atualizado + auditoria — o nome novo sincroniza a sessão no cliente.
    // A1: a auditoria lista só os campos ACEITOS (não as chaves cruas do cliente).
    const efeitos = await aplicarSideEffects(usuario, undefined, {
      acao: "PERFIL_ATUALIZADO",
      categoria: "usuario",
      detalhes: `Dados atualizados: ${campos.join(", ")}`,
    });

    const perfilFresco = await db.perfilPaciente.findUnique({
      where: { userId: usuario.id },
      include: { user: { select: { nome: true, email: true } } },
    });

    return ok({
      ...(perfilFresco ? { perfilPacienteCompleto: perfilPacienteWire(perfilFresco) } : {}),
      ...efeitos,
    });
  } catch (erro) {
    return falha(erro);
  }
}
