/**
 * Testes do checkout Stripe do paciente (lib/stripe-checkout-logica.ts).
 * Rodar: bun src/lib/stripe-checkout-logica.teste.ts
 */
import { readFileSync } from "fs";
import {
  acaoDoEvento,
  avaliarElegibilidade,
  avaliarMulta,
  avaliarPagamentoAvulso,
  decisaoCobranca,
  expiracaoReservaSeg,
  multaDaSessao,
  referenciaCliente,
  referenciaConfere,
  respostaIndisponivel,
  tipoPorGatewayRef,
  type PagamentoAvulso,
  bloqueioChaveLive,
  chaveIdempotencia,
  metodosCheckout,
  divisaoConnect,
  sessaoDaMulta,
  moedaCheckout,
  moedaConfere,
  opcoesRequisicao,
  parametrosSessao,
  sessaoReaproveitavel,
  stripeAtivo,
  valorConfere,
  type ConsultaParaCheckout,
} from "./stripe-checkout-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

// flag
igual("flag desligada", stripeAtivo({}), false);
igual("flag sem chave", stripeAtivo({ BION_PAGAMENTO_STRIPE: "true" }), false);
igual("flag ligada", stripeAtivo({ BION_PAGAMENTO_STRIPE: "true", STRIPE_SECRET_KEY: "x" }), true);
igual("flag '1' não liga", stripeAtivo({ BION_PAGAMENTO_STRIPE: "1", STRIPE_SECRET_KEY: "x" }), false);

// moeda e métodos
igual("moeda padrão brl", moedaCheckout({}), "brl");
igual("moeda usd", moedaCheckout({ STRIPE_MOEDA: "USD" }), "usd");
igual("moeda inválida", moedaCheckout({ STRIPE_MOEDA: "reais" }), "brl");
igual("só cartão, sem Pix (Stripe proíbe Pix em telemedicina)", metodosCheckout(), ["card"]);

// elegibilidade
const base: ConsultaParaCheckout = {
  id: "c1", pacienteId: "p1", status: "em_espera", pago: false, valor: 150, tipoAtendimento: "padrao",
  pagamento: { id: "pg1", status: "pendente", gatewayRef: null },
};
igual("ok valor do banco", avaliarElegibilidade(base, "p1"), { ok: true, valorCentavos: 15000 });
igual("centavos arredondados", avaliarElegibilidade({ ...base, valor: 99.9 }, "p1"), { ok: true, valorCentavos: 9990 });
igual("não encontrada", avaliarElegibilidade(null, "p1").ok, false);
igual("outro paciente 403", (avaliarElegibilidade(base, "p2") as { status: number }).status, 403);
igual("retorno grátis 409", (avaliarElegibilidade({ ...base, tipoAtendimento: "retorno", valor: 0, status: "confirmada", pago: true }, "p1") as { erro: string }).erro, "Retorno grátis não tem cobrança.");
igual("já paga", avaliarElegibilidade({ ...base, pago: true }, "p1").ok, false);
igual("pagamento confirmado", avaliarElegibilidade({ ...base, pagamento: { id: "pg1", status: "confirmado", gatewayRef: null } }, "p1").ok, false);
igual("cancelada", avaliarElegibilidade({ ...base, status: "cancelada" }, "p1").ok, false);
igual("concluída", avaliarElegibilidade({ ...base, status: "concluida" }, "p1").ok, false);
igual("valor zero", avaliarElegibilidade({ ...base, valor: 0 }, "p1").ok, false);
igual("falhou pode tentar de novo", avaliarElegibilidade({ ...base, pagamento: { id: "pg1", status: "falhou", gatewayRef: null } }, "p1").ok, true);
igual("sem cobrança ainda", avaliarElegibilidade({ ...base, pagamento: null }, "p1").ok, true);
igual("espera do médico fica no fluxo atual", avaliarElegibilidade({ ...base, pagamento: { id: "pg1", status: "pendente", gatewayRef: "espera:e1" } }, "p1").ok, false);

// idempotência
igual("mesma chave sem sessão", chaveIdempotencia("c1", 15000, null), chaveIdempotencia("c1", 15000, null));
igual("chave muda com sessão anterior", chaveIdempotencia("c1", 15000, null) === chaveIdempotencia("c1", 15000, "cs_test_abc"), false);
igual("chave muda com valor", chaveIdempotencia("c1", 15000, null) === chaveIdempotencia("c1", 16000, null), false);

// parâmetros da sessão
const p = parametrosSessao({
  consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1", valorCentavos: 15000, moeda: "usd",
  metodos: ["card"], descricao: "Teleconsulta", baseUrl: "https://app.exemplo/", email: "a@b.c",
});
igual("modo payment", p.mode, "payment");
igual("client_reference_id", p.client_reference_id, "c1");
igual("metadata", p.metadata, { consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1" });
igual("valor", p.line_items[0].price_data.unit_amount, 15000);
igual("moeda", p.line_items[0].price_data.currency, "usd");
igual("metadata no PaymentIntent", p.payment_intent_data.metadata.consultaId, "c1");
igual("sem application_fee", "application_fee_amount" in p.payment_intent_data, false);
igual("sem transfer_data", "transfer_data" in p.payment_intent_data, false);
igual("success_url", p.success_url, "https://app.exemplo/pagamento/sucesso?consulta=c1");
igual("cancel_url", p.cancel_url, "https://app.exemplo/pagamento/cancelado?consulta=c1");

// modo de cobrança
igual("live + plataforma bloqueia", bloqueioChaveLive("plataforma", "sk_live_x"), true);
igual("teste + plataforma passa", bloqueioChaveLive("plataforma", "sk_test_x"), false);
igual("live + direta passa", bloqueioChaveLive("direta", "sk_live_x"), false);
igual("live + destino passa", bloqueioChaveLive("destino", "sk_live_x"), false);
igual("sem chave passa (rota já recusa pela flag)", bloqueioChaveLive("plataforma", undefined), false);
const cx = { contaMedico: "acct_123", taxaPlataformaCentavos: 1500 };
igual("plataforma sem divisão", divisaoConnect({ modo: "plataforma", connect: cx, valorCentavos: 15000 }), {});
igual("destino", divisaoConnect({ modo: "destino", connect: cx, valorCentavos: 15000 }), {
  application_fee_amount: 1500, on_behalf_of: "acct_123", transfer_data: { destination: "acct_123" },
});
igual("direta", divisaoConnect({ modo: "direta", connect: cx, valorCentavos: 15000 }), { application_fee_amount: 1500 });
igual("header só na direta", opcoesRequisicao({ modo: "direta", connect: cx }), { stripeAccount: "acct_123" });
igual("sem header no destino", opcoesRequisicao({ modo: "destino", connect: cx }), {});
igual("sem header na plataforma", opcoesRequisicao({ modo: "plataforma", connect: null }), {});
let erroSemConta = false;
try { divisaoConnect({ modo: "destino", connect: null, valorCentavos: 15000 }); } catch { erroSemConta = true; }
igual("destino sem conta recusa", erroSemConta, true);
let erroTaxa = false;
try { divisaoConnect({ modo: "direta", connect: { ...cx, taxaPlataformaCentavos: 20000 }, valorCentavos: 15000 }); } catch { erroTaxa = true; }
igual("comissão maior que o valor recusa", erroTaxa, true);
const pd = parametrosSessao({ consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1", valorCentavos: 15000, moeda: "brl", metodos: ["card"], descricao: "T", baseUrl: "https://a", modo: "destino", connect: cx });
igual("sessão destino leva divisão", pd.payment_intent_data, { metadata: { consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1" }, application_fee_amount: 1500, on_behalf_of: "acct_123", transfer_data: { destination: "acct_123" } });

// reaproveitar sessão
const agora = 1_000_000;
const s = { status: "open", valorCentavos: 15000, expiraEmSeg: agora + 3600, url: "https://checkout" };
igual("reaproveita aberta", sessaoReaproveitavel(s, 15000, agora), true);
igual("não reaproveita expirada", sessaoReaproveitavel({ ...s, status: "expired" }, 15000, agora), false);
igual("não reaproveita valor diferente", sessaoReaproveitavel(s, 16000, agora), false);
igual("não reaproveita quase expirando", sessaoReaproveitavel({ ...s, expiraEmSeg: agora + 60 }, 15000, agora), false);
igual("nula", sessaoReaproveitavel(null, 15000, agora), false);

// eventos
igual("completed paid", acaoDoEvento("checkout.session.completed", "paid"), "confirmar");
igual("completed unpaid (pix)", acaoDoEvento("checkout.session.completed", "unpaid"), "aguardar");
igual("async ok", acaoDoEvento("checkout.session.async_payment_succeeded"), "confirmar");
igual("async falhou", acaoDoEvento("checkout.session.async_payment_failed"), "falhar");
igual("expirada", acaoDoEvento("checkout.session.expired"), "expirar");
igual("charge.refunded", acaoDoEvento("charge.refunded"), "reembolso");
igual("refund.updated", acaoDoEvento("refund.updated"), "reembolso");
igual("refund.failed", acaoDoEvento("refund.failed"), "reembolso");
igual("charge.updated", acaoDoEvento("charge.updated"), "taxa");
igual("outro", acaoDoEvento("customer.created"), "ignorar");
igual("valor confere", valorConfere(15000, 150), true);
igual("moeda confere", moedaConfere("BRL", "brl"), true);
igual("moeda diverge", moedaConfere("usd", "brl"), false);
igual("moeda nula", moedaConfere(null, "brl"), false);
igual("refund.created", acaoDoEvento("refund.created"), "reembolso");
igual("valor diverge", valorConfere(100, 150), false);
igual("valor nulo", valorConfere(null, 150), false);

// guardas estáticas das rotas
const checkout = readFileSync(new URL("../app/api/pagamentos/stripe/checkout/route.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../app/api/pagamentos/stripe/webhook/route.ts", import.meta.url), "utf8");
const pagamentosTs = readFileSync(new URL("./server/pagamentos.ts", import.meta.url), "utf8");
const sucesso = readFileSync(new URL("../components/bion/paciente/StatusPagamentoStripe.tsx", import.meta.url), "utf8");
igual("checkout não confirma pagamento", /confirmarPagamento/.test(checkout), false);
igual("checkout lê valor do banco, não do body", /body\.(valor|amount)/.test(checkout), false);
igual("checkout exige aceite", checkout.includes("aceiteVigentePendente"), true);
igual("checkout recusa live em plataforma com 503", /bloqueioChaveLive\(modo\)[\s\S]*?pagamento_indisponivel[\s\S]*?status: 503/.test(checkout), true);
igual("checkout sem pix", /"pix"/.test(checkout), false);
igual("checkout reusa o modo do Admin", checkout.includes("stripeConnectAtivo() ? modoCobrancaStripe()"), true);
igual("checkout atrás da flag", checkout.includes("stripeAtivo()"), true);
igual("webhook confere assinatura", webhook.includes("constructEvent(corpo"), true);
igual("webhook aceita segredo Connect", webhook.includes("STRIPE_CONNECT_WEBHOOK_SECRET"), true);
igual("webhook reivindica o evento antes de processar", /reivindicarEvento\(evento\.id[\s\S]*?processar\(evento\)/.test(webhook), true);
igual("não usa jaProcessado/marcarEvento (deprecated)", /jaProcessado|marcarEvento/.test(webhook), false);
igual("falha libera o evento e devolve 500", /liberarEvento\(evento\.id\)[\s\S]*?status: 500/.test(webhook), true);
igual("webhook usa a confirmação condicional", webhook.includes('confirmarPagamentoSeMudou(pagamento.id, "webhook")'), true);
igual("notificação/auditoria só se esta chamada confirmou", /if \(!mudou\) return[\s\S]*?notificacao\.create[\s\S]*?PAGAMENTO_CONFIRMADO/.test(webhook), true);
igual("chargeId só com valor e só se vazio", /if \(cobranca\.chargeId\)[\s\S]*?stripeChargeId: null \}/.test(webhook), true);
igual("nenhum null gravado direto por cima de id/taxa", /data: \{[^}]*(stripeChargeId|stripeTaxaCentavos|stripePaymentIntentId): (cobranca|paymentIntentId)/.test(webhook.replace(/updateMany\([^;]*;/g, "")), false);
igual("paymentIntent só se vazio", webhook.includes("stripePaymentIntentId: null }"), true);
igual("confere moeda", webhook.includes("moedaConfere(s.currency"), true);
igual("webhook usa corpo bruto", webhook.includes("await req.text()"), true);
igual("taxa nunca sobrescreve", webhook.includes("where: { id: pagamentoId, stripeTaxaCentavos: null }"), true);
igual("confirmar não grava taxa direto", /stripeTaxaCentavos: cobranca/.test(webhook), false);
igual("charge.updated usa a conta Connect", /lerTaxa\([^)]*conta\)/.test(webhook), true);
igual("webhook aceita evento Connect", webhook.includes("evento.account"), true);
igual("webhook grava taxa", webhook.includes("stripeTaxaCentavos"), true);
igual("webhook não grava id do Stripe no gatewayRef", /gatewayRef\s*:\s*(s\.|sessao|paymentIntent|cobranca)/.test(webhook + checkout), false);
igual("tela de volta não marca pago", /method:\s*"(POST|PATCH)"/.test(sucesso), false);

igual("confirmação condicional (count === 1)", /updateMany\(\{\s*where: \{ id: p\.id, status: \{ not: "confirmado" \} \}[\s\S]*?r\.count !== 1\) return false/.test(pagamentosTs), true);
igual("confirmarPagamento delega", pagamentosTs.includes("(await confirmarPagamentoSeMudou(pagamentoId, via)).pagamento"), true);


// ---- cobranças só com cartão: renovação, diferença da espera, multa ----
igual("tipo consulta", tipoPorGatewayRef(null), "consulta");
igual("tipo renovação", tipoPorGatewayRef("renovacao:r1"), "renovacao");
igual("tipo espera", tipoPorGatewayRef("espera:e1"), "espera");
igual("tipo desconhecido", tipoPorGatewayRef("outra"), null);

const T = 1_000_000_000;
const ren: PagamentoAvulso = { id: "pg9", status: "pendente", valor: 150, gatewayRef: "renovacao:r1", pedidoRenovacao: { pacienteId: "p1", status: "aguardando_pagamento" }, consulta: null, espera: null };
igual("renovação ok", avaliarPagamentoAvulso(ren, "p1", T), { ok: true, valorCentavos: 15000, tipo: "renovacao" });
igual("renovação outro paciente 403", (avaliarPagamentoAvulso(ren, "p2", T) as { status: number }).status, 403);
igual("renovação já paga", avaliarPagamentoAvulso({ ...ren, status: "confirmado" }, "p1", T).ok, false);
igual("renovação pedido já pendente (pago)", avaliarPagamentoAvulso({ ...ren, pedidoRenovacao: { pacienteId: "p1", status: "pendente" } }, "p1", T).ok, false);
igual("renovação cancelada", avaliarPagamentoAvulso({ ...ren, pedidoRenovacao: { pacienteId: "p1", status: "cancelado" } }, "p1", T).ok, false);
igual("renovação sem pedido 404", (avaliarPagamentoAvulso({ ...ren, pedidoRenovacao: null }, "p1", T) as { status: number }).status, 404);
igual("renovação valor zero", avaliarPagamentoAvulso({ ...ren, valor: 0 }, "p1", T).ok, false);
igual("nula 404", (avaliarPagamentoAvulso(null, "p1", T) as { status: number }).status, 404);
igual("pagamento de consulta comum não é avulso", avaliarPagamentoAvulso({ ...ren, gatewayRef: null }, "p1", T).ok, false);

const esp: PagamentoAvulso = { id: "pg8", status: "pendente", valor: 50, gatewayRef: "espera:e1", pedidoRenovacao: null, consulta: { pacienteId: "p1", status: "em_espera" }, espera: { status: "remarcando", reservaExpiraEmMs: T + 60_000 } };
igual("espera ok", avaliarPagamentoAvulso(esp, "p1", T), { ok: true, valorCentavos: 5000, tipo: "espera" });
igual("espera outro paciente", (avaliarPagamentoAvulso(esp, "p2", T) as { status: number }).status, 403);
igual("espera reserva vencida", avaliarPagamentoAvulso(esp, "p1", T + 61_000).ok, false);
igual("espera não remarcando", avaliarPagamentoAvulso({ ...esp, espera: { status: "expirada", reservaExpiraEmMs: null } }, "p1", T).ok, false);
igual("espera de outra consulta nova (null)", avaliarPagamentoAvulso({ ...esp, espera: null }, "p1", T).ok, false);
igual("espera pagamento falhou (reserva liberada)", avaliarPagamentoAvulso({ ...esp, status: "falhou" }, "p1", T).ok, false);

const multa = { id: "rm1", status: "pendente", multaCentavos: 3000, expiraEmMs: T + 60_000, consulta: { pacienteId: "p1" } };
igual("multa ok", avaliarMulta(multa, "p1", T), { ok: true, valorCentavos: 3000 });
igual("multa outro paciente", (avaliarMulta(multa, "p2", T) as { status: number }).status, 403);
igual("multa vencida", avaliarMulta(multa, "p1", T + 60_000).ok, false);
igual("multa aprovada", avaliarMulta({ ...multa, status: "aprovada" }, "p1", T).ok, false);
igual("multa zero", avaliarMulta({ ...multa, multaCentavos: 0 }, "p1", T).ok, false);
igual("multa nula", avaliarMulta(null, "p1", T).ok, false);

igual("flag ligada → stripe", decisaoCobranca(true, "webhook"), "stripe");
igual("flag ligada no simulado → stripe", decisaoCobranca(true, "simulado"), "stripe");
igual("flag desligada demo → simulado", decisaoCobranca(false, "simulado"), "simulado");
igual("flag desligada com gateway real → indisponível", decisaoCobranca(false, "webhook"), "indisponivel");
igual("flag desligada em produção sem gateway → indisponível", decisaoCobranca(false, "pendente"), "indisponivel");
igual("503 pagamento_indisponivel", respostaIndisponivel(), { corpo: { erro: "Pagamento online indisponível no momento.", codigo: "pagamento_indisponivel" }, status: 503 });

const pRen = parametrosSessao({ consultaId: null, pacienteId: "p1", pagamentoId: "pg9", tipo: "renovacao", valorCentavos: 15000, moeda: "brl", metodos: metodosCheckout(), descricao: "R", baseUrl: "https://a/" });
igual("renovação: ref pagamento", pRen.client_reference_id, "pagamento:pg9");
igual("renovação: metadata sem consulta", pRen.metadata, { pacienteId: "p1", pagamentoId: "pg9", tipo: "renovacao" });
igual("renovação: só cartão", pRen.payment_method_types, ["card"]);
igual("renovação: volta com tipo", pRen.success_url, "https://a/pagamento/sucesso?tipo=renovacao");
const pMul = parametrosSessao({ consultaId: null, pacienteId: "p1", pagamentoId: null, tipo: "multa", remarcacaoId: "rm1", expiraEmSeg: 123, valorCentavos: 3000, moeda: "brl", metodos: ["card"], descricao: "M", baseUrl: "https://a" });
igual("multa: ref", pMul.client_reference_id, "multa:rm1");
igual("multa: metadata", pMul.metadata, { pacienteId: "p1", tipo: "multa", remarcacaoId: "rm1" });
igual("multa: expira", (pMul as { expires_at?: number }).expires_at, 123);
igual("multa da sessão", multaDaSessao(pMul.metadata), "rm1");
igual("consulta não é multa", multaDaSessao({ consultaId: "c1" }), null);
const pEsp = parametrosSessao({ consultaId: "cn1", pacienteId: "p1", pagamentoId: "pg8", tipo: "espera", valorCentavos: 5000, moeda: "brl", metodos: ["card"], descricao: "E", baseUrl: "https://a" });
igual("espera: ref é a consulta nova", pEsp.client_reference_id, "cn1");
igual("espera: volta acompanha a consulta nova", pEsp.success_url, "https://a/pagamento/sucesso?consulta=cn1");
igual("consulta sem tipo no metadata (igual ao #119)", parametrosSessao({ consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1", valorCentavos: 1, moeda: "brl", metodos: ["card"], descricao: "T", baseUrl: "https://a" }).metadata, { consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1" });
igual("consulta sem expires_at", "expires_at" in parametrosSessao({ consultaId: "c1", pacienteId: "p1", pagamentoId: "pg1", valorCentavos: 1, moeda: "brl", metodos: ["card"], descricao: "T", baseUrl: "https://a" }), false);
igual("ref consulta", referenciaCliente({ consultaId: "c1", pagamentoId: "pg1" }), "c1");
igual("ref confere consulta", referenciaConfere("c1", { id: "pg1", consultaId: "c1" }), true);
igual("ref confere renovação", referenciaConfere("pagamento:pg9", { id: "pg9", consultaId: null }), true);
igual("ref de outro pagamento não confere", referenciaConfere("pagamento:pgX", { id: "pg9", consultaId: null }), false);
igual("ref de consulta não serve para renovação", referenciaConfere("c1", { id: "pg9", consultaId: null }), false);
igual("expiração da reserva ≥ 30 min (mínimo do Stripe)", expiracaoReservaSeg(T * 1000) - T >= 30 * 60, true);

// guardas estáticas: nenhuma cobrança nova por Pix
const ler = (r: string) => readFileSync(new URL(r, import.meta.url), "utf8");
const renovPag = ler("./server/renovacao-pagamento.ts");
const renovRota = ler("../app/api/renovacoes/route.ts");
const remRota = ler("../app/api/consultas/[id]/remarcacao/route.ts");
const esperaTs = ler("./server/espera-medico.ts");
igual("renovação cobra cartão", /metodo: "pix"/.test(renovPag) || !/metodo: "cartao"/.test(renovPag), false);
igual("renovação sem pixCopiaECola", /pixCopiaECola|qrCodeBase64/.test(renovRota), false);
igual("renovação 503 com a flag desligada", /decisao === "indisponivel"[\s\S]*?respostaIndisponivel\(\)[\s\S]*?criarCobrancaRenovacao\(/.test(renovRota), true);
igual("remarcação sem pix", /"pix"/.test(remRota), false);
igual("remarcação 503 antes de reservar", /decisao === "indisponivel"[\s\S]*?respostaIndisponivel\(\)[\s\S]*?remarcacaoPendente\.create/.test(remRota), true);
igual("espera sem pix", /metodo: "pix"|pixCopiaECola/.test(esperaTs), false);
igual("espera 503 antes de criar a consulta nova", /"indisponivel"\) \{\s*return falhar\(503, "pagamento_indisponivel"[\s\S]*?consulta\.create/.test(esperaTs), true);
igual("checkout aceita pagamentoId e remarcacaoId", /body\.remarcacaoId[\s\S]*?body\.pagamentoId/.test(checkout), true);
igual("webhook confirma renovação", webhook.includes("confirmarPagamentoRenovacao(pagamentoId, tx)"), true);
igual("webhook cancela renovação falha", webhook.includes("cancelarRenovacaoPagamentoFalhou(p.id, tx)"), true);
igual("webhook troca a consulta da espera", webhook.includes("confirmarRemarcacaoEspera(pagamentoId)"), true);
igual("webhook aplica a multa", /aprovarMultaRemarcacao\(r\.id, "webhook"/.test(webhook), true);
igual("webhook confere valor da multa", /valorConfere\(s\.amount_total, r\.multaCentavos \/ 100\)/.test(webhook), true);

// ---- 2º clique na multa reaproveita a sessão aberta ----
igual("sessão da multa", sessaoDaMulta("stripe_cs:cs_123"), "cs_123");
igual("stripe_pi não é sessão", sessaoDaMulta("stripe_pi:pi_1"), null);
igual("sem ref", sessaoDaMulta(null), null);
igual("checkout guarda a sessão da multa", /gatewayRef: `\$\{PREFIXO_SESSAO_MULTA\}\$\{sessao\.id\}`/.test(checkout), true);
igual("checkout lê a sessão anterior da multa", /a\.tipo === "multa" \? a\.sessaoMulta/.test(checkout), true);

igual("pagamento Pix pendente reaproveitado vira cartão", /stripeCheckoutSessionId: sessao\.id, metodo: "cartao"/.test(checkout), true);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
