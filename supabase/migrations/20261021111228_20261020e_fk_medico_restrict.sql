-- 20261020e — LGPD/CFM: apagar um médico NÃO pode apagar o prontuário.
-- Dono: Médicos. Troca ON DELETE CASCADE por ON DELETE RESTRICT nas FKs
-- "medicoId" → "User"(id) das tabelas clínicas. Sem mudança de dados.
-- Idempotente, sem BEGIN/COMMIT (o runner já envolve em transação).
-- Aplicar ANTES do merge, com backup do banco antes.
--
-- Reversão: repetir os blocos trocando RESTRICT por CASCADE.

ALTER TABLE public."Consulta" DROP CONSTRAINT IF EXISTS "Consulta_medicoId_fkey";
ALTER TABLE public."Consulta" ADD CONSTRAINT "Consulta_medicoId_fkey"
  FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."Documento" DROP CONSTRAINT IF EXISTS "Documento_medicoId_fkey";
ALTER TABLE public."Documento" ADD CONSTRAINT "Documento_medicoId_fkey"
  FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."Evolucao" DROP CONSTRAINT IF EXISTS "Evolucao_medicoId_fkey";
ALTER TABLE public."Evolucao" ADD CONSTRAINT "Evolucao_medicoId_fkey"
  FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_medicoId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_medicoId_fkey"
  FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
