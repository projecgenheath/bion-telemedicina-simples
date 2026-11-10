import { NextRequest } from "next/server";
import { ok, falha } from "@/lib/server/http";
import { autorizadoCron } from "@/lib/server/toque";
import { rodarAvisosLembretes } from "@/lib/server/lembretes-aviso";

export const dynamic = "force-dynamic";
// Plano Hobby; o job para no orçamento de 7 s e o pg_net espera até 10 s.
export const maxDuration = 10;

/**
 * Job dos avisos de lembrete, a cada minuto: pg_cron + pg_net no Supabase
 * (migração 20261104b_pg_cron_lembretes.sql, NÃO APLICADA) chamam esta
 * rota com `Authorization: Bearer <CRON_SECRET>` — mesmo mecanismo do
 * toque da consulta, porque a Vercel Hobby só tem cron diário.
 * Pré-requisito: migração 20261104a (colunas feitoEm/ultimoDisparoEm);
 * sem ela, a rodada responde { ativo: false } e nada dispara.
 * Resposta só com contagens.
 */
async function executar(req: NextRequest) {
  try {
    const ok_ = autorizadoCron(req);
    if (ok_ === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!ok_) return Response.json({ erro: "Não autorizado." }, { status: 401 });
    return ok(await rodarAvisosLembretes(new Date()));
  } catch (erro) {
    return falha(erro);
  }
}

export const GET = executar;
export const POST = executar;
