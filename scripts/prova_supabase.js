/**
 * BION — Prova de integração: lê sessões e usuários DIRETO do Supabase.
 * Uso: DATABASE_URL='<url>' node scripts/prova_supabase.js
 */
import pg from "pg";

const client = new pg.Client({
  connectionString: (process.env.DATABASE_URL || "").split("?")[0],
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const sessoes = await client.query(
  `SELECT s.id, u.email, u.role, s."expiresAt" > NOW() AS valida
     FROM "Sessao" s JOIN "User" u ON u.id = s."userId"
    ORDER BY s."expiresAt" DESC LIMIT 5`,
);
console.log(`📋 Sessões gravadas no SUPABASE: ${sessoes.rowCount}`);
for (const s of sessoes.rows) {
  console.log(`   • ${s.email} (${s.role}) — sessão ${s.valida ? "válida ✅" : "expirada"}`);
}

const consultas = await client.query(
  `SELECT c.status, p.nome AS paciente, m.nome AS medico, c."dataInicio"::date AS dia
     FROM "Consulta" c
     JOIN "User" p ON p.id = c."pacienteId"
     JOIN "User" m ON m.id = c."medicoId"
    ORDER BY c."dataInicio" LIMIT 6`,
);
console.log(`\n🗓️  Consultas no SUPABASE: ${consultas.rowCount}`);
for (const c of consultas.rows) {
  console.log(`   • ${c.paciente} com ${c.medico} — ${c.dia.toISOString().slice(0, 10)} — ${c.status}`);
}

await client.end();