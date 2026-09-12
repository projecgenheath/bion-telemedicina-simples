# Supabase — BION Telemedicina

Status atual: **✅ ATIVADO em 11/09/2026** — o app roda no Postgres do Supabase
(projeto `tnygegihboiyptrnmaqt`, região `sa-east-1`, conexão via Session pooler).

> A senha do banco vive apenas no `.env` do servidor — nunca no Git.
> Resetável em *Project Settings → Database → Reset database password* (se trocar,
> atualize a `DATABASE_URL` no `.env` e reinicie com `bash scripts/dev.sh`).

## O que já está pronto

| Item | Arquivo |
|------|---------|
| DDL completo das 13 tabelas (referência/rota manual) | `supabase/migrations/0001_init.sql` |
| Schema Prisma já convertido para PostgreSQL | `prisma/schema.postgres.prisma` |
| Script de ativação automática | `scripts/supabase_ativar.sh` |
| Verificação pós-seed | `scripts/verificar_banco.ts` |
| Config do CLI (equivalente a `supabase init`) | `supabase/config.toml` |

## Por que a conexão precisa ser do POOLER

O host direto (`db.tnygegihboiyptrnmaqt.supabase.co:5432`) resolve **apenas IPv6**.
Ambientes sem rota IPv6 (como este sandbox e muitas redes residenciais) falham com
"No address associated with hostname". O **Supavisor pooler** (`aws-0-<região>.pooler.supabase.com`)
resolve em IPv4 e funciona em qualquer lugar:

- **Session pooler (recomendado)**: porta `5432`, usuário `postgres.<project-ref>`
- Transaction pooler: porta `6543` — o script detecta e adiciona `?pgbouncer=true&connection_limit=1` sozinho

## Rotas para ativar (escolha UMA)

### Rota 1 — Reset da senha pela interface (GARANTIDA — a via SQL foi bloqueada)
> ⚠️ `ALTER USER postgres PASSWORD` no SQL Editor retorna `42501: permission denied
> to alter role` (endurecimento do Supabase: postgres não é mais superuser e papéis
> privilegiados só mudam pela plataforma). Use a própria interface:
1. Dashboard → ⚙️ **Project Settings** → **Database**
2. Seção **Database password** → **Reset database password**
3. Copie a senha gerada e envie aqui (a região é descoberta automaticamente pela sondagem)

### Rota 2 — SQL alternativo: criar um papel exclusivo para o app
Se preferir não mexer na senha do postgres, cole no SQL Editor (cria o papel `bion_app`,
dono das tabelas que o Prisma criar depois):
```sql
CREATE ROLE bion_app LOGIN PASSWORD 'SUA_SENHA_FORTE_AQUI';
GRANT USAGE, CREATE ON SCHEMA public TO bion_app;
```
Conexão passa a usar usuário `bion_app` (formato pooler: `bion_app.<project-ref>`).
Se também retornar erro de permissão, use a Rota 1.

### Rota 3 — Enviar a connection string com a senha que você conhece
1. Dashboard → **Connect** → copie a string do **Session pooler** (porta 5432)
2. Substitua `[YOUR-PASSWORD]` pela senha definida na criação do projeto e envie aqui

### Rota 4 — Enviar um SUPABASE_ACCESS_TOKEN
1. https://supabase.com/dashboard/account/tokens → *Generate new token*
2. Envie o token → aplico tudo via Management API

### Rota 5 — Manual completa pelo SQL Editor (sem conectar o app)
1. SQL Editor → cole `supabase/migrations/0001_init.sql` → **Run**
2. Cria as tabelas, mas o app continua no SQLite até uma das rotas 1–4 conectar o Prisma

## O que o script de ativação faz

1. Testa a conexão
2. Backup de `schema.prisma` e `.env` (SQLite)
3. Troca o datasource para PostgreSQL
4. `prisma generate` + `prisma db push` (cria as 13 tabelas)
5. `bun prisma/seed.ts` — popula com os dados demo (datas relativas frescas: "hoje", "amanhã")
6. Verifica as contagens (`scripts/verificar_banco.ts`)

Contas demo após o seed (senha `bion123`):
- Paciente: `marina.silva@email.com`
- Médico: `ana.ribeiro@med.bion.app`
- Admin: `admin@bion.app`

## Chaves do projeto (referência)

- URL: `https://tnygegihboiyptrnmaqt.supabase.co`
- Publishable key: já configurada no `.env` como `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (chave pública por design — pode aparecer no frontend sem risco)
- ⚠️ As chaves *secret/service_role* e a senha do banco **nunca** devem ser expostas
  no frontend nem commitadas

## Comandos CLI (quando houver token)

```bash
supabase login --token $SUPABASE_ACCESS_TOKEN
supabase link --project-ref tnygegihboiyptrnmaqt
supabase db push   # aplica supabase/migrations/
```