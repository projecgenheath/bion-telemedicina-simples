/**
 * A tela de travas não pode mentir sobre o vercel.json.
 * Se alguém colocar `crons` no arquivo, este teste quebra até a constante
 * e o texto da tela acompanharem. Não liga cron.
 * Rodar: bun src/components/bion/admin/travas/agenda.teste.ts
 */
import { readFileSync } from "node:fs";
import { TAREFAS_AGENDA, VERCEL_JSON_TEM_CRONS } from "./agenda";

const json = JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as { crons?: unknown };
const tem = Object.prototype.hasOwnProperty.call(json, "crons");

if (tem !== VERCEL_JSON_TEM_CRONS) {
  console.error(`✗ vercel.json crons=${tem} mas VERCEL_JSON_TEM_CRONS=${VERCEL_JSON_TEM_CRONS}`);
  process.exit(1);
}
if (TAREFAS_AGENDA.length !== 7) {
  console.error(`✗ agenda deveria listar 7 rotas, veio ${TAREFAS_AGENDA.length}`);
  process.exit(1);
}
const rotas = TAREFAS_AGENDA.map((t) => t.rota).join(",");
const esperadas = "/api/cron/toque,/api/cron/lembretes,/api/cron/espera-medico,/api/cron/fechar-repasses,/api/cron/descarte-retencao,/api/cron/lgpd-pendencias,/api/cron/reembolsos-stripe";
if (rotas !== esperadas) {
  console.error(`✗ rotas\n   obtido: ${rotas}`);
  process.exit(1);
}
const fechar = TAREFAS_AGENDA.find((t) => t.rota === "/api/cron/fechar-repasses");
if (!fechar || /descreve cron da Vercel às 23:30/.test(fechar.onde) || !/desligado/.test(fechar.onde) || !/Stripe/.test(fechar.onde)) {
  console.error("✗ a tela não pode dizer que o código ainda fecha PIX às 23:30");
  process.exit(1);
}
console.log("agenda: ok");
