-- =====================================================================
-- BION — Canal Realtime PRIVADO da sala de teleconsulta
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique no SQL Editor do Supabase (ou via
-- MCP apply_migration) ANTES do merge do PR "chamada estável e segura".
-- Idempotente: pode rodar de novo sem erro.
--
-- Contexto
--   A sinalização da chamada (oferta/resposta SDP, candidatos ICE, chat e
--   controle) é repassada pelo Realtime Broadcast no tópico
--   `sala:consulta:<consultaId>:<hmac>`. Até aqui o canal era PÚBLICO:
--   qualquer pessoa com a anon key que soubesse o tópico lia o chat.
--   Agora o navegador assina com `config: { private: true }` e o Realtime
--   só deixa entrar quem passa na policy abaixo.
--
-- Quem envia
--   SÓ o servidor (service role, que ignora RLS), pelo endpoint REST de
--   broadcast. Não existe policy de INSERT: o navegador NÃO consegue
--   publicar no canal da sala (nem forjar sinal para o outro lado).
--
-- Quem recebe (policy de SELECT)
--   Usuário logado no Supabase Auth (role authenticated) cujo
--   User.supabaseId = auth.uid() é o médico OU o paciente da consulta cujo
--   id está no 3º pedaço do tópico, com a conta ativa. Só extension
--   'broadcast' (presence não é usada na sala).
--
-- Por que uma função SECURITY DEFINER
--   20260930_rls_deny_by_default.sql tirou de anon/authenticated qualquer
--   acesso às tabelas de public, então a policy não consegue ler "Consulta"
--   e "User" diretamente. A função roda como o dono (postgres), com
--   search_path vazio, devolve só um booleano sobre o PRÓPRIO usuário e fica
--   num schema fora da API REST (bion_privado não está em "Exposed schemas").
--
-- Não afeta
--   Os canais de mensagens e notificações (continuam públicos) nem as
--   tabelas de public. Nenhum dado é alterado.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS bion_privado;
REVOKE ALL ON SCHEMA bion_privado FROM PUBLIC;
GRANT USAGE ON SCHEMA bion_privado TO authenticated;

CREATE OR REPLACE FUNCTION bion_privado.pode_acessar_sala(p_topico text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_topico LIKE 'sala:consulta:%'
    AND EXISTS (
      SELECT 1
      FROM public."Consulta" c
      JOIN public."User" u
        ON u.id IN (c."pacienteId", c."medicoId")
      WHERE c.id = split_part(p_topico, ':', 3)
        AND u."supabaseId" = (SELECT auth.uid())::text
        AND u.status = 'ativo'
    );
$$;

REVOKE ALL ON FUNCTION bion_privado.pode_acessar_sala(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bion_privado.pode_acessar_sala(text) FROM anon;
GRANT EXECUTE ON FUNCTION bion_privado.pode_acessar_sala(text) TO authenticated;

-- RLS de realtime.messages já vem ligado no Supabase (não use ALTER TABLE
-- aqui: falha com "must be owner of table messages").
DROP POLICY IF EXISTS bion_sala_recebe ON realtime.messages;
CREATE POLICY bion_sala_recebe
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND bion_privado.pode_acessar_sala((SELECT realtime.topic()))
  );

COMMIT;

-- Conferência (opcional):
--   SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'realtime';
--   SELECT bion_privado.pode_acessar_sala('sala:consulta:<id>:x');  -- como postgres: false (auth.uid() nulo)
