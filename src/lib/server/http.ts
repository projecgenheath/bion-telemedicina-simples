import "server-only";
import { NextResponse } from "next/server";

export function ok<T>(dados: T) {
  return NextResponse.json(dados);
}

/** Converte erros lançados pelos helpers (401/403) e erros genéricos em respostas JSON. */
export function falha(erro: unknown) {
  const e = erro as Error & { status?: number };
  const status = e?.status ?? 500;
  if (status >= 500) console.error("[API]", erro);
  return NextResponse.json({ erro: e?.message ?? "Erro interno" }, { status });
}
