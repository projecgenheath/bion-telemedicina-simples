/**
 * BION — Sonda detalhada de região do Supabase com classificação de erros.
 * Testa múltiplos candidatos (usuário+senha) contra os 26 poolers regionais em paralelo.
 *
 * Uso: node scripts/sondar_detalhado.js '<senha-para-postgres>'
 * Sai com código 0 e imprime "WINNER: ..." quando alguma combinação conectar.
 */
import pg from "pg";

const REF = "tnygegihboiyptrnmaqt";
const senhaPostgres = process.argv[2] || "";

const candidatos = [];
if (senhaPostgres) candidatos.push({ usuario: "postgres", senha: senhaPostgres });
// Tentativa bônus: caso o usuário tenha executado o CREATE ROLE bion_app no SQL Editor
candidatos.push({ usuario: "bion_app", senha: "SUA_SENHA_FORTE_AQUI" });

const regioes = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "sa-east-1",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "eu-south-1", "eu-south-2",
  "ap-south-1", "ap-south-2", "ap-southeast-1", "ap-southeast-2", "ap-southeast-3", "ap-southeast-4",
  "ap-northeast-1", "ap-northeast-2", "ap-northeast-3", "ap-east-1",
  "me-central-1", "me-south-1",
];

function sondar(usuario, senha, regiao) {
  return new Promise((resolve) => {
    const cs = `postgresql://${usuario}.${REF}:${encodeURIComponent(senha)}@aws-0-${regiao}.pooler.supabase.com:5432/postgres`;
    const client = new pg.Client({
      connectionString: cs,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
      statement_timeout: 5000,
    });
    const t0 = Date.now();
    client
      .connect()
      .then(() => client.query("SELECT current_user, version()"))
      .then((r) => resolve({ usuario, regiao, ok: true, ms: Date.now() - t0, info: r.rows[0] }))
      .catch((e) => resolve({ usuario, regiao, ok: false, code: e.code ?? "?", msg: (e.message || "").slice(0, 80), ms: Date.now() - t0 }))
      .finally(() => client.end().catch(() => {}));
  });
}

const tarefas = [];
for (const c of candidatos) for (const r of regioes) tarefas.push(sondar(c.usuario, c.senha, r));

console.error(`🔎 Sondando ${candidatos.length} candidatos × ${regioes.length} regiões = ${tarefas.length} combinações...`);
const resultados = await Promise.all(tarefas);

const vencedores = resultados.filter((r) => r.ok);
if (vencedores.length) {
  for (const v of vencedores) {
    console.log(`WINNER usuario=${v.usuario} regiao=${v.regiao} ms=${v.ms}`);
  }
}

// Resumo diagnóstico por usuário
for (const c of candidatos) {
  const rs = resultados.filter((r) => r.usuario === c.usuario);
  const ok = rs.filter((r) => r.ok);
  const authErro = rs.filter((r) => !r.ok && (r.code === "28P01" || r.code === "28000"));
  const outros = rs.filter((r) => !r.ok && r.code !== "28P01" && r.code !== "28000");
  console.error(`\n--- ${c.usuario} ---`);
  if (ok.length) ok.forEach((r) => console.error(`  ✅ ${r.regiao} conectou em ${r.ms}ms`));
  authErro.slice(0, 3).forEach((r) => console.error(`  🔑 ${r.regiao}: servidor respondeu mas RECUSOU a senha (${r.msg})`));
  const porCodigo = {};
  outros.forEach((r) => { porCodigo[r.code] = (porCodigo[r.code] || 0) + 1; });
  console.error(`  ❌ sem conexão válida: ${Object.entries(porCodigo).map(([k, n]) => `${k}×${n}`).join(", ") || "—"}`);
}

if (!vencedores.length) process.exit(2);