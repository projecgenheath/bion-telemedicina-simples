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

/** Converte erros lançados pelos helpers (401/403) e erros genéricos em respostas JSON. */
export function falha(erro: unknown) {
  const e = erro as Error & { status?: number };
  const status = e?.status ?? 500;
  if (status >= 500) console.error("[API]", erro);
  const msg = e?.message ?? "Erro interno";
  if (status >= 500 && DB_INDISPONIVEL.some((p) => msg.includes(p))) {
    return NextResponse.json(
      {
        erro:
          "O sistema está com muita procura neste momento. Tente novamente em alguns segundos.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ erro: msg }, { status });
}
