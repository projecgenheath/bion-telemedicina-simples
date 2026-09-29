/**
 * Verifica configuração Supabase do BION (sem secrets em log).
 * Uso: node scripts/verificar-supabase.mjs
 */
const checks = [];

function ok(nome, detalhe = "") {
  checks.push({ nome, ok: true, detalhe });
  console.log(`  ✓ ${nome}${detalhe ? " — " + detalhe : ""}`);
}
function fail(nome, detalhe = "") {
  checks.push({ nome, ok: false, detalhe });
  console.log(`  ✗ ${nome}${detalhe ? " — " + detalhe : ""}`);
}

console.log("BION — verificação Supabase\n");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const db = process.env.DATABASE_URL?.trim();

if (url?.startsWith("https://") && url.includes("supabase")) ok("NEXT_PUBLIC_SUPABASE_URL", url.replace(/https:\/\//, "").slice(0, 24) + "…");
else fail("NEXT_PUBLIC_SUPABASE_URL", "ausente ou inválida");

if (anon && anon.length > 20) ok("NEXT_PUBLIC_SUPABASE_ANON_KEY", `${anon.slice(0, 12)}…`);
else fail("NEXT_PUBLIC_SUPABASE_ANON_KEY", "ausente");

if (service && service.length > 20) ok("SUPABASE_SERVICE_ROLE_KEY", "configurada");
else fail("SUPABASE_SERVICE_ROLE_KEY", "ausente — Storage/seed Auth/admin limitados");

if (db?.includes("postgres")) ok("DATABASE_URL", "configurada");
else fail("DATABASE_URL", "ausente");

const pendentes = checks.filter((c) => !c.ok);
console.log(
  pendentes.length
    ? `\nPendências: ${pendentes.length}. Veja docs/SUPABASE_MIGRACAO.md`
    : "\nTudo configurado para Auth + Storage + Realtime + Postgres.",
);
process.exit(pendentes.length ? 1 : 0);
