/** Rodar: bun src/lib/medico-cobravel.teste.ts */
import { contaStripeDoMedico, limparCacheContas, medicoPodeSerCobrado, type StatusConta } from "./medico-cobravel";

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

let leituras = 0;
const contas: Record<string, StatusConta | null> = {
  acct_ok: { chargesEnabled: true, payoutsEnabled: true },
  acct_sem_cobranca: { chargesEnabled: false, payoutsEnabled: true },
  acct_sem_saque: { chargesEnabled: true, payoutsEnabled: false },
};
const ler = async (c: string) => { leituras++; return contas[c] ?? null; };

(async () => {
  limparCacheContas();
  igual("direta, conta pronta: cobrável", await medicoPodeSerCobrado("direta", "acct_ok", { ler, agora: 0 }), true);
  igual("direta, sem charges_enabled: não", await medicoPodeSerCobrado("direta", "acct_sem_cobranca", { ler, agora: 0 }), false);
  igual("direta, sem payouts_enabled: não", await medicoPodeSerCobrado("direta", "acct_sem_saque", { ler, agora: 0 }), false);
  igual("direta, conta ilegível: não", await medicoPodeSerCobrado("direta", "acct_x", { ler, agora: 0 }), false);
  igual("direta sem conta: não", await medicoPodeSerCobrado("direta", null, { ler }), false);
  igual("direta conta só espaços: não", await medicoPodeSerCobrado("direta", "  ", { ler }), false);
  igual("destino sem conta: não", await medicoPodeSerCobrado("destino", undefined, { ler }), false);
  igual("plataforma não exige conta", await medicoPodeSerCobrado("plataforma", null, { ler }), true);
  const antes = leituras;
  await medicoPodeSerCobrado("direta", "acct_ok", { ler, agora: 30_000 });
  igual("cache de 60 s evita nova leitura", leituras, antes);
  contas.acct_ok = { chargesEnabled: false, payoutsEnabled: true };
  igual("depois de 60 s relê no Stripe", await medicoPodeSerCobrado("direta", "acct_ok", { ler, agora: 61_000 }), false);
  igual("conta é aparada", contaStripeDoMedico(" acct_9 "), "acct_9");
  if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
  console.log("todos os testes passaram");
})();
