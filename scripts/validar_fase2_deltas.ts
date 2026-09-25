/**
 * FASE 2 da auditoria front-end — validação do contrato delta ponta a ponta.
 * Uso: bun scripts/validar_fase2_deltas.ts [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

let falhas = 0;
function checar(nome: string, cond: boolean, extra = "") {
  if (cond) console.log(`PASS ${nome}${extra ? ` — ${extra}` : ""}`);
  else {
    console.log(`FAIL ${nome}${extra ? ` — ${extra}` : ""}`);
    falhas++;
  }
}

async function login(email: string, senha: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const json = await res.json();
  return { res, cookie, json };
}

async function req(
  method: string,
  url: string,
  cookie: string,
  corpo?: unknown,
) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

async function main() {
  // 1) Login paciente
  const marina = await login("marina.silva@email.com", "bion123456");
  checar("login marina 200", marina.res.status === 200, `status=${marina.res.status}`);
  const cm = marina.cookie;
  const marinaId = marina.json?.usuario?.id;

  // 2) Lembrete (contrato delta pré-existente segue ok)
  const lem = await req("POST", "/api/lembretes", cm, {
    titulo: "Fase2 delta — lembrete", horario: "07:30", tipo: "medicamento", frequencia: "Diário",
  });
  const lemOk = lem.res.status === 200 && lem.json?.lembrete?.id && !lem.json?.usuario;
  checar("POST /api/lembretes → delta lembrete", lemOk, `status=${lem.res.status} bytes=${JSON.stringify(lem.json).length}`);
  if (lemOk) await req("DELETE", `/api/lembretes/${lem.json.lembrete.id}`, cm);

  // 3) Ticket → delta ticket
  const tk = await req("POST", "/api/tickets", cm, {
    assunto: "Fase2 delta", categoria: "outro", mensagem: "Validação do contrato delta de tickets.",
  });
  checar(
    "POST /api/tickets → delta ticket",
    tk.res.status === 200 && tk.json?.ticket?.id && !tk.json?.usuario,
    `status=${tk.res.status} bytes=${JSON.stringify(tk.json).length}`,
  );

  // 4) Perfil PATCH → perfilPacienteCompleto (sem estado completo)
  const pf = await req("PATCH", "/api/perfil", cm, { peso: "68 kg" });
  checar(
    "PATCH /api/perfil → perfilPacienteCompleto",
    pf.res.status === 200 && pf.json?.perfilPacienteCompleto?.nome && !pf.json?.usuario,
    `status=${pf.res.status} bytes=${JSON.stringify(pf.json).length}`,
  );

  // 5) Consentimento → delta consentimento
  const cs = await req("POST", "/api/consentimentos", cm, {
    finalidade: "Fase2 delta", documentos: 1, aceito: true,
  });
  checar(
    "POST /api/consentimentos → delta consentimento",
    cs.res.status === 200 && cs.json?.consentimento?.id && !cs.json?.usuario,
    `status=${cs.res.status} bytes=${JSON.stringify(cs.json).length}`,
  );

  // 6) Consulta do marina (para anamnese) — pega do bootstrap
  const boot = await req("GET", "/api/bootstrap", cm);
  const consultas = boot.json?.consultas ?? [];
  checar("bootstrap intacto (usuario presente)", Boolean(boot.json?.usuario?.id));

  // Agenda uma consulta de validação (pagamento simulado confirma no servidor)
  // para ABRIR a janela da triagem (disponível até 5 min antes do horário).
  const medicoAlvo = boot.json?.medicos?.find(
    (m: { nome: string }) => m.nome === "Dra. Ana Ribeiro",
  ) ?? boot.json?.medicos?.[0];
  let consultaAlvo = consultas.find((c: { id: string }) => c.id);
  if (medicoAlvo?.id) {
    const ag = await req("POST", "/api/consultas", cm, {
      medicoId: medicoAlvo.id,
      data: "Amanhã",
      hora: "10:00",
      motivoConsulta: "Validação FASE 2 — janela da triagem",
      valor: medicoAlvo.valor ?? 150,
      metodo: "pix",
    });
    checar(
      "POST /api/consultas → delta consulta (fluxo já delta)",
      ag.res.status === 200 && Boolean(ag.json?.consulta?.id) && !ag.json?.usuario,
      `status=${ag.res.status} bytes=${JSON.stringify(ag.json).length}`,
    );
    consultaAlvo = ag.json?.consulta?.id
      ? ag.json.consulta
      : consultaAlvo;
  }

  // 7) Anamnese POST → SEM `dados` (estado completo), COM anamnese delta
  if (consultaAlvo) {
    const an = await req("POST", "/api/anamnese", cm, { consultaId: consultaAlvo.id, historico: [] });
    const semDados = !("dados" in (an.json ?? {}));
    checar(
      "POST /api/anamnese (abertura) → texto + delta, SEM dados",
      an.res.status === 200 && typeof an.json?.texto === "string" && semDados && Boolean(an.json?.anamnese?.id),
      `status=${an.res.status} bytes=${JSON.stringify(an.json).length} temAnamnese=${Boolean(an.json?.anamnese?.id)}`,
    );
  } else {
    console.log("SKIP anamnese (marina sem consulta)");
  }

  // 8) Login médico → documento delta
  const ana = await login("ana.ribeiro@med.bion.app", "bion123456");
  checar("login ana 200", ana.res.status === 200, `status=${ana.res.status}`);
  if (ana.res.status === 200) {
    const bootAna = await req("GET", "/api/bootstrap", ana.cookie);
    const ca = (bootAna.json?.consultas ?? []).find(
      (c: { pacienteId?: string }) => c.pacienteId && (!marinaId || c.pacienteId === marinaId),
    );
    const pacienteId = ca?.pacienteId ?? bootAna.json?.pacientes?.[0]?.id;
    if (pacienteId) {
      const doc = await req("POST", "/api/documentos", ana.cookie, {
        tipo: "atestado",
        titulo: "Fase2 delta — atestado de validação",
        conteudo: "Documento gerado pela validação automatizada da FASE 2 (contrato delta).",
        pacienteId,
      });
      checar(
        "POST /api/documentos → delta documento",
        doc.res.status === 200 && doc.json?.documento?.id && !doc.json?.usuario,
        `status=${doc.res.status} bytes=${JSON.stringify(doc.json).length}`,
      );

      // 9) Avaliação (exige consulta concluída — pode 403, o que também valida contrato de erro)
      if (ca?.id) {
        const av = await req("POST", "/api/avaliacoes", ana.cookie, {
          consultaId: ca.id, medicoId: ca.medicoId ?? ana.json?.usuario?.id, nota: 5,
        });
        console.log(`INFO avaliação status=${av.res.status} (403 esperado p/ consulta não concluída)`);
      }
    } else {
      console.log("SKIP documento (sem paciente vinculado à Dra. Ana)");
    }
  }

  // 10) 404 de rota antiga não aplicável — encerra
  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
