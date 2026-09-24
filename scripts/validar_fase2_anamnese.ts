/** Valida PATCH /api/anamnese (documento + concluir) — contrato delta FASE 2. */
const BASE = process.argv[2] ?? "http://localhost:3000";

async function login(email: string, senha: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  return { cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "), json: await res.json() };
}
async function req(method: string, url: string, cookie: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  return { res, json: await res.json().catch(() => null) };
}

const marina = await login("marina.silva@email.com", "bion123456");
const boot = await req("GET", "/api/bootstrap", marina.cookie);

// A anamnese nasce junto com a consulta criada via API — cria uma NOVA
// (consulta antiga do seed pode não ter linha de anamnese → 404).
const medicoAlvo =
  boot.json?.medicos?.find((m: { nome: string }) => m.nome === "Dra. Ana Ribeiro") ??
  boot.json?.medicos?.[0];
const ag = await req("POST", "/api/consultas", marina.cookie, {
  medicoId: medicoAlvo?.id,
  data: "Amanhã",
  hora: "11:30",
  motivoConsulta: "Validação FASE 2 — PATCH anamnese",
  valor: medicoAlvo?.valor ?? 150,
  metodo: "pix",
});
const consulta = ag.json?.consulta;
if (!consulta) {
  console.log(`FAIL consulta de validação (status=${ag.res.status}) ${JSON.stringify(ag.json).slice(0, 120)}`);
  process.exit(1);
}

// documento
const doc = await req("PATCH", "/api/anamnese", marina.cookie, {
  consultaId: consulta.id,
  acao: "documento",
  documento: { nome: "hemograma.pdf", tipo: "exame", exameImportado: false, resumo: "validação FASE 2" },
});
const docOk = doc.res.status === 200 && doc.json?.anamnese?.id && !doc.json?.usuario;
console.log(`${docOk ? "PASS" : "FAIL"} PATCH anamnese documento → delta anamnese (status=${doc.res.status} bytes=${JSON.stringify(doc.json).length})`);

// concluir
const con = await req("PATCH", "/api/anamnese", marina.cookie, { consultaId: consulta.id, acao: "concluir" });
const conOk =
  con.res.status === 200 &&
  con.json?.anamnese?.id &&
  con.json?.anamnese?.status === "concluida" &&
  !con.json?.usuario;
console.log(`${conOk ? "PASS" : "FAIL"} PATCH anamnese concluir → delta anamnese${con.json?.consulta?.id ? " + consulta (legado confirmado)" : ""} (status=${con.res.status} bytes=${JSON.stringify(con.json).length})`);

// idempotente (já concluída)
const rep = await req("PATCH", "/api/anamnese", marina.cookie, { consultaId: consulta.id, acao: "concluir" });
const repOk = rep.res.status === 200 && rep.json?.anamnese?.id && !rep.json?.usuario;
console.log(`${repOk ? "PASS" : "FAIL"} PATCH anamnese concluir (repeticão) → delta (status=${rep.res.status})`);

process.exit(docOk && conOk && repOk ? 0 : 1);
