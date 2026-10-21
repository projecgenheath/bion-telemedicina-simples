-- =====================================================================
-- BION — Canais Realtime PRIVADOS de mensagens e notificações por usuário
-- =====================================================================
-- NÃO aplicada automaticamente. Precisa do ok do Alisson. Aplique no SQL
-- Editor do Supabase (ou via MCP apply_migration) ANTES do merge do PR
-- "canais de mensagens e notificações privados": sem esta policy, o
-- navegador não consegue entrar nos canais privados e mensagens/notificações
-- ficam só no polling (nada quebra, só perde o tempo real).
-- Idempotente: pode rodar de novo sem erro.
--
-- Contexto
--   Mensagens e notificações dirigidas eram enviadas por Broadcast nos
--   tópicos PÚBLICOS `mensagens:user:<id>` e `notificacoes:user:<id>`, com o
--   conteúdo no payload: quem tivesse a anon key e o id do usuário lia tudo.
--   Agora o tópico é `mensagens:user:<userId>:<hmac>` /
--   `notificacoes:user:<userId>:<hmac>` (src/lib/server/usuario-canal.ts),
--   o servidor publica com private: true e o navegador assina com
--   `config: { private: true }` + setAuth.
--
-- Quem envia
--   SÓ o servidor (service role, ignora RLS). Sem policy de INSERT.
--
-- Quem recebe (policy de SELECT)
--   Usuário authenticated cujo User.supabaseId = auth.uid() é o DONO do canal
--   (User.id = 3º pedaço do tópico), com conta ativa. Só 'broadcast'.
--   Mesmo modelo de 20261006c_sala_realtime_privada.sql (função SECURITY
--   DEFINER em bion_privado, search_path vazio).
--
-- Não afeta
--   A policy da sala (bion_sala_recebe) nem as tabelas de public.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS bion_privado;
REVOKE ALL ON SCHEMA bion_privado FROM PUBLIC;
GRANT USAGE ON SCHEMA bion_privado TO authenticated;

CREATE OR REPLACE FUNCTION bion_privado.pode_acessar_canal_usuario(p_topico text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (p_topico LIKE 'mensagens:user:%' OR p_topico LIKE 'notificacoes:user:%')
    AND EXISTS (
      SELECT 1
      FROM public."User" u
      WHERE u.id = split_part(p_topico, ':', 3)
        AND u."supabaseId" = (SELECT auth.uid())::text
        AND u.status = 'ativo'
    );
$$;

REVOKE ALL ON FUNCTION bion_privado.pode_acessar_canal_usuario(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bion_privado.pode_acessar_canal_usuario(text) FROM anon;
GRANT EXECUTE ON FUNCTION bion_privado.pode_acessar_canal_usuario(text) TO authenticated;

DROP POLICY IF EXISTS bion_canal_usuario_recebe ON realtime.messages;
CREATE POLICY bion_canal_usuario_recebe
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND bion_privado.pode_acessar_canal_usuario((SELECT realtime.topic()))
  );

COMMIT;

-- Conferência (opcional):
--   SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'realtime';
