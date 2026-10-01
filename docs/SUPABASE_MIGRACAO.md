# Migração BION → Supabase

## Status: código concluído

O app usa Supabase para:

| Serviço | Implementação |
|---------|----------------|
| **Postgres** | Prisma + `DATABASE_URL` |
| **Auth** | `signUp` / `signIn` / troca de senha; `User.supabaseId` |
| **Storage** | buckets `documentos` / `avatares`; upload/download |
| **Realtime** | mensagens, sala de teleconsulta, notificações |
| **Edge Functions** | `supabase/functions/pagamento-webhook` (opcional) |
| **RLS** | SQL em `supabase/migrations/` (aplicar no SQL Editor) |

## Checklist final (Dashboard / Vercel)

1. [x] `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. [ ] **`SUPABASE_SERVICE_ROLE_KEY`** na Vercel (Project Settings → API → service_role)
3. [ ] `npx prisma db push` (colunas `supabaseId`, `storagePath`, índices)
4. [ ] Auth → Email ativo; em dev desligar Confirm email se quiser
5. [ ] (Só em projeto descartável) `npm run seed:auth` — exige `BION_PERMITIR_SYNC_DEMO=1`, `SEED_ADMIN_PASSWORD` e `SEED_DEMO_PASSWORD`; **redefine senhas de todos os usuários** e é bloqueado em produção
6. [ ] (Opcional) SQL `20260928_rls_completo.sql`
7. [ ] (Opcional) Deploy Edge Function do webhook

```bash
npm run verificar:supabase   # checa envs
npm run seed:auth            # com SERVICE_ROLE
```

## Contas demo

Senhas: definidas por `SEED_DEMO_PASSWORD` (admin: `SEED_ADMIN_PASSWORD`) — nunca no repositório.  
Paciente: `marina.silva@email.com` · Médico: `ana.ribeiro@med.bion.app` · Admin: `admin@bion.app`


---

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


## Storage (uploads)

- UI **Arquivos** envia `multipart/form-data` para `POST /api/arquivos`
- Com `SUPABASE_SERVICE_ROLE_KEY`, o blob vai ao bucket `documentos`
- Download: `GET /api/arquivos?id=` → URL assinada (10 min)

## Realtime (mensagens)

- `POST /api/mensagens` faz broadcast no canal `mensagens:user:{id}`
- O store assina o canal quando autenticado (polling permanece como backup)


## Realtime na teleconsulta

- Canal `sala:consulta:{consultaId}` — eventos `sinal` e `presenca`
- `use-teleconsulta` assina o canal; polling continua como heartbeat (mais lento com Realtime OK)
- Sinais deduplicados entre polling e Realtime

## RLS

Arquivo: `supabase/migrations/20260928_rls_basico.sql`  
Rodar no SQL Editor se quiser proteção no acesso direto com anon key.  
A API Next (Prisma + DATABASE_URL) **não** é bloqueada pelo RLS.


## Notificações Realtime

- `aplicarSideEffects` faz broadcast em `notificacoes:user:{id}`
- Store assina e mostra toast + lista

## RLS completo

`supabase/migrations/20260928_rls_completo.sql` — SELECT/INSERT/UPDATE por participante/dono.


## Troca de senha

`POST /api/auth/senha` valida a senha atual (bcrypt ou Auth), atualiza no
**Supabase Auth** (`updateUser` / admin) e espelha o hash no Prisma.


## Seed e Auth

```bash
# Seed completo (Prisma + Auth se SERVICE_ROLE existir)
npm run seed

# Só vincular usuários existentes ao Auth (sem apagar dados)
npm run seed:auth
```

Na Vercel, além de URL e anon key, é **obrigatório** para Auth admin / Storage / seed:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Project Settings → API → service_role
```

Sem essa chave: login legado bcrypt ainda funciona; cadastros novos exigem anon key
funcionando no `signUp` do browser/servidor.
