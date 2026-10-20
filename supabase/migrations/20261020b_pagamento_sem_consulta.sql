-- 20261020b — Pagamento sem consulta (renovação de receita só por mensagem).
-- Dono: Admin. Empilhada sobre a 20261020a_renovacao_pagamento (#66).
-- Idempotente, sem BEGIN/COMMIT (o runner já envolve em transação).
--
-- "Pagamento"."consultaId" passa a aceitar NULL. O UNIQUE continua (no
-- Postgres vários NULLs não colidem). A regra "consultaId não nulo OU existe
-- PedidoRenovacao com esse pagamentoId" é validada no código
-- (src/lib/server/pagamentos.ts, vinculoDoPagamento), porque o vínculo fica
-- do lado do PedidoRenovacao e é gravado depois do Pagamento.
--
-- Reversão: só se não houver linhas com consultaId nulo:
--   ALTER TABLE public."Pagamento" ALTER COLUMN "consultaId" SET NOT NULL;

ALTER TABLE public."Pagamento" ALTER COLUMN "consultaId" DROP NOT NULL;
