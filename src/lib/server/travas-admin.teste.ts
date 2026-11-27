/**
 * Travas de produção: classificação da chave, sem devolver o segredo.
 * Rodar: bun src/lib/server/travas-admin.teste.ts
 */
import { classeChaveStripe, estadoTravas } from "./travas-admin";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
function verdade(nome: string, cond: boolean) {
  if (cond) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}`);
  }
}

igual("sem chave", classeChaveStripe(undefined), "ausente");
igual("vazia", classeChaveStripe("  "), "ausente");
igual("teste sk", classeChaveStripe("sk_test_abc"), "teste");
igual("teste rk", classeChaveStripe("rk_test_abc"), "teste");
igual("live sk", classeChaveStripe("sk_live_abc"), "live");
igual("live rk", classeChaveStripe("rk_live_abc"), "live");
igual("outra", classeChaveStripe("pk_test_abc"), "outra");

const segredo = "sk_test_nao_pode_aparecer";
const cron = "cron_nao_pode_aparecer";
const papel = "service_role_nao_pode_aparecer";
const estado = estadoTravas({
  STRIPE_SECRET_KEY: segredo,
  STRIPE_MODO_COBRANCA: "",
  BION_PAGAMENTO_STRIPE: "true",
  CRON_SECRET: cron,
  SUPABASE_SERVICE_ROLE_KEY: papel,
});
igual("estado teste", estado, {
  classeChave: "teste",
  cobrancaLiveBloqueada: false,
  stripeLigado: true,
  modoCobranca: "padrao_plataforma",
  cronSecretConfigurado: true,
  comprovanteConfigurado: true,
});
const texto = JSON.stringify(estado);
verdade("não devolve a chave", !texto.includes(segredo) && !texto.includes("sk_test"));
verdade("não devolve o cron", !texto.includes(cron));
verdade("não devolve a service role", !texto.includes(papel));

igual(
  "live bloqueia mesmo com stripe desligado",
  estadoTravas({ STRIPE_SECRET_KEY: "sk_live_x", BION_PAGAMENTO_STRIPE: "false" }).cobrancaLiveBloqueada,
  true,
);
igual("modo desconhecido", estadoTravas({ STRIPE_MODO_COBRANCA: "pix" }).modoCobranca, "nao_reconhecido");
igual("modo direta", estadoTravas({ STRIPE_MODO_COBRANCA: "Direta" }).modoCobranca, "direta");
igual("sem stripe ligado", estadoTravas({ BION_PAGAMENTO_STRIPE: "true" }).stripeLigado, false);

console.log(`travas-admin: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
