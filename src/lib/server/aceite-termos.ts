import { db } from "@/lib/db";
import { registrarAudit, type UsuarioSessao } from "@/lib/server/auth";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import {
  ACAO_AUDIT_ACEITE_TERMOS,
  ACAO_AUDIT_MARKETING_ACEITO,
  ACAO_AUDIT_MARKETING_REVOGADO,
  PREFIXO_FINALIDADE_MARKETING,
  VERSAO_MARKETING_OPTIN,
  finalidadeMarketing,
  finalidadePrivacidade,
  finalidadeTermos,
  type AceiteValidado,
  type PerfilAceite,
} from "@/lib/aceite-termos";

/** Uma linha de Consentimento (data/hora em createdAt), sem nome: `quem` = id. */
function criarLinha(usuario: UsuarioSessao, perfil: PerfilAceite, finalidade: string, aceito: boolean) {
  return db.consentimento.create({
    data: {
      pacienteId: perfil === "PACIENTE" ? usuario.id : null,
      quem: usuario.id,
      perfil,
      finalidade,
      documentos: 0,
      aceito,
    },
    select: { id: true, createdAt: true },
  });
}

/** Grava o aceite do cadastro (termos + privacidade e, se marcado, marketing) + auditoria só com id. */
export async function registrarAceiteTermos(usuario: UsuarioSessao, perfil: PerfilAceite, aceite: AceiteValidado) {
  const termos = await criarLinha(usuario, perfil, finalidadeTermos(aceite.versaoTermos), true);
  const privacidade = await criarLinha(usuario, perfil, finalidadePrivacidade(aceite.versaoPrivacidade), true);
  await registrarAudit(usuarioSemNome(usuario), {
    acao: ACAO_AUDIT_ACEITE_TERMOS,
    categoria: "consentimento",
    entidade: "usuario",
    entidadeId: usuario.id,
    detalhes: `Aceite ${perfil}: termos=${aceite.versaoTermos} (${termos.id}); privacidade=${aceite.versaoPrivacidade} (${privacidade.id})`,
  });
  if (aceite.marketing) await registrarMarketing(usuario, perfil, true);
}

/** Opt-in/opt-out de marketing: sempre uma linha nova (histórico preservado). */
export async function registrarMarketing(usuario: UsuarioSessao, perfil: PerfilAceite, aceito: boolean) {
  const linha = await criarLinha(usuario, perfil, finalidadeMarketing(aceito), aceito);
  await registrarAudit(usuarioSemNome(usuario), {
    acao: aceito ? ACAO_AUDIT_MARKETING_ACEITO : ACAO_AUDIT_MARKETING_REVOGADO,
    categoria: "consentimento",
    entidade: "consentimento",
    entidadeId: linha.id,
    detalhes: `Marketing ${aceito ? "aceito" : "revogado"} — versão ${VERSAO_MARKETING_OPTIN} em ${linha.createdAt.toISOString()}`,
  });
  return linha;
}

export async function ultimoMarketing(pacienteId: string) {
  return db.consentimento.findFirst({
    where: { pacienteId, finalidade: { startsWith: PREFIXO_FINALIDADE_MARKETING } },
    orderBy: { createdAt: "desc" },
    select: { aceito: true, createdAt: true },
  });
}
