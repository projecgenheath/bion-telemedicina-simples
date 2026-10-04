import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, medicoWire, type EfeitosCriados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { erroGradeVedada, horariosVedadosDaGrade } from "@/lib/server/bloqueio-agenda";

type MedicoPatch = {
  acao?: "aprovar" | "suspender" | "atualizar";
  nome?: string;
  crm?: string;
  especialidade?: string;
  subespecialidades?: string[];
  valor?: number;
  formacao?: string;
  experiencia?: string;
  idiomas?: string[];
  bio?: string;
  horariosDisponiveis?: string[];
  foto?: string;
};

/** Campos que o PRÓPRIO médico pode editar no seu perfil. Nome, CRM,
 *  especialidade e status são validados/alterados só pelo administrador. */
const CAMPOS_AUTOEDICAO = new Set([
  "acao",
  "bio",
  "formacao",
  "experiencia",
  "idiomas",
  "subespecialidades",
  "valor",
  "horariosDisponiveis",
  "foto",
]);
const VALOR_MIN = 1;
const VALOR_MAX = 5000;
const TAM_MAX_TEXTO = 2000;
const TAM_MAX_FOTO = 700_000; // data URL (~500 KB de imagem)

function erroHttp(mensagem: string, status: number) {
  return Response.json({ erro: mensagem }, { status });
}

/** Valida o PATCH de autoedição do médico. Devolve mensagem de erro ou null. */
function validarAutoedicao(
  body: MedicoPatch,
  atual: { nome: string; crm: string; especialidade: string },
): string | null {
  if (body.acao && body.acao !== "atualizar") return "Ação permitida apenas ao administrador.";
  // O cliente pode reenviar nome/CRM/especialidade sem alteração; mudar exige admin.
  if (body.nome !== undefined && body.nome.trim() !== atual.nome) {
    return "Alteração de nome é feita pelo administrador.";
  }
  if (body.crm !== undefined && body.crm.trim() !== atual.crm) {
    return "Alteração de CRM é feita pelo administrador (requer nova validação).";
  }
  if (body.especialidade !== undefined && body.especialidade.trim() !== atual.especialidade) {
    return "Alteração de especialidade é feita pelo administrador.";
  }
  for (const k of Object.keys(body)) {
    if (!CAMPOS_AUTOEDICAO.has(k) && !["nome", "crm", "especialidade"].includes(k)) {
      return `Campo não editável: ${k}.`;
    }
  }
  if (body.valor !== undefined) {
    if (typeof body.valor !== "number" || !Number.isFinite(body.valor) || body.valor < VALOR_MIN || body.valor > VALOR_MAX) {
      return `Valor da consulta deve estar entre R$ ${VALOR_MIN} e R$ ${VALOR_MAX}.`;
    }
  }
  for (const k of ["bio", "formacao", "experiencia"] as const) {
    const v = body[k];
    if (v !== undefined && (typeof v !== "string" || v.length > TAM_MAX_TEXTO)) {
      return `Campo ${k} inválido (máx. ${TAM_MAX_TEXTO} caracteres).`;
    }
  }
  for (const k of ["idiomas", "subespecialidades", "horariosDisponiveis"] as const) {
    const v = body[k];
    if (v !== undefined && (!Array.isArray(v) || v.length > 100 || v.some((x) => typeof x !== "string" || x.length > 60))) {
      return `Campo ${k} inválido.`;
    }
  }
  if (body.horariosDisponiveis?.some((h) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) {
    return "Horários devem estar no formato HH:MM.";
  }
  if (body.foto !== undefined) {
    if (
      typeof body.foto !== "string" ||
      body.foto.length > TAM_MAX_FOTO ||
      (body.foto !== "" && !/^data:image\/(png|jpe?g|webp);base64,/.test(body.foto))
    ) {
      return "Foto inválida (PNG, JPEG ou WebP, até ~500 KB).";
    }
  }
  return null;
}

/** Ações administrativas sobre médicos: aprovar, suspender, editar e excluir.
 *  O próprio MÉDICO pode usar a ação "atualizar" no SEU perfil, restrita aos
 *  campos de CAMPOS_AUTOEDICAO (bio, formação, valor, horários, foto…).
 *  Contrato delta (auditoria FASE 2): toda ação devolve APENAS o médico
 *  atualizado + efeitos (notificações/auditoria) — sem recarregar o estado. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ator = await exigirPapel("ADMIN", "MEDICO");
    const { id } = await params;
    const body = (await req.json()) as MedicoPatch;
    // ator = ADMIN (gestão) ou o próprio MÉDICO (autoedição restrita)
    const autoedicao = ator.role === "MEDICO";

    // Médico só edita o PRÓPRIO perfil (comparação por ID, nunca por nome).
    if (autoedicao && ator.id !== id) {
      return erroHttp("Acesso negado", 403);
    }

    const medico = await db.user.findFirst({
      where: { id, role: "MEDICO" },
      include: { perfilMedico: true },
    });
    if (!medico?.perfilMedico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 404 });
    }

    if (autoedicao) {
      const erro = validarAutoedicao(body, {
        nome: medico.nome,
        crm: medico.perfilMedico.crm,
        especialidade: medico.perfilMedico.especialidade,
      });
      if (erro) return erroHttp(erro, erro === "Ação permitida apenas ao administrador." ? 403 : 400);
    }

    const acao = body.acao ?? "atualizar";
    // Sem teleconsulta entre 23:00 e 00:00 (São Paulo): vale para o médico e
    // para o administrador. Horário cuja consulta (DURACAO_CONSULTA_MIN)
    // encosta na janela → 400, nada é gravado.
    if (acao === "atualizar") {
      const vedados = horariosVedadosDaGrade(body.horariosDisponiveis);
      if (vedados.length) return erroHttp(erroGradeVedada(vedados), 400);
    }
    let efeitos: EfeitosCriados = { notificacoes: [], audit: null };

    if (acao === "aprovar") {
      // P1 (2026-09): aprovar também reativa o usuário (User.status) — a
      // suspensão agora bloqueia em DOIS níveis (User.status + perfilMedico).
      await db.$transaction([
        db.user.update({ where: { id }, data: { status: "ativo" } }),
        db.perfilMedico.update({ where: { userId: id }, data: { status: "ativo" } }),
      ]);
      efeitos = await aplicarSideEffects(
        ator,
        [
          {
            tipo: "agenda",
            titulo: "Cadastro aprovado",
            texto: "Seu CRM foi validado e seu perfil está ativo para teleconsultas na BION.",
            usuarioId: medico.id,
          },
        ],
        {
          acao: "MEDICO_APROVADO",
          categoria: "admin",
          severidade: "critical",
          entidade: "medico",
          entidadeId: id,
          detalhes: `CRM de ${medico.nome} validado e ativado`,
        },
      );
    } else if (acao === "suspender") {
      // P1 (2026-09): a suspensão antes mexia SÓ no perfilMedico.status — o
      // User.status continuava "ativo", então login e getSessao seguiam
      // aceitando o médico suspenso (o login checa User.status). Agora:
      // (1) User.status = suspenso → getSessao/login bloqueiam e as sessões
      // vivas são revogadas; (2) perfilMedico.status = suspenso (listagem).
      await db.$transaction([
        db.user.update({ where: { id }, data: { status: "suspenso" } }),
        db.perfilMedico.update({ where: { userId: id }, data: { status: "suspenso" } }),
        db.sessao.deleteMany({ where: { userId: id } }),
      ]);
      efeitos = await aplicarSideEffects(
        ator,
        [
          {
            tipo: "agenda",
            titulo: "Cadastro suspenso",
            texto: "Seu perfil de médico foi suspenso. Entre em contato com o suporte.",
            usuarioId: medico.id,
          },
        ],
        {
          acao: "MEDICO_SUSPENSO",
          categoria: "admin",
          severidade: "critical",
          entidade: "medico",
          entidadeId: id,
          detalhes: `${medico.nome} suspenso da plataforma`,
        },
      );
    } else {
      await db.$transaction([
        db.user.update({
          where: { id },
          data: body.nome && !autoedicao ? { nome: body.nome.trim() } : {},
        }),
        db.perfilMedico.update({
          where: { userId: id },
          data: {
            ...(body.crm !== undefined && !autoedicao ? { crm: body.crm } : {}),
            ...(body.especialidade !== undefined && !autoedicao
              ? { especialidade: body.especialidade }
              : {}),
            ...(body.subespecialidades !== undefined
              ? { subespecialidades: JSON.stringify(body.subespecialidades) }
              : {}),
            ...(body.valor !== undefined ? { valor: body.valor } : {}),
            ...(body.formacao !== undefined ? { formacao: body.formacao } : {}),
            ...(body.experiencia !== undefined ? { experiencia: body.experiencia } : {}),
            ...(body.idiomas !== undefined ? { idiomas: JSON.stringify(body.idiomas) } : {}),
            ...(body.bio !== undefined ? { bio: body.bio } : {}),
            ...(body.horariosDisponiveis !== undefined
              ? { horariosDisponiveis: JSON.stringify(body.horariosDisponiveis) }
              : {}),
            ...(body.foto !== undefined && autoedicao ? { foto: body.foto || null } : {}),
          },
        }),
      ]);
      efeitos = await aplicarSideEffects(ator, undefined, {
        acao: autoedicao ? "MEDICO_PERFIL_AUTOEDITADO" : "MEDICO_ATUALIZADO",
        categoria: autoedicao ? "usuario" : "admin",
        entidade: "medico",
        entidadeId: id,
        detalhes: `Médico ${medico.nome}: dados atualizados (${Object.keys(body).filter((k) => k !== "acao" && k !== "foto").concat(body.foto !== undefined ? ["foto"] : []).join(", ")})`,
      });
    }

    const perfil = await db.perfilMedico.findUnique({
      where: { userId: id },
      include: { user: { select: { id: true, nome: true } } },
    });

    return ok({ ...(perfil ? { medico: medicoWire(perfil) } : {}), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;

    // P1 (2026-09): o DELETE de médico NÃO remove mais o cadastro (o nome do
    // profissional integra prontuários e atendimentos passados). Passa a
    // ARQUIVAR: usuário inativo (sem login/sessões) + perfil arquivado,
    // preservando histórico e prontuário.
    const medico = await db.user.findFirst({ where: { id, role: "MEDICO" } });
    if (!medico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 404 });
    }

    await db.$transaction([
      db.user.update({ where: { id }, data: { status: "inativo" } }),
      db.perfilMedico.update({ where: { userId: id }, data: { status: "arquivado" } }),
      db.sessao.deleteMany({ where: { userId: id } }),
    ]);
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "MEDICO_ARQUIVADO",
      categoria: "admin",
      severidade: "critical",
      detalhes: `Cadastro de ${medico.nome} arquivado; prontuário, consultas e documentos preservados`,
      entidade: "medico",
      entidadeId: id,
    });

    // Comportamento idêntico ao estado fresco anterior: o médico ARQUIVADO
    // continua na listagem (status "arquivado") — histórico preservado.
    const perfil = await db.perfilMedico.findUnique({
      where: { userId: id },
      include: { user: { select: { id: true, nome: true } } },
    });

    return ok({ ...(perfil ? { medico: medicoWire(perfil) } : {}), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}
