import type { Prisma } from "@prisma/client";
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

type Cliente = Prisma.TransactionClient | typeof db;

/** Uma linha de Consentimento (data/hora em createdAt), sem nome: `quem` = id. */
function criarLinha(cli: Cliente, userId: string, perfil: PerfilAceite, finalidade: string, aceito: boolean) {
  return cli.consentimento.create({
    data: {
      pacienteId: perfil === "PACIENTE" ? userId : null,
      quem: userId,
      perfil,
      finalidade,
      documentos: 0,
      aceito,
    },
    select: { id: true, createdAt: true },
  });
}

export interface LinhasAceite {
  termos: string;
  privacidade: string;
  marketing: string | null;
}

/**
 * Grava as linhas do aceite do cadastro. Chamar DENTRO da mesma
 * `$transaction` que cria o usuário (tudo ou nada).
 */
export async function gravarAceiteCadastro(
  tx: Prisma.TransactionClient,
  userId: string,
  perfil: PerfilAceite,
  aceite: AceiteValidado,
): Promise<LinhasAceite> {
  const termos = await criarLinha(tx, userId, perfil, finalidadeTermos(aceite.versaoTermos), true);
  const privacidade = await criarLinha(tx, userId, perfil, finalidadePrivacidade(aceite.versaoPrivacidade), true);
  const marketing = aceite.marketing ? await criarLinha(tx, userId, perfil, finalidadeMarketing(true), true) : null;
  return { termos: termos.id, privacidade: privacidade.id, marketing: marketing?.id ?? null };
}

/** Auditoria do aceite (só id), depois da transação. */
export async function auditarAceiteCadastro(
  usuario: UsuarioSessao,
  perfil: PerfilAceite,
  aceite: AceiteValidado,
  linhas: LinhasAceite,
) {
  await registrarAudit(usuarioSemNome(usuario), {
    acao: ACAO_AUDIT_ACEITE_TERMOS,
    categoria: "consentimento",
    entidade: "usuario",
    entidadeId: usuario.id,
    detalhes: `Aceite ${perfil}: termos=${aceite.versaoTermos} (${linhas.termos}); privacidade=${aceite.versaoPrivacidade} (${linhas.privacidade})`,
  });
  if (linhas.marketing) {
    await registrarAudit(usuarioSemNome(usuario), {
      acao: ACAO_AUDIT_MARKETING_ACEITO,
      categoria: "consentimento",
      entidade: "consentimento",
      entidadeId: linhas.marketing,
      detalhes: `Marketing aceito no cadastro — versão ${VERSAO_MARKETING_OPTIN}`,
    });
  }
}

/** Opt-in/opt-out de marketing: sempre uma linha nova (histórico preservado). */
export async function registrarMarketing(usuario: UsuarioSessao, perfil: PerfilAceite, aceito: boolean) {
  const linha = await criarLinha(db, usuario.id, perfil, finalidadeMarketing(aceito), aceito);
  await registrarAudit(usuarioSemNome(usuario), {
    acao: aceito ? ACAO_AUDIT_MARKETING_ACEITO : ACAO_AUDIT_MARKETING_REVOGADO,
    categoria: "consentimento",
    entidade: "consentimento",
    entidadeId: linha.id,
    detalhes: `Marketing ${aceito ? "aceito" : "revogado"} — versão ${VERSAO_MARKETING_OPTIN} em ${linha.createdAt.toISOString()}`,
  });
  return linha;
}

/** Último registro de marketing do usuário (por `quem` = id, vale para qualquer perfil). */
export async function ultimoMarketing(userId: string) {
  return db.consentimento.findFirst({
    where: { quem: userId, finalidade: { startsWith: PREFIXO_FINALIDADE_MARKETING } },
    orderBy: { createdAt: "desc" },
    select: { aceito: true, createdAt: true },
  });
}
