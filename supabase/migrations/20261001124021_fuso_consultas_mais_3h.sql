-- =====================================================================
-- BION — Fuso (2026-09): corrige Consulta."dataInicio" gravado 3 h adiantado
-- =====================================================================
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revise antes de rodar no SQL Editor.
-- ⚠️ Aplicar JUNTO com o deploy da branch fix/fuso-horario-consultas, logo
--    depois que a versão nova estiver no ar. Não aplicar dias antes nem
--    depois. Rodar UMA vez: a segunda execução é barrada pelo marcador.
--
-- O BUG
--   O servidor (Vercel) roda em UTC. O parseDataHora antigo montava a data com
--   setHours() no fuso do PROCESSO, então "14:00" digitado em Brasília virava
--   14:00 UTC, ou seja, 11:00 em Brasília. O navegador mostrava 3 h a menos.
--   "Hoje"/"Amanhã" também usavam o dia em UTC, que entre 21:00 e 23:59 de
--   Brasília já é o dia seguinte.
--
-- O QUE É CORRIGIDO: SÓ "Consulta"."dataInicio"
--   É a ÚNICA coluna gravada a partir de data e hora digitadas
--   (parseDataHora), em POST /api/consultas, remarcar e atualizar (admin).
--
-- O QUE NÃO É TOCADO (gravado com o instante real, now() / new Date()):
--   createdAt/updatedAt de todas as tabelas, Pagamento.criadoEm/confirmadoEm,
--   Anamnese.*, AuditLog.createdAt, Notificacao.*, Medicao.criadoEm,
--   PresencaSala.ultimoPing, Sessao.expiresAt, Ticket.dataResposta,
--   NotificacaoLeitura.lidaEm.
--   ExameLaboratorial.dataColeta também fica como está: são datas sem hora
--   (meio-dia), e o dia já está certo.
--   Os TEXTOS já gravados (notificações, auditoria) com "às HH:MM" também
--   ficam: foram escritos com o horário que o usuário digitou.
--
-- COMO AS LINHAS AFETADAS SÃO IDENTIFICADAS (por evidência, não às cegas)
--   Para cada consulta, pega o ÚLTIMO evento de auditoria que definiu o
--   horário:
--     CONSULTA_AGENDADA / CONSULTA_AGENDADA_PAGA
--       detalhes "... em <rótulo> às <H:MM> (...)": a hora digitada.
--     CONSULTA_REMARCADA
--       detalhes "... remarcada para DD/MM/AAAA às HH:MM (...)".
--     CONSULTA_ATUALIZADA (admin) com "data"/"hora" nos campos
--       NÃO registra a hora, então a linha vai para "revisar".
--   Depois compara HH:MM de "dataInicio" lido em UTC com a hora do evento:
--     igual                → gravado errado (horário de parede como UTC) → +3 h
--     igual + 3 h          → já correto (ex.: servidor local em Brasília) → mantém
--     outro / sem evento   → NÃO mexe; fica listado para revisão manual
--   Por isso a migração não depende da ordem: linhas gravadas pela versão
--   nova são reconhecidas como corretas e puladas.
--
--   Caso "Hoje"/"Amanhã" agendado entre 21:00 e 23:59 de Brasília (o evento
--   foi gravado entre 00:00 e 02:59 UTC): o dia também foi calculado errado
--   (+1). A correção é +3 h − 1 dia (classe mais3h_menos1dia).
--   Remarcação nessa mesma janela: não dá para saber se o rótulo era
--   relativo. Recebe +3 h e fica marcada como mais3h_conferir_data.
--   Seed, scripts e dados sem auditoria: "sem_evidencia", não são tocados.
--
-- SEGURANÇA / REVERSÃO
--   * Tudo numa transação, com advisory lock e marcador
--     bion_manutencao.migracao_dados (fora do schema public: o Prisma não
--     mexe e a API REST do Supabase não expõe).
--   * Backup linha a linha em bion_manutencao.fuso_consulta_backup
--     (antes/depois/classe). A reversão está comentada no fim.
--   * Só altera a linha se "dataInicio" ainda for o valor lido (guarda de
--     concorrência). "updatedAt" não muda.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS bion_manutencao;
REVOKE ALL ON SCHEMA bion_manutencao FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA bion_manutencao FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA bion_manutencao FROM authenticated';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bion_manutencao.migracao_dados (
  nome        TEXT PRIMARY KEY,
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  detalhes    TEXT
);

CREATE TABLE IF NOT EXISTS bion_manutencao.fuso_consulta_backup (
  consulta_id         TEXT PRIMARY KEY,
  data_inicio_antes   TIMESTAMP(3) NOT NULL,
  data_inicio_depois  TIMESTAMP(3) NOT NULL,
  classe              TEXT NOT NULL,
  evento              TEXT,
  evento_em           TIMESTAMP(3)
);

DO $$
DECLARE
  v_nome CONSTANT TEXT := '20260930_fuso_consultas_mais_3h';
  v_resumo TEXT;
  v_alteradas INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(v_nome));

  IF EXISTS (SELECT 1 FROM bion_manutencao.migracao_dados WHERE nome = v_nome) THEN
    RAISE NOTICE '% já foi aplicada — nada feito.', v_nome;
    RETURN;
  END IF;

  CREATE TEMP TABLE _fuso_classe ON COMMIT DROP AS
  WITH ev AS (
    -- último evento que DEFINIU o horário de cada consulta
    SELECT DISTINCT ON (a."entidadeId")
      a."entidadeId" AS cid, a.acao, a.detalhes, a."createdAt" AS em
    FROM "AuditLog" a
    WHERE a.entidade = 'consulta'
      AND a."entidadeId" IS NOT NULL
      AND (
        a.acao IN ('CONSULTA_AGENDADA', 'CONSULTA_AGENDADA_PAGA', 'CONSULTA_REMARCADA')
        OR (a.acao = 'CONSULTA_ATUALIZADA' AND a.detalhes ~ '\(campos: [^)]*\m(data|hora)\M')
      )
    ORDER BY a."entidadeId", a."createdAt" DESC, a.id DESC
  ),
  hm AS (
    SELECT ev.*,
      CASE
        WHEN ev.acao IN ('CONSULTA_AGENDADA', 'CONSULTA_AGENDADA_PAGA')
          THEN regexp_match(ev.detalhes, ' às ([0-9]{1,2}):([0-9]{2}) \((em_espera|pago)')
        WHEN ev.acao = 'CONSULTA_REMARCADA'
          THEN regexp_match(ev.detalhes, 'remarcada para [0-9]{2}/[0-9]{2}/[0-9]{4} às ([0-9]{2}):([0-9]{2}) \(status')
      END AS m,
      (ev.acao IN ('CONSULTA_AGENDADA', 'CONSULTA_AGENDADA_PAGA')
        AND ev.detalhes ~* ' em (hoje|amanh[aã]) às [0-9]{1,2}:[0-9]{2} \((em_espera|pago)') AS relativo,
      (ev.em::time < TIME '03:00') AS janela_noite  -- 21:00–23:59 em Brasília
    FROM ev
  )
  SELECT
    c.id,
    c."dataInicio" AS antes,
    hm.acao,
    hm.em,
    CASE
      WHEN hm.cid IS NULL THEN 'sem_evidencia'
      WHEN hm.acao = 'CONSULTA_ATUALIZADA' OR hm.m IS NULL THEN 'revisar'
      WHEN to_char(c."dataInicio", 'HH24:MI') = lpad(hm.m[1], 2, '0') || ':' || hm.m[2] THEN
        CASE
          WHEN hm.relativo AND hm.janela_noite THEN 'mais3h_menos1dia'
          WHEN hm.acao = 'CONSULTA_REMARCADA' AND hm.janela_noite THEN 'mais3h_conferir_data'
          ELSE 'mais3h'
        END
      WHEN to_char(c."dataInicio" - INTERVAL '3 hours', 'HH24:MI') = lpad(hm.m[1], 2, '0') || ':' || hm.m[2]
        THEN 'ja_correto'
      ELSE 'revisar'
    END AS classe
  FROM "Consulta" c
  LEFT JOIN hm ON hm.cid = c.id;

  INSERT INTO bion_manutencao.fuso_consulta_backup
    (consulta_id, data_inicio_antes, data_inicio_depois, classe, evento, evento_em)
  SELECT id, antes,
         antes + INTERVAL '3 hours'
           - CASE WHEN classe = 'mais3h_menos1dia' THEN INTERVAL '1 day' ELSE INTERVAL '0' END,
         classe, acao, em
  FROM _fuso_classe
  WHERE classe LIKE 'mais3h%'
  ON CONFLICT (consulta_id) DO NOTHING;

  UPDATE "Consulta" c
     SET "dataInicio" = b.data_inicio_depois
    FROM bion_manutencao.fuso_consulta_backup b
   WHERE b.consulta_id = c.id
     AND c."dataInicio" = b.data_inicio_antes;
  GET DIAGNOSTICS v_alteradas = ROW_COUNT;

  SELECT string_agg(classe || '=' || n, ', ' ORDER BY classe)
    INTO v_resumo
    FROM (SELECT classe, count(*) AS n FROM _fuso_classe GROUP BY classe) t;

  INSERT INTO bion_manutencao.migracao_dados (nome, detalhes)
  VALUES (v_nome, 'alteradas=' || v_alteradas || '; ' || coalesce(v_resumo, 'sem consultas'));

  RAISE NOTICE '%: % consulta(s) alterada(s). Classes: %', v_nome, v_alteradas, coalesce(v_resumo, '—');
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- PRÉ-VISUALIZAÇÃO (somente leitura; rode ANTES, para ver o que mudaria):
--   copie o SELECT do CREATE TEMP TABLE _fuso_classe acima (o WITH ev ... FROM
--   "Consulta" c LEFT JOIN hm ...) e rode sozinho, com GROUP BY classe.
--
-- CONFERÊNCIA (depois):
--   SELECT * FROM bion_manutencao.migracao_dados;
--   SELECT classe, count(*) FROM bion_manutencao.fuso_consulta_backup GROUP BY classe;
--   -- linhas para revisão manual (não alteradas):
--   --   consultas sem backup cuja hora não bate com a auditoria; veja a pré-visualização.
--   -- remarcações na janela 21–24 h, conferir o DIA:
--   SELECT * FROM bion_manutencao.fuso_consulta_backup WHERE classe = 'mais3h_conferir_data';
--
-- REVERSÃO (só se necessário; desfaz exatamente o que foi alterado):
--   BEGIN;
--   UPDATE "Consulta" c SET "dataInicio" = b.data_inicio_antes
--     FROM bion_manutencao.fuso_consulta_backup b
--    WHERE b.consulta_id = c.id AND c."dataInicio" = b.data_inicio_depois;
--   DELETE FROM bion_manutencao.fuso_consulta_backup;
--   DELETE FROM bion_manutencao.migracao_dados WHERE nome = '20260930_fuso_consultas_mais_3h';
--   COMMIT;
-- ---------------------------------------------------------------------
