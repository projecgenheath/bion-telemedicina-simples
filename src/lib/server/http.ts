import "server-only";
import { NextResponse } from "next/server";

export function ok<T>(dados: T) {
  return NextResponse.json(dados);
}

/** Padrões de falha de infraestrutura de banco (não devem vazar ao usuário). */
const DB_INDISPONIVEL = [
  "max clients reached",
  "EMAXCONN",
  "Timed out fetching a new connection",
  "Can't reach database server",
  "Connection terminated",
  "ETIMEDOUT",
  "ECONNREFUSED",
  " Too many connections",
];

/** Mensagem genérica para falhas inesperadas (o detalhe fica só no log do servidor). */
export const ERRO_INTERNO_PADRAO = "Erro interno. Tente novamente.";

/**
 * Converte erros lançados pelos helpers (401/403/404/409…) e erros genéricos
 * em respostas JSON.
 *
 * M2 (auditoria perfil do paciente): erro SEM `status` explícito é falha
 * inesperada (Prisma, bug, rede) — a mensagem interna (nomes de modelo/campo,
 * trechos de query) NÃO vai mais ao cliente: responde a mensagem genérica e
 * registra o detalhe só no log. Erros lançados de propósito com `status`
 * (ex.: `err.status = 404`) continuam com a própria mensagem.
 */
export function falha(erro: unknown) {
  const e = erro as Error & { status?: number };
  const statusExplicito = typeof e?.status === "number";
  const status = statusExplicito ? (e.status as number) : 500;
  if (status >= 500) console.error("[API]", erro);
  const msg = e?.message ?? "";
  if (status >= 500 && DB_INDISPONIVEL.some((p) => msg.includes(p))) {
    return NextResponse.json(
      {
        erro:
          "O sistema está com muita procura neste momento. Tente novamente em alguns segundos.",
      },
      { status: 503 },
    );
  }
  if (!statusExplicito || !msg) {
    return NextResponse.json({ erro: ERRO_INTERNO_PADRAO }, { status });
  }
  return NextResponse.json({ erro: msg }, { status });
}
