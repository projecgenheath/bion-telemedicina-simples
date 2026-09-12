/**
 * Teste E2E da sinalização WebRTC da sala de teleconsulta (Fase 2).
 * Simula 2 sessões reais (paciente + médico) contra o servidor Next.js rodando:
 *   1. login dos dois
 *   2. descobre a consulta confirmada do paciente
 *   3. paciente entra na sala (GET = heartbeat) e publica OFERTA
 *   4. médico faz GET → deve receber a oferta; publica RESPOSTA + CANDIDATO + CHAT
 *   5. paciente faz GET → deve receber resposta + candidato + chat
 *   6. paciente publica CONTROLE encerrada; médico deve receber
 *   7. segurança: admin recebe 403; sem cookie recebe 401; payload inválido 400
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

function cookieDe(res) {
  const raw = res.headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha: "bion123" }),
  });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
  return cookieDe(res);
}

async function get(url, cookie) {
  return fetch(url, { headers: { cookie }, cache: "no-store" });
}

async function post(url, cookie, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

let passos = 0;
function ok(nome, cond, extra = "") {
  passos++;
  console.log(`${cond ? "PASS" : "FAIL"} [${passos}] ${nome}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  // 1) Logins
  const cookiePaciente = await login("marina.silva@email.com");
  const cookieMedico = await login("ana.ribeiro@med.bion.app");
  const cookieAdmin = await login("admin@bion.app");
  ok("logins paciente/médico/admin", !!cookiePaciente && !!cookieMedico && !!cookieAdmin);

  // 2) Consulta confirmada do paciente
  const resBoot = await get(`${BASE}/api/bootstrap`, cookiePaciente);
  const boot = await resBoot.json();
  const consulta = (boot.consultas || []).find((c) => c.status === "confirmada");
  ok("existe consulta confirmada para o paciente", !!consulta, consulta?.id);
  const sala = `${BASE}/api/telemedicina/${consulta.id}/sala`;

  // 3) 401 sem cookie
  const resAnon = await get(sala, "");
  ok("GET sala sem cookie → 401", resAnon.status === 401, `status=${resAnon.status}`);

  // 4) Admin (não participante) → 403
  const resAdmin = await get(sala, cookieAdmin);
  ok("GET sala como admin → 403", resAdmin.status === 403, `status=${resAdmin.status}`);

  // 5) Paciente entra na sala (heartbeat) — e mantém heartbeat em background
  //    como o app real faz (polling a cada 1,5s), já que os requests deste
  //    teste contra o Supabase demoram ~2s cada e a janela de presença é 12s.
  const resSalaP = await get(sala, cookiePaciente);
  const salaP = await resSalaP.json();
  // Heartbeat acumula sinais — cada GET consome os sinais pendentes (entrega única)
  const sinaisColetados = [];
  const heartbeat = setInterval(async () => {
    try {
      const r = await get(sala, cookiePaciente);
      if (r.ok) {
        const d = await r.json();
        sinaisColetados.push(...(d.sinais || []));
      }
    } catch {}
  }, 2000);
  heartbeat.unref?.();
  ok("GET sala paciente → 200", resSalaP.status === 200);
  ok("papel do paciente = PACIENTE", salaP.eu?.papel === "PACIENTE");
  ok("médico ainda não está na sala", salaP.outroOnline === false);
  ok("sinalização traz nomes reais", salaP.consulta?.medico?.includes("Ana"), salaP.consulta?.medico);

  // 6) POST payload inválido → 400
  const resInv = await post(sala, cookiePaciente, { acao: "sinal", tipo: "foguete", payload: "{}" });
  ok("POST sinal tipo inválido → 400", resInv.status === 400, `status=${resInv.status}`);

  // 7) Paciente publica OFERTA
  const oferta = {
    type: "offer",
    sdp: "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=grupo-teste\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
  };
  const resOferta = await post(sala, cookiePaciente, {
    acao: "sinal",
    tipo: "oferta",
    payload: JSON.stringify(oferta),
  });
  ok("POST oferta paciente → 200", resOferta.status === 200, `status=${resOferta.status}`);

  // 8) Paciente publica CANDIDATO
  const cand = { candidate: "candidate:842163049 1 udp 1677729535 10.0.0.2 54400 typ srflx", sdpMid: "0" };
  await post(sala, cookiePaciente, { acao: "sinal", tipo: "candidato", payload: JSON.stringify(cand) });

  // 9) Médico faz GET → recebe oferta + candidato
  const resSalaM = await get(sala, cookieMedico);
  const salaM = await resSalaM.json();
  ok("GET sala médico → 200", resSalaM.status === 200);
  ok("médico vê paciente online", salaM.outroOnline === true);
  const sinalOferta = (salaM.sinais || []).find((s) => s.tipo === "oferta");
  const sinalCand = (salaM.sinais || []).find((s) => s.tipo === "candidato");
  ok("médico recebeu OFERTA do paciente", !!sinalOferta);
  ok("oferta contém SDP", !!sinalOferta && sinalOferta.payload.includes("v=0"));
  ok("médico recebeu CANDIDATO", !!sinalCand);

  // 10) Médico publica RESPOSTA + CHAT
  const resposta = { type: "answer", sdp: "v=0\r\no=- 999 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n" };
  await post(sala, cookieMedico, { acao: "sinal", tipo: "resposta", payload: JSON.stringify(resposta) });
  await post(sala, cookieMedico, { acao: "sinal", tipo: "chat", payload: JSON.stringify({ texto: "Olá Marina, pode me ouvir?" }) });

  // 11) Entrega única: segundo GET do médico NÃO traz os mesmos sinais
  const resSalaM2 = await get(sala, cookieMedico);
  const salaM2 = await resSalaM2.json();
  ok("entrega única — sinais consumidos no 2º GET", (salaM2.sinais || []).length === 0);

  // 12) Paciente recebe (via GETs de heartbeat + pull oficial) → resposta + chat
  await new Promise((r) => setTimeout(r, 3500)); // dá tempo para o heartbeat coletar
  const resSalaP2 = await get(sala, cookiePaciente);
  const salaP2 = await resSalaP2.json();
  const todosSinaisP = [...sinaisColetados, ...(salaP2.sinais || [])];
  const sinalResposta = todosSinaisP.find((s) => s.tipo === "resposta");
  const sinalChat = todosSinaisP.find((s) => s.tipo === "chat");
  ok("paciente recebeu RESPOSTA do médico", !!sinalResposta);
  ok("paciente recebeu CHAT real", !!sinalChat && JSON.parse(sinalChat.payload).texto.includes("Olá Marina"));

  // 13) Paciente envia CONTROLE encerrada
  await post(sala, cookiePaciente, { acao: "sinal", tipo: "controle", payload: JSON.stringify({ acao: "encerrada" }) });
  const resSalaM3 = await get(sala, cookieMedico);
  const salaM3 = await resSalaM3.json();
  const controle = (salaM3.sinais || []).find((s) => s.tipo === "controle");
  ok("médico recebeu CONTROLE de encerramento", !!controle && JSON.parse(controle.payload).acao === "encerrada");

  // 14) Consulta permanece no status original (encerramento de chamada ≠ concluir consulta)
  const resBoot2 = await get(`${BASE}/api/bootstrap`, cookiePaciente);
  const boot2 = await resBoot2.json();
  const consulta2 = (boot2.consultas || []).find((c) => c.id === consulta.id);
  ok("status da consulta inalterado pelo sinal de controle", consulta2?.status === "confirmada", consulta2?.status);

  clearInterval(heartbeat);

  console.log(`\n${process.exitCode ? "❌ HÁ FALHAS" : "✅ TODOS OS ${passos} PASSOS PASSARAM"}`.replace("${passos}", passos));
})();
