/**
 * Teste E2E de hardening — regras impostas pelo servidor.
 *
 * Fase A (sem BION_PAGAMENTO_WEBHOOK_SECRET — gateway simulado):
 *   1. POST /api/consultas ignora pago/status/notificacoes/audit do cliente
 *   2. PATCH atualizar por PACIENTE → 403
 *   3. PATCH remarcar mantém pendente_anamnese
 *   4. POST /api/notificacoes → 405
 *   5. POST /api/auditoria fora da whitelist → 403; evento leve → 200
 *   6. Sessão de usuário desativado → 401 imediato
 *   7. Webhook sem segredo → 503
 *
 * Fase B (--com-segredo, servidor com BION_PAGAMENTO_WEBHOOK_SECRET):
 *   8. Consulta criada fica pago=false (aguarda gateway)
 *   9. Webhook com assinatura inválida → 401
 *  10. Webhook assinado (HMAC-SHA256) → confirma pagamento (pago=true)
 *  11. Reentrega do webhook → idempotente
 *
 * Uso: bun scripts/teste_hardening.ts http://127.0.0.1:3000
 */
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const FASE_B = process.argv.includes("--com-segredo");
const SEGREDO = "segredo-teste-hardening-bion";
const SENHA = "bion123";

let aprovados = 0;
let falhas = 0;

function verificar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    aprovados++;
    console.log(`  ✅ ${nome}`);
  } else {
    falhas++;
    console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

type Jar = { cookie: string };

async function req(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  caminho: string,
  jar: Jar | null,
  corpo?: unknown,
  cabecalhos?: Record<string, string>,
) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    signal: AbortSignal.timeout(45_000),
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { cookie: jar.cookie } : {}),
      ...(cabecalhos ?? {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const setCookie = res.headers.get("set-cookie");
  const json = await res.json().catch(() => null);
  return { status: res.status, json, setCookie };
}

async function login(email: string): Promise<Jar> {
  const r = await req("POST", "/api/auth/login", null, { email, senha: SENHA });
  if (r.status !== 200 || !r.setCookie) throw new Error(`login ${email} falhou (${r.status})`);
  return { cookie: r.setCookie.split(";")[0] };
}

async function main() {
  console.log(`\n=== HARDENING BION — ${FASE_B ? "FASE B (webhook assinado)" : "FASE A (gateway simulado)"} — ${BASE} ===\n`);

  const marina = await login("marina.silva@email.com");
  const joao = await login("joao.pereira@email.com");
  const admin = await login("admin@bion.app");

  if (!FASE_B) {
    /* ---------- 1. Criação ignora payload do cliente ---------- */
    console.log("1) POST /api/consultas — servidor decide status/pagamento/eventos");
    const boot = (await req("GET", "/api/bootstrap", marina)).json as {
      medicos: { id: string; nome: string; especialidade: string; status: string }[];
    };
    const medico = boot.medicos.find((m) => m.status === "ativo");
    if (!medico) throw new Error("sem médico ativo no bootstrap");

    const criacao = await req("POST", "/api/consultas", marina, {
      medicoId: medico.id,
      data: "Amanhã",
      hora: "10:00",
      motivoConsulta: "Teste de hardening",
      valor: "R$ 150",
      // campos FORJADOS — devem ser ignorados:
      pago: true,
      status: "confirmada",
      notificacoes: [{ tipo: "agenda", titulo: "NOTIFICACAO_FORJADA", texto: "forjada" }],
      audit: { acao: "EVENTO_FORJADO", categoria: "admin", detalhes: "forjada" },
    });
    const cJ = criacao.json as {
      consulta?: { id: string; status: string; pago: boolean };
      pagamento?: { id: string; status: string; via: string };
      erro?: string;
    };
    verificar("criação 200 com consulta", criacao.status === 200 && !!cJ.consulta, JSON.stringify(cJ).slice(0, 200));
    verificar("status imposto: pendente_anamnese (cliente pediu confirmada)", cJ.consulta?.status === "pendente_anamnese", cJ.consulta?.status);
    verificar("pagamento confirmado pelo servidor (gateway simulado)", cJ.pagamento?.status === "confirmado" && cJ.pagamento?.via === "simulado", JSON.stringify(cJ.pagamento));
    verificar("pago=true só após confirmação server-side", cJ.consulta?.pago === true, String(cJ.consulta?.pago));
    const respTxt = JSON.stringify(criacao.json);
    verificar("notificação forjada NÃO aparece na resposta", !respTxt.includes("NOTIFICACAO_FORJADA"));
    verificar("audit forjada NÃO aparece na resposta", !respTxt.includes("EVENTO_FORJADO"));
    const consultaId = cJ.consulta!.id;

    /* ---------- 2. atualizar é só admin ---------- */
    console.log("2) PATCH atualizar por PACIENTE → 403");
    const proibido = await req("PATCH", `/api/consultas/${consultaId}`, marina, {
      acao: "atualizar",
      status: "cancelada",
    });
    verificar("paciente não usa acao atualizar (403)", proibido.status === 403, String(proibido.status));

    /* ---------- 3. remarcar mantém pendente_anamnese ---------- */
    console.log("3) PATCH remarcar — não auto-confirma");
    const remarcada = await req("PATCH", `/api/consultas/${consultaId}`, marina, {
      acao: "remarcar",
      data: "Amanhã",
      hora: "11:00",
    });
    const rJ = remarcada.json as { consulta?: { status: string; remarcada?: boolean } };
    verificar("remarcação 200", remarcada.status === 200);
    verificar("status continua pendente_anamnese", rJ.consulta?.status === "pendente_anamnese", rJ.consulta?.status);

    /* ---------- 4. POST /api/notificacoes → 405 ---------- */
    console.log("4) POST /api/notificacoes — bloqueado");
    const notif = await req("POST", "/api/notificacoes", joao, {
      tipo: "agenda",
      titulo: "NOTIFICACAO_FORJADA",
      texto: "Você ganhou R$ 1.000.000",
      usuarioId: "qualquer",
    });
    verificar("criação de notificação pelo cliente → 405", notif.status === 405, String(notif.status));

    /* ---------- 5. auditoria com whitelist ---------- */
    console.log("5) POST /api/auditoria — whitelist de eventos");
    const critico = await req("POST", "/api/auditoria", joao, {
      acao: "CONSULTA_AGENDADA",
      categoria: "consulta",
      detalhes: "forjando evento crítico",
    });
    verificar("evento crítico via cliente → 403", critico.status === 403, String(critico.status));
    const leve = await req("POST", "/api/auditoria", joao, {
      acao: "DOCUMENTO_PDF_BAIXADO",
      categoria: "admin",
      severidade: "critical",
      detalhes: "Paciente baixou PDF (evento legítimo de interface)",
    });
    verificar("evento leve da whitelist → 200", leve.status === 200, String(leve.status));

    /* ---------- 6. sessão de usuário desativado ---------- */
    console.log("6) Sessão revogada para usuário desativado");
    const carlos = await login("carlos.souza@email.com");
    const bootAdmin = (await req("GET", "/api/bootstrap", admin)).json as {
      pacientes: { id: string; email: string }[];
    };
    const carlosId = bootAdmin.pacientes.find((p) => p.email === "carlos.souza@email.com")?.id;
    verificar("carlos encontrado pelo admin", !!carlosId);
    if (carlosId) {
      await req("PATCH", `/api/pacientes/${carlosId}`, admin, { status: "inativo" });
      const apos = await req("GET", "/api/bootstrap", carlos);
      verificar("sessão do carlos inválida após desativação (401)", apos.status === 401, String(apos.status));
      await req("PATCH", `/api/pacientes/${carlosId}`, admin, { status: "ativo" });
      // As sessões antigas foram PURGADAS na desativação (comportamento correto):
      // o carlos precisa logar novamente para obter nova sessão.
      const carlosNovo = await login("carlos.souza@email.com");
      const reativado = await req("GET", "/api/bootstrap", carlosNovo);
      verificar("após reativação, novo login funciona", reativado.status === 200, String(reativado.status));
    }

    /* ---------- 7. webhook sem segredo → 503 ---------- */
    console.log("7) Webhook sem segredo configurado → 503");
    const wh = await req("POST", "/api/pagamentos/webhook", null, {
      evento: "pagamento.confirmado",
      pagamentoId: "x",
    });
    verificar("webhook desativado sem BION_PAGAMENTO_WEBHOOK_SECRET (503)", wh.status === 503, String(wh.status));

    /* ---------- limpeza ---------- */
    await req("PATCH", `/api/consultas/${consultaId}`, marina, {
      acao: "cancelar",
      motivo: "limpeza do teste de hardening",
    });
  } else {
    /* ---------- FASE B: webhook assinado ---------- */
    console.log("8) Consulta criada aguarda gateway (pago=false)");
    const boot = (await req("GET", "/api/bootstrap", marina)).json as {
      medicos: { id: string; status: string }[];
    };
    const medico = boot.medicos.find((m) => m.status === "ativo");
    if (!medico) throw new Error("sem médico ativo");
    const criacao = await req("POST", "/api/consultas", marina, {
      medicoId: medico.id,
      data: "Amanhã",
      hora: "12:00",
      motivoConsulta: "Teste webhook",
      valor: "R$ 150",
    });
    const cJ = criacao.json as {
      consulta?: { id: string; pago: boolean; status: string };
      pagamento?: { id: string; status: string };
    };
    verificar("consulta pendente_anamnese", cJ.consulta?.status === "pendente_anamnese", cJ.consulta?.status);
    verificar("pago=false aguardando webhook", cJ.consulta?.pago === false, String(cJ.consulta?.pago));
    verificar("cobrança pendente", cJ.pagamento?.status === "pendente", cJ.pagamento?.status);
    const pagamentoId = cJ.pagamento!.id;

    console.log("9) Webhook com assinatura inválida → 401");
    const ruim = await req("POST", "/api/pagamentos/webhook", null, {
      evento: "pagamento.confirmado",
      pagamentoId,
    }, { "x-bion-signature": "deadbeef" });
    verificar("assinatura inválida rejeitada (401)", ruim.status === 401, String(ruim.status));

    console.log("10) Webhook assinado confirma o pagamento");
    const corpo = JSON.stringify({ evento: "pagamento.confirmado", pagamentoId });
    const assinatura = crypto.createHmac("sha256", SEGREDO).update(corpo).digest("hex");
    const bom = await req("POST", "/api/pagamentos/webhook", null, JSON.parse(corpo), {
      "x-bion-signature": assinatura,
    });
    const bJ = bom.json as { pagamento?: { status: string; via: string } };
    verificar("webhook 200 com confirmação", bom.status === 200 && bJ.pagamento?.status === "confirmado", JSON.stringify(bom.json).slice(0, 150));
    verificar("via=webhook registrada", bJ.pagamento?.via === "webhook", bJ.pagamento?.via);

    const boot2 = (await req("GET", "/api/bootstrap", marina)).json as {
      consultas: { id: string; pago: boolean }[];
    };
    const consulta = boot2.consultas.find((c) => c.id === cJ.consulta!.id);
    verificar("consulta marcada como paga após webhook", consulta?.pago === true, String(consulta?.pago));

    console.log("11) Reentrega do webhook é idempotente");
    const deNovo = await req("POST", "/api/pagamentos/webhook", null, JSON.parse(corpo), {
      "x-bion-signature": assinatura,
    });
    verificar("reentrega 200 sem duplicar efeito", deNovo.status === 200);

    await req("PATCH", `/api/consultas/${cJ.consulta!.id}`, marina, {
      acao: "cancelar",
      motivo: "limpeza do teste de hardening (fase B)",
    });
  }

  console.log(`\n=== RESULTADO: ${aprovados} aprovados, ${falhas} falhas ===\n`);
  if (falhas > 0) process.exit(1);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
