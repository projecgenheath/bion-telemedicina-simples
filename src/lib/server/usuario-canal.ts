import "server-only";
import crypto from "crypto";
import { canalMensagensUsuario, canalNotificacoes } from "@/lib/supabase/realtime";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";

/**
 * Tópicos Realtime PRIVADOS por usuário (mesmo modelo de sala-canal.ts):
 *   mensagens:user:<userId>:<hmac>
 *   notificacoes:user:<userId>:<hmac>
 *
 *  1. Canal PRIVADO: o navegador só entra se passar na policy RLS de
 *     realtime.messages (migração 20261013a_canais_usuario_privados.sql), que
 *     confere se o usuário logado no Supabase Auth é o DONO do canal (o id vem
 *     do 3º pedaço do tópico).
 *  2. Sufixo HMAC-SHA256 (chave = service role, só no servidor): o nome do
 *     canal não é adivinhável a partir do id do usuário. Só GET
 *     /api/realtime/canais entrega o tópico, e só ao próprio usuário.
 * Sem service role (desenvolvimento local) devolve o tópico simples — e o
 * Realtime fica desligado de qualquer forma (broadcast exige service role).
 */
function assinar(base: string, escopo: string, userId: string): string {
  const chave = supabaseServiceRoleKey();
  if (!chave) return base;
  const h = crypto.createHmac("sha256", chave).update(`bion-${escopo}:${userId}`).digest("base64url").slice(0, 32);
  return `${base}:${h}`;
}

export function topicoMensagensUsuario(userId: string): string {
  return assinar(canalMensagensUsuario(userId), "mensagens", userId);
}

export function topicoNotificacoesUsuario(userId: string): string {
  return assinar(canalNotificacoes(userId), "notificacoes", userId);
}
