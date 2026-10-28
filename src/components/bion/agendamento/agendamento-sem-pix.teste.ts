/* Agendamento normal só com cartão (checkout Stripe), nunca Pix. bun run <arquivo> */
import { readFileSync } from "node:fs";
import { decisaoCobranca } from "@/lib/stripe-checkout-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, real: unknown, esperado: unknown) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHA ${nome}: ${JSON.stringify(real)} != ${JSON.stringify(esperado)}`);
  }
}
const ler = (r: string) => readFileSync(new URL(r, import.meta.url), "utf8");

// decisão (a mesma da renovação/remarcação)
igual("flag ligada → stripe", decisaoCobranca(true, "webhook"), "stripe");
igual("flag desligada + simulado → confirma na hora", decisaoCobranca(false, "simulado"), "simulado");
igual("flag desligada + gateway real → indisponível", decisaoCobranca(false, "webhook"), "indisponivel");
igual("flag desligada + pendente → indisponível", decisaoCobranca(false, "pendente"), "indisponivel");

const rota = ler("../../../app/api/consultas/route.ts");
igual("rota não cobra por Pix", /"pix"/.test(rota), false);
igual("rota cria cobrança com cartão", rota.includes('criarCobranca(consulta.id, consulta.valor, "cartao")'), true);
igual("rota ignora metodo do cliente", /body\.metodo/.test(rota), false);
igual(
  "503 antes de criar a consulta (não retorno)",
  /decisao === "indisponivel" && !origemRetorno\)[\s\S]*?respostaIndisponivel\(\)[\s\S]*?db\.\$transaction/.test(rota),
  true,
);
igual(
  "retorno pago sem cartão desfaz a transação antes do create",
  /!gratis && decisao === "indisponivel"\) throw new PagamentoIndisponivel\(\)[\s\S]*?t\.consulta\.create/.test(rota),
  true,
);
igual("PagamentoIndisponivel vira 503", /instanceof PagamentoIndisponivel\)[\s\S]*?respostaIndisponivel\(\)/.test(rota), true);
igual("simulado confirma na hora", rota.includes('cobranca && decisao === "simulado"'), true);
igual("devolve pagarComCartao", rota.includes('pagarComCartao: decisao === "stripe" && !pagoFinal'), true);

const passo = ler("./passos/PassoPagamento.tsx");
const fluxo = ler("../AgendamentoFluxo.tsx");
const tipos = ler("./types.ts");
const chat = ler("../paciente/ChatBion.tsx");
igual("passo sem Pix/QR/boleto", /QrCode|br\.gov\.bcb\.pix|Boleto|copiarChavePix/.test(passo), false);
igual("passo não coleta número de cartão", /cc-number|cc-csc/.test(passo), false);
igual("tipos sem pix", /pix/i.test(tipos), false);
igual("fluxo sem chave Pix", /pix/i.test(fluxo), false);
igual("fluxo abre checkout com consultaId", fluxo.includes("abrirCheckoutStripe({ consultaId: criada.id })"), true);
igual("chat sem botão Pix", /id: "pix"|metodo === "pix"/.test(chat), false);
igual("chat abre checkout quando pagarComCartao", /json\.pagarComCartao === true\)[\s\S]*?abrirCheckoutStripe\(\{ consultaId/.test(chat), true);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
