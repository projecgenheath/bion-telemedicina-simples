-- 20261103c: marca, por registro, a cobrança feita DIRETO na conta Stripe
-- conectada do médico (STRIPE_MODO_COBRANCA=direta ou destino). O repasse diário por
-- PIX ignora esses registros (o médico já recebeu no Stripe).
-- Só adiciona colunas anuláveis; não muda nenhum dado existente.
ALTER TABLE "Pagamento" ADD COLUMN IF NOT EXISTS "stripeContaMedico" TEXT;
ALTER TABLE "RemarcacaoPendente" ADD COLUMN IF NOT EXISTS "stripeContaMedico" TEXT;
