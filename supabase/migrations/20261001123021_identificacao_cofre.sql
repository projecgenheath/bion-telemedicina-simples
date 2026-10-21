-- =====================================================================
-- BION — Cofre de identificação (LGPD art. 16, I + Lei 13.787/2018)
-- =====================================================================
-- NÃO aplicada automaticamente. Revise e aplique MANUALMENTE (após backup),
-- ou use `prisma db push` (o model está em prisma/schema.prisma) e rode só a
-- parte de RLS/REVOKE abaixo.
--
-- Guarda, CIFRADA (AES-256-GCM, chave BION_COFRE_CHAVE só no servidor), a
-- identificação mínima do paciente anonimizado. Acesso apenas pelo servidor
-- (Prisma, role owner) na rota ADMIN /api/admin/lgpd/cofre/busca.
-- Consistente com 20260930_rls_deny_by_default.sql (PR #1): RLS ligado, sem
-- policies e sem grants para anon/authenticated.
-- `userId` não tem FK de propósito (o model User não é alterado).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public."IdentificacaoCofre" (
  "id"            TEXT         NOT NULL,
  "userId"        TEXT         NOT NULL,
  "dadosCifrados" TEXT         NOT NULL,
  "cpfHash"       TEXT,
  "nomeHash"      TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentificacaoCofre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdentificacaoCofre_userId_key"   ON public."IdentificacaoCofre" ("userId");
CREATE INDEX        IF NOT EXISTS "IdentificacaoCofre_cpfHash_idx"  ON public."IdentificacaoCofre" ("cpfHash");
CREATE INDEX        IF NOT EXISTS "IdentificacaoCofre_nomeHash_idx" ON public."IdentificacaoCofre" ("nomeHash");

-- Deny-by-default: RLS sem policies + nenhum privilégio para os papéis da API.
ALTER TABLE public."IdentificacaoCofre" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."IdentificacaoCofre" FROM anon, authenticated;

COMMIT;

-- Verificação:
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public."IdentificacaoCofre"'::regclass;  -- true
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'IdentificacaoCofre' AND grantee IN ('anon','authenticated');         -- vazio
