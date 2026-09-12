import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const COOKIE_SESSAO = "bion_sessao";
const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  role: "PACIENTE" | "MEDICO" | "ADMIN";
};

/** Hash da senha com bcrypt (custo 10) */
export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

/** Verifica a senha contra o hash armazenado */
export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/** Cria uma sessão no banco e grava o cookie httpOnly */
export async function criarSessao(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DURACAO_SESSAO_MS);
  await db.sessao.create({ data: { id: token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // ambiente de preview (http); em produção com HTTPS usar true
    path: "/",
    expires: expiresAt,
  });
  return token;
}

/** Lê a sessão atual a partir do cookie e valida no banco */
export async function getSessao(): Promise<UsuarioSessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const sessao = await db.sessao.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!sessao) return null;
  if (sessao.expiresAt.getTime() < Date.now()) {
    await db.sessao.delete({ where: { id: token } }).catch(() => {});
    return null;
  }
  return {
    id: sessao.user.id,
    nome: sessao.user.nome,
    email: sessao.user.email,
    role: sessao.user.role as UsuarioSessao["role"],
  };
}

/** Remove a sessão atual (logout) */
export async function destruirSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    await db.sessao.deleteMany({ where: { id: token } });
  }
  jar.delete(COOKIE_SESSAO);
}

/** Exige sessão válida; lança erro 401 caso contrário */
export async function exigirSessao(): Promise<UsuarioSessao> {
  const s = await getSessao();
  if (!s) {
    const err = new Error("Não autenticado") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return s;
}

/** Exige papel específico; lança erro 403 caso contrário */
export async function exigirPapel(...papeis: UsuarioSessao["role"][]): Promise<UsuarioSessao> {
  const s = await exigirSessao();
  if (!papeis.includes(s.role)) {
    const err = new Error("Acesso negado") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return s;
}

/** Registra log de auditoria com identidade vinda da sessão (não confia no cliente) */
export async function registrarAudit(
  usuario: UsuarioSessao | null,
  log: {
    acao: string;
    categoria: string;
    severidade?: "info" | "warning" | "critical";
    entidade?: string;
    entidadeId?: string;
    detalhes?: string;
  },
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        acao: log.acao,
        categoria: log.categoria,
        severidade: log.severidade ?? "info",
        usuarioId: usuario?.id ?? null,
        usuarioNome: usuario?.nome ?? "Anônimo",
        role: usuario?.role ?? "DESCONHECIDO",
        entidade: log.entidade,
        entidadeId: log.entidadeId,
        detalhes: log.detalhes,
      },
    });
  } catch {
    // auditoria nunca deve quebrar a operação principal
  }
}
