import "server-only";
import crypto from "crypto";
import { canalSalaConsulta } from "@/lib/supabase/realtime";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";

/**
 * Tópico Realtime da sala: `sala:consulta:<consultaId>:<hmac>`.
 *
 * Duas camadas de proteção do chat e da sinalização da chamada:
 *  1. Canal PRIVADO: o navegador só entra se passar na policy RLS de
 *     realtime.messages (migração 20261006c_sala_realtime_privada.sql), que
 *     confere se o usuário logado no Supabase Auth é o médico ou o paciente
 *     DESTA consulta (o id vem do 3º pedaço do tópico).
 *  2. Sufixo HMAC-SHA256 (chave = service role, só no servidor): o nome do
 *     canal não é adivinhável a partir do id da consulta. Enquanto o projeto
 *     mantiver "Allow public access" ligado no Realtime (os canais de
 *     mensagens e notificações ainda são públicos), quem tentar assinar o
 *     tópico como canal público precisaria saber o sufixo, que só o GET da
 *     sala entrega, e só aos dois participantes.
 * Sem service role (desenvolvimento local), devolve o tópico simples — e o
 * Realtime fica desligado de qualquer forma (broadcast exige service role).
 */
export function topicoSala(consultaId: string): string {
  const base = canalSalaConsulta(consultaId);
  const chave = supabaseServiceRoleKey();
  if (!chave) return base;
  const h = crypto.createHmac("sha256", chave).update(`bion-sala:${consultaId}`).digest("base64url").slice(0, 32);
  return `${base}:${h}`;
}
