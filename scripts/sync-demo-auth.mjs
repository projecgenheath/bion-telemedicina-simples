/**
 * Vincula usuários Prisma existentes ao Supabase Auth (sem apagar dados).
 *
 * ⚠️ REDEFINE a senha no Supabase Auth de TODOS os usuários do banco alvo —
 * só use em banco local/descartável. Nunca em produção.
 *
 * Uso:
 *   BION_PERMITIR_SYNC_DEMO=1 SEED_ADMIN_PASSWORD=... SEED_DEMO_PASSWORD=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... DATABASE_URL=... \
 *     node scripts/sync-demo-auth.mjs
 *
 * Senhas aplicadas no Auth: SEED_ADMIN_PASSWORD (role ADMIN) e
 * SEED_DEMO_PASSWORD (demais). Ambas obrigatórias — nenhuma senha no código.
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

/** Refs/hosts do projeto de PRODUÇÃO (extensível via BION_PRODUCAO_REFS="a,b"). */
const REFS_PRODUCAO = [
  "tnygegihboiyptrnmaqt",
  ...(process.env.BION_PRODUCAO_REFS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

function abortar(msg) {
  console.error(`\n⛔ sync-demo-auth abortado: ${msg}\n`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  abortar("NODE_ENV/VERCEL_ENV = production. Este script redefine senhas e nunca roda em produção.");
}
{
  const alvos = [process.env.DATABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""];
  const ref = REFS_PRODUCAO.find((r) => alvos.some((a) => a.includes(r)));
  if (ref) abortar(`DATABASE_URL/NEXT_PUBLIC_SUPABASE_URL aponta para o projeto de produção (${ref}).`);
}
if (process.env.BION_PERMITIR_SYNC_DEMO !== "1") {
  abortar("defina BION_PERMITIR_SYNC_DEMO=1 para confirmar que o projeto alvo é descartável.");
}

function senhaDeEnv(nome) {
  const v = process.env[nome]?.trim() ?? "";
  if (!v) abortar(`variável ${nome} não definida (senhas não ficam mais no código).`);
  if (v.length < 10 || v.length > 64 || !/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) {
    abortar(`${nome} deve ter 10–64 caracteres, com letras e números.`);
  }
  if (v === "bion123456") abortar(`${nome} não pode ser a antiga senha demo pública.`);
  return v;
}

const SENHA_ADMIN = senhaDeEnv("SEED_ADMIN_PASSWORD");
const SENHA_DEMO = senhaDeEnv("SEED_DEMO_PASSWORD");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = new PrismaClient();
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const users = await db.user.findMany({
    select: { id: true, email: true, nome: true, supabaseId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Usuários Prisma: ${users.length}`);

  for (const u of users) {
    const SENHA = u.role === "ADMIN" ? SENHA_ADMIN : SENHA_DEMO;
    try {
      let authId = u.supabaseId;
      if (!authId) {
        const created = await admin.auth.admin.createUser({
          email: u.email,
          password: SENHA,
          email_confirm: true,
          user_metadata: { nome: u.nome },
        });
        if (created.data.user) {
          authId = created.data.user.id;
        } else {
          const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const found = list.data.users?.find(
            (x) => x.email?.toLowerCase() === u.email.toLowerCase(),
          );
          if (found) {
            authId = found.id;
            await admin.auth.admin.updateUserById(found.id, {
              password: SENHA,
              email_confirm: true,
            });
          } else {
            console.warn(`✗ ${u.email}: ${created.error?.message || "falha"}`);
            continue;
          }
        }
        await db.user.update({ where: { id: u.id }, data: { supabaseId: authId } });
      } else {
        await admin.auth.admin.updateUserById(authId, {
          password: SENHA,
          email_confirm: true,
        });
      }
      console.log(`✓ ${u.email} → ${authId.slice(0, 8)}…`);
    } catch (e) {
      console.warn(`✗ ${u.email}:`, e.message || e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
