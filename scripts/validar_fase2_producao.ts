/** Verificação da FASE 2 em PRODUÇÃO — contrato delta pós-deploy. */
const BASE = "https://bion-telemedicina-simples.vercel.app";

async function login(email: string, senha: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  return { res, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "), json: await res.json() };
}
async function req(method: string, url: string, cookie: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  return { res, json: await res.json().catch(() => null) };
}

let falhas = 0;
const check = (n: string, ok: boolean, extra = "") =>
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`) || (ok ? 0 : falhas++);

const marina = await login("marina.silva@email.com", "bion123456");
check("login produção", marina.res.status === 200, `status=${marina.res.status}`);

// lembrete → delta + cleanup
const lem = await req("POST", "/api/lembretes", marina.cookie, {
  titulo: "Fase2 prod — lembrete", horario: "07:30", tipo: "medicamento", frequencia: "Diário",
});
check(
  "POST lembretes → delta (sem usuario)",
  lem.res.status === 200 && Boolean(lem.json?.lembrete?.id) && !lem.json?.usuario,
  `bytes=${JSON.stringify(lem.json).length}`,
);
if (lem.json?.lembrete?.id) await req("DELETE", `/api/lembretes/${lem.json.lembrete.id}`, marina.cookie);

// perfil → perfilPacienteCompleto
const pf = await req("PATCH", "/api/perfil", marina.cookie, { peso: "68 kg" });
check(
  "PATCH perfil → perfilPacienteCompleto (sem estado completo)",
  pf.res.status === 200 && Boolean(pf.json?.perfilPacienteCompleto?.nome) && !pf.json?.usuario,
  `bytes=${JSON.stringify(pf.json).length}`,
);

// ticket → delta
const tk = await req("POST", "/api/tickets", marina.cookie, {
  assunto: "Fase2 prod", categoria: "outro", mensagem: "Verificação pós-deploy do contrato delta.",
});
check(
  "POST tickets → delta ticket",
  tk.res.status === 200 && Boolean(tk.json?.ticket?.id) && !tk.json?.usuario,
  `bytes=${JSON.stringify(tk.json).length}`,
);

// bootstrap segue estado fresco completo
const boot = await req("GET", "/api/bootstrap", marina.cookie);
check("bootstrap íntegro (usuario presente)", Boolean(boot.json?.usuario?.id));

// anamnese (se houver consulta na janela)
const consulta = (boot.json?.consultas ?? []).find((c: { id: string }) => c.id);
if (consulta) {
  const an = await req("POST", "/api/anamnese", marina.cookie, { consultaId: consulta.id, historico: [] });
  const semDados = !("dados" in (an.json ?? {}));
  check(
    "POST anamnese → texto + delta, SEM dados",
    an.res.status === 200 && typeof an.json?.texto === "string" && semDados,
    `status=${an.res.status} bytes=${JSON.stringify(an.json).length} (${an.res.status !== 200 ? "fora da janela de triagem — esperado p/ consultas antigas" : "delta ok"})`,
  );
} else {
  console.log("SKIP anamnese (sem consulta em produção p/ marina)");
}

console.log(falhas === 0 ? "\nPRODUÇÃO: TODOS OS CHECKS PASSARAM" : `\nPRODUÇÃO: ${falhas} CHECK(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
