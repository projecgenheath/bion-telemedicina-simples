# SQL legado (não é migration do CLI/GitHub)

Estes arquivos **não** entram em `supabase/migrations/` de propósito.

O histórico remoto de produção (`tnygegihboiyptrnmaqt`) começa em
`20261001122909`. O schema base foi criado via `prisma db push` / SQL Editor,
não via versões rastreadas pelo Supabase Branching.

Se esses arquivos ficarem em `migrations/`, o deploy da main tenta aplicá-los
como migrações novas e falha com `relation "User" already exists (42P07)`.

| Arquivo | Uso |
|---------|-----|
| `0001_init.sql` | DDL das tabelas iniciais (referência / banco local vazio) |
| `20260928_rls_basico.sql` | RLS básico (SQL Editor, opcional) |
| `20260928_rls_completo.sql` | RLS completo (SQL Editor, opcional) |
| `20260928_supabase_auth_storage.sql` | Notas Auth/Storage (sem DDL) |

Para um Postgres local do zero: aplique `0001_init.sql` e depois, em ordem,
os arquivos de `supabase/migrations/`.
