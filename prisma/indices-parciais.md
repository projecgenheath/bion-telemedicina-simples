# Índices parciais (fora do schema.prisma)

O Prisma não descreve índice parcial no `schema.prisma`. Por isso estes índices
existem **só no SQL** das migrações em `supabase/migrations/` e não levam
`@unique` / `@@unique` / `@@index` correspondente no schema (isso criaria um
índice **não** parcial).

## PerfilMedico.stripeAccountId — 20261103f

Migração: `supabase/migrations/20261103210000_20261103f_status_conta_stripe_medico.sql` (já aplicada em 03/11; o arquivo SQL não é alterado neste PR, para não mudar o checksum).

Índice único parcial:

```sql
CREATE UNIQUE INDEX ... ON "PerfilMedico"("stripeAccountId")
  WHERE "stripeAccountId" IS NOT NULL AND "stripeAccountId" <> '';
```

Antes de criar o índice, a migração para com erro se já houver contas repetidas
(precisa do ok do Alisson para conferir em produção).

Não rode `prisma migrate dev` / `db push` esperando que este índice apareça a
partir do schema. A fonte da verdade é o SQL.

`prisma migrate diff` (from-migrations vs schema) **não foi executado neste
PR**: o projeto usa arquivos SQL soltos no Supabase, não o diretório de
migrações do Prisma (`prisma/migrations` + `migration_lock.toml`), e não há
banco shadow disponível aqui. Esse diff, se for feito, precisa de ambiente
com shadow e também do ok do Alisson antes de apontar para produção.
