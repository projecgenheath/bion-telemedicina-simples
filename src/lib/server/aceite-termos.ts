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
  VERSAO_PRIVACIDADE,
  VERSAO_TERMOS_POR_PERFIL,
  CODIGO_ACEITE_TERMOS_PENDENTE,
  ERRO_ACEITE_TERMOS_PENDENTE,
  aceitePendente,
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

/** Finalidades de termos/privacidade vigentes já aceitas pelo usuário (por id). */
async function finalidadesVigentesAceitas(userId: string, perfil: PerfilAceite): Promise<string[]> {
  const versaoTermos = VERSAO_TERMOS_POR_PERFIL[perfil];
  const alvo = [finalidadePrivacidade(VERSAO_PRIVACIDADE), ...(versaoTermos ? [finalidadeTermos(versaoTermos)] : [])];
  const linhas = await db.consentimento.findMany({
    where: { quem: userId, perfil, aceito: true, finalidade: { in: alvo } },
    select: { finalidade: true },
  });
  return linhas.map((l) => l.finalidade);
}

/** true quando falta o aceite dos termos/privacidade vigentes do perfil. */
export async function aceiteVigentePendente(userId: string, perfil: PerfilAceite): Promise<boolean> {
  return aceitePendente(perfil, await finalidadesVigentesAceitas(userId, perfil));
}

/**
 * Aceite pós-cadastro (conta criada pelo admin ou anterior aos termos).
 * Grava só as linhas que faltam, numa transação, e audita só com ids/versões.
 */
export async function gravarAceiteAtualizacao(usuario: UsuarioSessao, perfil: PerfilAceite, aceite: AceiteValidado) {
  const linhas = await db.$transaction(async (tx) => {
    const ja = new Set(
      (
        await tx.consentimento.findMany({
          where: {
            quem: usuario.id,
            perfil,
            aceito: true,
            finalidade: { in: [finalidadeTermos(aceite.versaoTermos), finalidadePrivacidade(aceite.versaoPrivacidade)] },
          },
          select: { finalidade: true },
        })
      ).map((l) => l.finalidade),
    );
    const fT = finalidadeTermos(aceite.versaoTermos);
    const fP = finalidadePrivacidade(aceite.versaoPrivacidade);
    const termos = ja.has(fT) ? null : (await criarLinha(tx, usuario.id, perfil, fT, true)).id;
    const privacidade = ja.has(fP) ? null : (await criarLinha(tx, usuario.id, perfil, fP, true)).id;
    return { termos, privacidade };
  });
  if (linhas.termos || linhas.privacidade) {
    await registrarAudit(usuarioSemNome(usuario), {
      acao: ACAO_AUDIT_ACEITE_TERMOS,
      categoria: "consentimento",
      entidade: "usuario",
      entidadeId: usuario.id,
      detalhes: `Aceite ${perfil}: termos=${aceite.versaoTermos} (${linhas.termos ?? "já aceito"}); privacidade=${aceite.versaoPrivacidade} (${linhas.privacidade ?? "já aceito"})`,
    });
  }
  return linhas;
}

/**
 * Portão do servidor para AGENDAR algo novo: paciente sem o aceite vigente
 * (termos + privacidade) recebe 403 antes de qualquer gravação.
 * Erro ao consultar o banco também bloqueia (falha fechada). null = pode seguir.
 * Consultas já pagas, cancelamento/reembolso e exclusão da conta não passam por aqui.
 */
export async function exigirAceiteTermosPaciente(usuario: { id: string; role: string }): Promise<Response | null> {
  if (usuario.role !== "PACIENTE") return null;
  let pendente = true;
  try {
    pendente = await aceiteVigentePendente(usuario.id, "PACIENTE");
  } catch {
    pendente = true;
  }
  return pendente
    ? Response.json({ erro: ERRO_ACEITE_TERMOS_PENDENTE, codigo: CODIGO_ACEITE_TERMOS_PENDENTE }, { status: 403 })
    : null;
}

export { CODIGO_ACEITE_TERMOS_PENDENTE, ERRO_ACEITE_TERMOS_PENDENTE };
