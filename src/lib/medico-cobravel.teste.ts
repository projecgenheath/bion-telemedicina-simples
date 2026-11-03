/** Rodar: bun src/lib/medico-cobravel.teste.ts */
import { contaStripeDoMedico, medicoPodeSerCobrado } from "./medico-cobravel";

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

igual("direta com conta Stripe: cobrável", medicoPodeSerCobrado("direta", "acct_123"), true);
igual("direta sem conta Stripe: não cobrável", medicoPodeSerCobrado("direta", null), false);
igual("direta com conta vazia/espaços: não cobrável", medicoPodeSerCobrado("direta", "  "), false);
igual("destino sem conta: não cobrável", medicoPodeSerCobrado("destino", undefined), false);
igual("plataforma não exige conta do médico", medicoPodeSerCobrado("plataforma", null), true);
igual("conta é aparada", contaStripeDoMedico(" acct_9 "), "acct_9");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("todos os testes passaram");
