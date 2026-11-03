/** Rodar: bun src/lib/medico-cobravel.teste.ts */
import { contaStripeDoMedico, medicoPodeSerCobrado, type StatusConta } from "./medico-cobravel";

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
  igual("direta, conta pronta: cobrável", await medicoPodeSerCobrado("direta", "acct_ok", { ler }), true);
  igual("direta, sem charges_enabled: não", await medicoPodeSerCobrado("direta", "acct_sem_cobranca", { ler }), false);
  igual("direta, sem payouts_enabled: não", await medicoPodeSerCobrado("direta", "acct_sem_saque", { ler }), false);
  igual("direta, conta ilegível: não", await medicoPodeSerCobrado("direta", "acct_x", { ler }), false);
  igual("direta sem conta: não", await medicoPodeSerCobrado("direta", null, { ler }), false);
  igual("direta conta só espaços: não", await medicoPodeSerCobrado("direta", "  ", { ler }), false);
  igual("destino sem conta: não", await medicoPodeSerCobrado("destino", undefined, { ler }), false);
  igual("plataforma não exige conta", await medicoPodeSerCobrado("plataforma", null, { ler }), true);
  const antes = leituras;
  contas.acct_ok = { chargesEnabled: false, payoutsEnabled: true };
  igual("status gravado lido a cada chamada (sem cache)", await medicoPodeSerCobrado("direta", "acct_ok", { ler }), false);
  igual("uma leitura por chamada", leituras, antes + 1);
  igual("conta é aparada", contaStripeDoMedico(" acct_9 "), "acct_9");
  if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
  console.log("todos os testes passaram");
})();
