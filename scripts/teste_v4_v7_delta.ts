/**
 * Teste E2E — V4 (troca de senha), V7 (leitura de broadcast por usuário)
 * e contrato delta (lembretes/medições/auditoria/mensagens).
 *
 * Cobre:
 *   V4-1  Conta criada pelo admin nasce com precisaTrocarSenha=true
 *   V4-2  Login devolve o flag; senha atual errada → 401
 *   V4-3  Nova senha fraca/igual → 400
 *   V4-4  Troca OK → 200; senha antiga morre (401); nova senha entra; flag=false
 *   V7-5  Ticket cria notificação broadcast (paraRole=ADMIN) — lida=false
 *   V7-6  PATCH {id} marca via NotificacaoLeitura: linha permanece lida=false
 *         no banco e a leitura é POR usuário
 *   V7-7  PATCH {todas} cria leituras sem tocar na linha compartilhada
 *   V7-8  Bootstrap do admin mostra lida=true (visão por usuário)
 *   Δ-9   lembretes/medições/auditoria/mensagens devolvem DELTA (sem `usuario`)
 *   Δ-10  GET /api/mensagens?desde= devolve apenas mensagens novas
 *
 * Uso: bun scripts/teste_v4_v7_delta.ts http://127.0.0.1:3000
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const SENHA_PADRAO = "bion123";
const SENHA_NOVA = "BionTeste2026";

const db = new PrismaClient();
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
) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    signal: AbortSignal.timeout(45_000),
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { cookie: jar.cookie } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  const setCookie = res.headers.get("set-cookie");
  const json = await res.json().catch(() => null);
  return { status: res.status, json, setCookie };
}

async function login(email: string, senha: string) {
  const r = await req("POST", "/api/auth/login", null, { email, senha });
  const jar = r.setCookie ? ({ cookie: r.setCookie.split(";")[0] } as Jar) : null;
  return { status: r.status, json: r.json as { usuario?: { precisaTrocarSenha?: boolean } } | null, jar };
}

async function main() {
  console.log(`\n=== BION — V4 senha + V7 broadcast + delta — ${BASE} ===\n`);
  const nomeTeste = `Teste V4 ${Date.now()}`;

  try {
    /* ---------------- V4 — troca de senha ---------------- */
    console.log("V4) Troca de senha de conta criada pela administração");
    const admin = await login("admin@bion.app", SENHA_PADRAO);
    if (admin.status !== 200 || !admin.jar) throw new Error("login admin falhou");

    const criacao = await req("POST", "/api/pacientes", admin.jar, {
      nome: nomeTeste,
      telefone: "11999990001",
      cpf: "000.000.001-00",
      idade: 40,
      genero: "Masculino",
      convenio: "Particular",
      status: "ativo",
    });
    verificar("admin cria paciente (200)", criacao.status === 200);
    const criado = (criacao.json as { pacientes?: { nome: string; email: string }[] } | null)
      ?.pacientes?.find((p) => p.nome === nomeTeste);
    verificar("paciente criado visível no bootstrap do admin", !!criado?.email, JSON.stringify(criado ?? {}).slice(0, 80));
    if (!criado) throw new Error("paciente de teste não encontrado");

    const primeiroLogin = await login(criado.email, SENHA_PADRAO);
    verificar("login com senha padrão funciona (200)", primeiroLogin.status === 200);
    verificar("flag precisaTrocarSenha=true no login", primeiroLogin.json?.usuario?.precisaTrocarSenha === true);
    const jarNovo = primeiroLogin.jar!;

    const senhaErrada = await req("POST", "/api/auth/senha", jarNovo, {
      senhaAtual: "errada123",
      novaSenha: SENHA_NOVA,
    });
    verificar("senha atual errada → 401", senhaErrada.status === 401);

    const fraca = await req("POST", "/api/auth/senha", jarNovo, {
      senhaAtual: SENHA_PADRAO,
      novaSenha: "sóletras",
    });
    verificar("nova senha sem números → 400", fraca.status === 400);
    const igual = await req("POST", "/api/auth/senha", jarNovo, {
      senhaAtual: SENHA_PADRAO,
      novaSenha: SENHA_PADRAO,
    });
    verificar("nova senha igual à atual → 400", igual.status === 400);

    const troca = await req("POST", "/api/auth/senha", jarNovo, {
      senhaAtual: SENHA_PADRAO,
      novaSenha: SENHA_NOVA,
    });
    verificar("troca com senha atual correta → 200", troca.status === 200, JSON.stringify(troca.json).slice(0, 120));

    const senhaVelha = await login(criado.email, SENHA_PADRAO);
    verificar("login com senha antiga → 401", senhaVelha.status === 401);

    const novoLogin = await login(criado.email, SENHA_NOVA);
    verificar("login com nova senha → 200", novoLogin.status === 200);
    verificar("flag precisaTrocarSenha=false após troca", novoLogin.json?.usuario?.precisaTrocarSenha === false);
    const audSenha = await db.auditLog.findFirst({ where: { acao: "SENHA_ALTERADA", usuarioNome: nomeTeste } });
    verificar("auditoria SENHA_ALTERADA registrada", !!audSenha);

    /* ---------------- V7 — broadcast por usuário ---------------- */
    console.log("\nV7) Leitura de broadcast por usuário (NotificacaoLeitura)");
    const marina = await login("marina.silva@email.com", SENHA_PADRAO);
    if (marina.status !== 200 || !marina.jar) throw new Error("login marina falhou");

    const ticketAssunto = `Teste V7 ${Date.now()}`;
    const ticket = await req("POST", "/api/tickets", marina.jar, {
      assunto: ticketAssunto,
      categoria: "tecnico",
      mensagem: "Mensagem de teste da suíte V4/V7.",
    });
    verificar("ticket criado pela paciente (200)", ticket.status === 200);

    const bootAdmin = await req("GET", "/api/bootstrap", admin.jar);
    const notifsAdmin = (bootAdmin.json as { notificacoes?: { id: string; titulo: string; lida: boolean; tipo: string; usuarioId: string | null; texto: string }[] } | null)
      ?.notificacoes ?? [];
    const alvo = notifsAdmin.find(
      (n) => n.usuarioId === null && n.titulo === "Novo chamado de suporte" && n.texto.includes(ticketAssunto),
    );
    verificar("broadcast de ticket visível ao admin (linha compartilhada)", !!alvo);
    if (!alvo) throw new Error("notificação de broadcast não encontrada");
    verificar("broadcast nasce lida=false para o admin", alvo.lida === false);

    const marcou = await req("PATCH", "/api/notificacoes", admin.jar, { id: alvo.id });
    const wire = (marcou.json as { notificacoes?: { id: string; lida: boolean }[] } | null)?.notificacoes;
    verificar("PATCH {id} devolve delta com lida=true", marcou.status === 200 && wire?.[0]?.lida === true);

    const linha = await db.notificacao.findUnique({ where: { id: alvo.id } });
    const leitura = await db.notificacaoLeitura.findUnique({
      where: { notificacaoId_usuarioId: { notificacaoId: alvo.id, usuarioId: (await db.user.findUnique({ where: { email: "admin@bion.app" } }))!.id } },
    });
    verificar("linha compartilhada permanece lida=false no banco", linha?.lida === false);
    verificar("leitura registrada em NotificacaoLeitura para o admin", !!leitura);

    // Bootstrap: visão por usuário — admin deve ver lida=true
    const bootAdmin2 = await req("GET", "/api/bootstrap", admin.jar);
    const alvo2 = (bootAdmin2.json as { notificacoes?: { id: string; lida: boolean }[] } | null)
      ?.notificacoes?.find((n) => n.id === alvo.id);
    verificar("bootstrap do admin mostra broadcast como lida (visão dele)", alvo2?.lida === true);

    // { todas: true } — dirigidas + broadcasts via leitura
    const todas = await req("PATCH", "/api/notificacoes", admin.jar, { todas: true });
    verificar("PATCH {todas} → 200", todas.status === 200);
    const naoLidasDepois = (await req("GET", "/api/bootstrap", admin.jar)).json as { notificacoes?: { lida: boolean }[] };
    verificar("após {todas}, nenhum badge pendente para o admin", (naoLidasDepois.notificacoes ?? []).every((n) => n.lida));

    /* ---------------- Delta — lembretes/medições/auditoria/mensagens ---------------- */
    console.log("\nΔ) Contrato delta nas mutações leves");
    const lembr = await req("POST", "/api/lembretes", marina.jar, {
      titulo: `Teste delta ${Date.now()}`,
      horario: "08:00",
      tipo: "Medicação",
      frequencia: "Todos os dias",
    });
    const lembrJson = lembr.json as { lembrete?: { id: string; feito: boolean }; usuario?: unknown } | null;
    verificar("POST /api/lembretes devolve delta (lembrete)", lembr.status === 200 && !!lembrJson?.lembrete);
    verificar("delta NÃO carrega estado fresco (sem usuario)", lembrJson && !("usuario" in lembrJson));

    const alternado = await req("PATCH", `/api/lembretes/${lembrJson!.lembrete!.id}`, marina.jar, { feito: true });
    const altJson = alternado.json as { lembrete?: { feito: boolean } } | null;
    verificar("PATCH lembrete devolve lembrete.feito=true", alternado.status === 200 && altJson?.lembrete?.feito === true);

    const removido = await req("DELETE", `/api/lembretes/${lembrJson!.lembrete!.id}`, marina.jar);
    verificar("DELETE lembrete devolve lembreteRemovido", removido.status === 200 && (removido.json as { lembreteRemovido?: string } | null)?.lembreteRemovido === lembrJson!.lembrete!.id);

    const medicao = await req("POST", "/api/medicoes", marina.jar, { tipo: "peso", valor1: 71 });
    const medJson = medicao.json as { medicao?: { id: string; tipo: string }; perfilPaciente?: { peso?: string }; usuario?: unknown } | null;
    verificar("POST /api/medicoes devolve delta (medicao)", medicao.status === 200 && medJson?.medicao?.tipo === "peso");
    verificar("medição sincroniza perfil no delta (peso=71)", medJson?.perfilPaciente?.peso === "71");
    verificar("delta de medição NÃO carrega usuario", medJson && !("usuario" in medJson));

    const audit = await req("POST", "/api/auditoria", marina.jar, { acao: "DOCUMENTO_VISUALIZADO", detalhes: "teste delta" });
    const audJson = audit.json as { audit?: { acao: string }; usuario?: unknown } | null;
    verificar("POST /api/auditoria devolve delta (audit)", audit.status === 200 && audJson?.audit?.acao === "DOCUMENTO_VISUALIZADO");
    verificar("delta de auditoria NÃO carrega usuario", audJson && !("usuario" in audJson));

    // Mensagens: marina → admin (suporte é permitido) e PATCH delta + GET ?desde=
    const adminUser = await db.user.findUnique({ where: { email: "admin@bion.app" } });
    const msg = await req("POST", "/api/mensagens", marina.jar, {
      paraId: adminUser!.id,
      texto: "Mensagem de teste do polling incremental.",
    });
    const msgJson = msg.json as { mensagem?: { id: string; createdAt: string }; usuario?: unknown } | null;
    verificar("POST /api/mensagens devolve delta (mensagem)", msg.status === 200 && !!msgJson?.mensagem);
    verificar("delta de mensagem NÃO carrega usuario", msgJson && !("usuario" in msgJson));

    // Polling incremental ANTES do PATCH: apenas a mensagem nova deve vir
    // (mensagens antigas não têm createdAt nem updatedAt dentro da janela).
    const desde = new Date(Date.now() - 60_000).toISOString();
    const incremental = await req("GET", `/api/mensagens?desde=${encodeURIComponent(desde)}`, admin.jar);
    const incJson = incremental.json as { mensagens?: { id: string }[] } | null;
    const totalAntes = (await req("GET", "/api/mensagens", admin.jar)).json as { mensagens?: { id: string }[] };
    verificar(
      "GET ?desde= devolve apenas mensagens recentes",
      incremental.status === 200 && (incJson?.mensagens?.length ?? 0) === 1 && incJson?.mensagens?.[0]?.id === msgJson!.mensagem!.id && (incJson?.mensagens?.length ?? 0) < (totalAntes.mensagens?.length ?? 0),
      `incremental=${incJson?.mensagens?.length} total=${totalAntes.mensagens?.length}`,
    );

    // PATCH marca a conversa como lida — atualiza updatedAt (recibos)
    const patchMsg = await req("PATCH", "/api/mensagens", admin.jar, { comUsuarioId: (await db.user.findUnique({ where: { email: "marina.silva@email.com" } }))!.id });
    const patchJson = patchMsg.json as { mensagens?: { id: string; lida: boolean }[]; usuario?: unknown } | null;
    verificar("PATCH /api/mensagens devolve delta (mensagens)", patchMsg.status === 200 && Array.isArray(patchJson?.mensagens));
    verificar("delta de leitura NÃO carrega usuario", patchJson && !("usuario" in patchJson));

    // Recibo de leitura visível para a MARINA via ?desde= (updatedAt mudou)
    const recibos = await req("GET", `/api/mensagens?desde=${encodeURIComponent(desde)}`, marina.jar);
    const recJson = recibos.json as { mensagens?: { id: string; lida: boolean }[] } | null;
    const aMensagem = recJson?.mensagens?.find((m) => m.id === msgJson!.mensagem!.id);
    verificar("recibo de leitura propaga no polling incremental (lida=true)", aMensagem?.lida === true);
  } finally {
    /* ---------------- Limpeza (banco, idempotente) ---------------- */
    console.log("\nLimpeza dos dados de teste...");
    try {
      const pacientesTeste = await db.user.findMany({
        where: { nome: { contains: "Teste V4" }, role: "PACIENTE" },
        select: { id: true },
      });
      for (const p of pacientesTeste) {
        await db.user.delete({ where: { id: p.id } }); // cascata: perfil/sessões
      }
      const ticketsTeste = await db.ticket.findMany({ where: { assunto: { contains: "Teste V7" } }, select: { id: true } });
      for (const t of ticketsTeste) {
        await db.notificacaoLeitura.deleteMany({ where: { notificacao: { titulo: { contains: t.id } } } });
        await db.notificacao.deleteMany({ where: { texto: { contains: "Mensagem de teste da suíte V4/V7" } } });
        await db.ticket.delete({ where: { id: t.id } });
      }
      await db.notificacao.deleteMany({ where: { texto: { contains: "Mensagem de teste da suíte V4/V7" } } });
      await db.mensagem.deleteMany({ where: { texto: "Mensagem de teste do polling incremental." } });
      await db.medicao.deleteMany({ where: { valor1: 71, tipo: "peso", criadoEm: { gte: new Date(Date.now() - 3_600_000) } } });
      await db.auditLog.deleteMany({ where: { OR: [{ detalhes: "teste delta" }, { usuarioNome: { contains: "Teste V4" } }] } });
      // Restaura o peso atual da Marina (66 kg) após o teste de sincronização
      await db.perfilPaciente.updateMany({ where: { user: { email: "marina.silva@email.com" } }, data: { peso: "66" } });
      console.log("limpeza concluída");
    } catch (e) {
      console.log("aviso na limpeza:", (e as Error).message);
    }
    await db.$disconnect();
  }

  console.log(`\n=== RESULTADO: ${aprovados} ✅ / ${falhas} ❌ ===\n`);
  if (falhas > 0) process.exit(1);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
