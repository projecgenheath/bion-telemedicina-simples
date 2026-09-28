# Migração BION → Supabase

## Status

| Peça | Status |
|------|--------|
| Postgres | Prisma + DATABASE_URL |
| Auth | signUp/signIn nas rotas /api/auth; usuários em Authentication → Users + User.supabaseId |
| Storage | src/lib/supabase/storage.ts (buckets documentos, avatares) |
| Realtime | canais em src/lib/supabase/realtime.ts |
| Edge Functions | supabase/functions/pagamento-webhook |

## Env

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

## Dashboard

1. Auth → Email provider on
2. Dev: desligar Confirm email se quiser sessão imediata no cadastro
3. npx prisma db push (coluna supabaseId)
4. Storage: buckets ou garantirBuckets()
5. Contas legadas: no 1º login com service role, migram para Auth
