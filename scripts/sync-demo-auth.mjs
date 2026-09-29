/**
 * Vincula usuários Prisma existentes ao Supabase Auth (sem apagar dados).
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... DATABASE_URL=... \
 *     node scripts/sync-demo-auth.mjs
 *
 * Senha aplicada no Auth: bion123456 (contas demo) ou SENHA_DEMO env.
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const SENHA = process.env.SENHA_DEMO || "bion123456";
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
    select: { id: true, email: true, nome: true, supabaseId: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Usuários Prisma: ${users.length}`);

  for (const u of users) {
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
