-- BION — PRÉVIA (somente leitura) da migração 20260930_fuso_consultas_mais_3h.
-- Não altera nada. Mostra como cada consulta seria classificada, usando a MESMA
-- consulta da migração (copiada dela; se mudar uma, mude a outra).
-- Uso: rodar no SQL Editor ANTES da migração para conferir os números e as
-- linhas "revisar" / "sem_evidencia" / "mais3h_conferir_data".

WITH classe AS (
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
  LEFT JOIN hm ON hm.cid = c.id
)
SELECT classe, count(*) AS consultas,
       min(antes) AS menor_data_inicio, max(antes) AS maior_data_inicio
  FROM classe
 GROUP BY classe
 ORDER BY classe;

-- Detalhe das linhas que pedem atenção humana:
-- WITH classe AS ( ...mesmo bloco acima... )
-- SELECT id, antes, acao, em, classe FROM classe
--  WHERE classe IN ('revisar', 'sem_evidencia', 'mais3h_conferir_data')
--  ORDER BY classe, antes;
