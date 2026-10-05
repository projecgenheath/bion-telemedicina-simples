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

/** Mensagem quando o banco recusa mexer em algo que já entrou num repasse. */
export const ERRO_JA_REPASSADO = "Esse registro já entrou num repasse e não pode ser alterado.";

/**
 * FK violada (P2003) por causa das tabelas de repasse: Repasse, RepasseItem e
 * RepasseAjuste usam ON DELETE/UPDATE RESTRICT; apagar ou trocar o médico de
 * algo já repassado estoura aqui. Outras FKs continuam sendo erro interno.
 */
function violouRepasse(e: { code?: unknown; message?: unknown; meta?: unknown }): boolean {
  if (e?.code !== "P2003") return false;
  const texto = `${JSON.stringify(e.meta ?? {})} ${typeof e.message === "string" ? e.message : ""}`;
  return /Repasse/.test(texto);
}

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
  if (violouRepasse(erro as { code?: unknown })) {
    return NextResponse.json({ erro: ERRO_JA_REPASSADO }, { status: 409 });
  }
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
