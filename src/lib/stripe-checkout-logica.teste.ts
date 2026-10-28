/**
 * Testes do checkout Stripe do paciente (lib/stripe-checkout-logica.ts).
 * Rodar: bun src/lib/stripe-checkout-logica.teste.ts
 */
import { readFileSync } from "fs";
import {
  acaoDoEvento,
  avaliarElegibilidade,
  bloqueioChaveLive,
  chaveIdempotencia,
  metodosCheckout,
  divisaoConnect,
  moedaCheckout,
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
igual("outro", acaoDoEvento("customer.created"), "ignorar");
igual("valor confere", valorConfere(15000, 150), true);
igual("valor diverge", valorConfere(100, 150), false);
igual("valor nulo", valorConfere(null, 150), false);

// guardas estáticas das rotas
const checkout = readFileSync(new URL("../app/api/pagamentos/stripe/checkout/route.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../app/api/pagamentos/stripe/webhook/route.ts", import.meta.url), "utf8");
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
igual("webhook usa corpo bruto", webhook.includes("await req.text()"), true);
igual("webhook idempotente por evento", webhook.includes("jaProcessado(evento.id)"), true);
igual("webhook usa confirmarPagamento", webhook.includes("confirmarPagamento(pagamento.id, \"webhook\")"), true);
igual("webhook aceita evento Connect", webhook.includes("evento.account"), true);
igual("webhook grava taxa", webhook.includes("stripeTaxaCentavos"), true);
igual("webhook não grava id do Stripe no gatewayRef", /gatewayRef\s*:\s*(s\.|sessao|paymentIntent|cobranca)/.test(webhook + checkout), false);
igual("tela de volta não marca pago", /method:\s*"(POST|PATCH)"/.test(sucesso), false);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
