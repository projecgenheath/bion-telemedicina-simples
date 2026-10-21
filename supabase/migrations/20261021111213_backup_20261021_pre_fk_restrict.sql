-- Registro da migração aplicada direto em produção (versão 20261021111213).
-- Backup das tabelas antes da troca Cascade -> Restrict (#96). Idempotente.
CREATE SCHEMA IF NOT EXISTS backup_20261021;
REVOKE ALL ON SCHEMA backup_20261021 FROM anon, authenticated, public;
CREATE TABLE IF NOT EXISTS backup_20261021."Consulta" AS SELECT * FROM public."Consulta";
CREATE TABLE IF NOT EXISTS backup_20261021."Documento" AS SELECT * FROM public."Documento";
CREATE TABLE IF NOT EXISTS backup_20261021."Evolucao" AS SELECT * FROM public."Evolucao";
CREATE TABLE IF NOT EXISTS backup_20261021."PedidoRenovacao" AS SELECT * FROM public."PedidoRenovacao";
CREATE TABLE IF NOT EXISTS backup_20261021."User" AS SELECT * FROM public."User";
REVOKE ALL ON ALL TABLES IN SCHEMA backup_20261021 FROM anon, authenticated, public;
