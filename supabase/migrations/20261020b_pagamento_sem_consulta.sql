-- 20261020b — Pagamento e RepasseItem sem consulta (renovação de receita só por mensagem).
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

-- ---------------------------------------------------------------------
-- RepasseItem da renovação de receita (item tipo 'renovacao').
-- O item aponta para a consulta OU para o pedido de renovação, nunca os dois.
-- A FK composta ("consultaId","medicoId") é MATCH SIMPLE: com consultaId nulo
-- ela não se aplica, e com consultaId preenchido continua garantindo que a
-- consulta é do mesmo médico do repasse. Para o pedido, o mesmo médico é
-- garantido no código (carregarCandidatos filtra por medicoId).
--
-- Reversão (só sem itens de renovação):
--   DROP CONSTRAINT "RepasseItem_alvo_check", "RepasseItem_pedidoRenovacaoId_fkey";
--   DROP INDEX "RepasseItem_pedidoRenovacaoId_key"; DROP COLUMN "pedidoRenovacaoId";
--   ALTER COLUMN "consultaId" SET NOT NULL; recriar "RepasseItem_tipo_check" da 20261003.
-- ---------------------------------------------------------------------
ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "pedidoRenovacaoId" TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseItem_pedidoRenovacaoId_key" ON public."RepasseItem"("pedidoRenovacaoId");
ALTER TABLE public."RepasseItem" DROP CONSTRAINT IF EXISTS "RepasseItem_pedidoRenovacaoId_fkey";
ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_pedidoRenovacaoId_fkey"
  FOREIGN KEY ("pedidoRenovacaoId") REFERENCES public."PedidoRenovacao"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."RepasseItem" ALTER COLUMN "consultaId" DROP NOT NULL;

ALTER TABLE public."RepasseItem" DROP CONSTRAINT IF EXISTS "RepasseItem_alvo_check";
ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_alvo_check"
  CHECK (num_nonnulls("consultaId", "pedidoRenovacaoId") = 1);

ALTER TABLE public."RepasseItem" DROP CONSTRAINT IF EXISTS "RepasseItem_tipo_check";
ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_tipo_check" CHECK (
  ("tipo" = 'consulta' AND "remarcacaoId" IS NULL AND "pedidoRenovacaoId" IS NULL
     AND "chave" = 'consulta:' || "consultaId") OR
  ("tipo" = 'multa_cancelamento' AND "remarcacaoId" IS NULL AND "pedidoRenovacaoId" IS NULL
     AND "brutoCentavos" = 0 AND "comissaoCentavos" = 0
     AND "chave" = 'multa_cancelamento:' || "consultaId") OR
  ("tipo" = 'multa_remarcacao' AND "remarcacaoId" IS NOT NULL AND "pedidoRenovacaoId" IS NULL
     AND "brutoCentavos" = 0 AND "comissaoCentavos" = 0
     AND "chave" = 'multa_remarcacao:' || "remarcacaoId") OR
  ("tipo" = 'renovacao' AND "remarcacaoId" IS NULL AND "consultaId" IS NULL
     AND "pedidoRenovacaoId" IS NOT NULL
     AND "chave" = 'renovacao:' || "pedidoRenovacaoId"));
