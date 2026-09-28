import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfigurado, supabaseServiceRoleKey } from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export const COOKIE_SESSAO = "bion_sessao";
const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  role: "PACIENTE" | "MEDICO" | "ADMIN";
  precisaTrocarSenha: boolean;
  /** Presente quando autenticado via Supabase Auth */
  supabaseId?: string | null;
};

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  if (!hash || hash.startsWith("supabase:")) return false;
  return bcrypt.compare(senha, hash);
}

const MAX_SESSOES_POR_USUARIO = 5;

/** Sessão legada (cookie Prisma) — fallback para contas ainda não migradas. */
export async function criarSessaoLegada(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DURACAO_SESSAO_MS);
  await db.sessao.create({ data: { id: token, userId, expiresAt } });
  const agora = new Date();
  await db.sessao.deleteMany({ where: { userId, expiresAt: { lt: agora } } }).catch(() => {});
  const vivas = await db.sessao.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (vivas.length > MAX_SESSOES_POR_USUARIO) {
    const excesso = vivas.slice(MAX_SESSOES_POR_USUARIO).map((s) => s.id);
    await db.sessao.deleteMany({ where: { id: { in: excesso } } }).catch(() => {});
  }
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

/** @deprecated use criarSessaoLegada — mantido para imports existentes */
export async function criarSessao(userId: string): Promise<string> {
  return criarSessaoLegada(userId);
}

function usuarioDeRow(user: {
  id: string;
  nome: string;
  email: string;
  role: string;
  precisaTrocarSenha: boolean;
  supabaseId?: string | null;
  status: string;
}): UsuarioSessao | null {
  if (user.status !== "ativo") return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role as UsuarioSessao["role"],
    precisaTrocarSenha: user.precisaTrocarSenha,
    supabaseId: user.supabaseId,
  };
}

/**
 * Sessão atual: 1) Supabase Auth (JWT/cookie) 2) cookie legado bion_sessao.
 */
export async function getSessao(): Promise<UsuarioSessao | null> {
  // 1) Supabase Auth
  if (supabaseConfigurado()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      if (authUser?.email) {
        let row =
          (await db.user.findFirst({
            where: { OR: [{ supabaseId: authUser.id }, { email: authUser.email.toLowerCase() }] },
          })) ?? null;
        if (row && !row.supabaseId) {
          row = await db.user.update({
            where: { id: row.id },
            data: { supabaseId: authUser.id },
          });
        }
        if (row) {
          const u = usuarioDeRow(row);
          if (u) return u;
          // inativo: encerra auth supabase
          await supabase.auth.signOut().catch(() => {});
          return null;
        }
      }
    } catch {
      /* cai no legado */
    }
  }

  // 2) Legado
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
  if (sessao.user.status !== "ativo") {
    await db.sessao.deleteMany({ where: { userId: sessao.user.id } }).catch(() => {});
    return null;
  }
  return usuarioDeRow(sessao.user);
}

export async function destruirSessao(): Promise<void> {
  if (supabaseConfigurado()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      /* ignora */
    }
  }
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    await db.sessao.deleteMany({ where: { id: token } }).catch(() => {});
  }
  jar.delete(COOKIE_SESSAO);
}

export async function tokenSessaoAtual(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_SESSAO)?.value ?? null;
}

export async function exigirSessao(): Promise<UsuarioSessao> {
  const s = await getSessao();
  if (!s) {
    const err = new Error("Não autenticado") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return s;
}

export async function exigirPapel(...papeis: UsuarioSessao["role"][]): Promise<UsuarioSessao> {
  const s = await exigirSessao();
  if (!papeis.includes(s.role)) {
    const err = new Error("Acesso negado") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return s;
}

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
) {
  try {
    return await db.auditLog.create({
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
    return null;
  }
}

/**
 * Garante usuário Prisma ligado ao Auth do Supabase (cadastro ou primeiro login).
 */
export async function garantirUsuarioPrismaDeAuth(opts: {
  supabaseId: string;
  email: string;
  nome: string;
  senhaHash?: string;
}): Promise<{ id: string; nome: string; email: string; role: string; precisaTrocarSenha: boolean; status: string; supabaseId: string | null }> {
  const email = opts.email.trim().toLowerCase();
  const existente = await db.user.findFirst({
    where: { OR: [{ supabaseId: opts.supabaseId }, { email }] },
  });
  if (existente) {
    if (!existente.supabaseId) {
      return db.user.update({
        where: { id: existente.id },
        data: { supabaseId: opts.supabaseId },
      });
    }
    return existente;
  }
  return db.user.create({
    data: {
      supabaseId: opts.supabaseId,
      nome: opts.nome.trim() || email.split("@")[0],
      email,
      senhaHash: opts.senhaHash ?? `supabase:${opts.supabaseId}`,
      role: "PACIENTE",
      perfilPaciente: { create: {} },
    },
  });
}

/** Admin client opcional (service role). */
export function supabaseAdminOuNull() {
  const key = supabaseServiceRoleKey();
  if (!key || !supabaseConfigurado()) return null;
  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
