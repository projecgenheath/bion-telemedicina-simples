/**
 * BION — Inspeciona tabelas "extras" no Supabase (fora do schema BION)
 * e salva backup dos dados em supabase/backup-tabelas-experimentais.sql
 * Uso: DATABASE_URL=... node scripts/inpecionar_extras.js
 */
import pg from "pg";

const client = new pg.Client({
  connectionString: (process.env.DATABASE_URL || "").split("?")[0],
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tabelas = (
  await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  )
).rows.map((r) => r.tablename);
console.log("Tabelas no public:", tabelas.join(", "));

const extras = tabelas.filter(
  (t) =>
    ![
      "User", "Sessao", "PerfilMedico", "PerfilPaciente", "Consulta", "Documento",
      "Arquivo", "Notificacao", "Avaliacao", "Ticket", "Lembrete", "Consentimento",
      "AuditLog", "_prisma_migrations",
    ].includes(t),
);

let backup = { geradoEm: new Date().toISOString(), tabelas: {} };

for (const t of extras) {
  const cols = (
    await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t],
    )
  ).rows;
  console.log(`\n=== ${t} (${cols.map((c) => `${c.column_name}:${c.data_type}`).join(", ")}) ===`);
  const rows = (await client.query(`SELECT * FROM "${t}"`)).rows;
  console.log(`${rows.length} linha(s):`);
  for (const r of rows) console.log("  ", JSON.stringify(r));
  backup.tabelas[t] = { colunas: cols, linhas: rows };
}

if (extras.length) {
  const fs = await import("fs");
  fs.writeFileSync("supabase/backup-tabelas-experimentais.json", JSON.stringify(backup, null, 2));
  console.log(`\n💾 Backup salvo em supabase/backup-tabelas-experimentais.json`);
  console.log("EXTRAS:" + extras.join(","));
} else {
  console.log("\nNenhuma tabela extra além do schema BION.");
}

await client.end();