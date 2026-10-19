import { NextRequest } from "next/server";
import { ok, falha } from "@/lib/server/http";
import { autorizadoCron, rodarToque } from "@/lib/server/toque";

export const dynamic = "force-dynamic";
// Plano Hobby; o job para em ORCAMENTO_MS (7 s) e o pg_net espera até 10 s.
export const maxDuration = 10;

/**
 * Job do toque da consulta, a cada minuto: pg_cron + pg_net no Supabase
 * (migração 20261019a_pg_cron_toque.sql) chamam esta rota com
 * `Authorization: Bearer <CRON_SECRET>`. A Vercel Hobby só tem cron diário.
 * Idempotente: pode rodar duas vezes no mesmo minuto sem tocar em dobro
 * (ver src/lib/server/toque.ts). Resposta só com contagens.
 */
async function executar(req: NextRequest) {
  try {
    const ok_ = autorizadoCron(req);
    if (ok_ === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!ok_) return Response.json({ erro: "Não autorizado." }, { status: 401 });
    return ok(await rodarToque(new Date()));
  } catch (erro) {
    return falha(erro);
  }
}

export const GET = executar;
export const POST = executar;
