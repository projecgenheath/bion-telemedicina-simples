/**
 * Testes do destino do "Ver minhas consultas" na tela de status do pagamento.
 * Rodar: bun src/components/bion/paciente/destino-status-pagamento.teste.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DESTINO_VER_CONSULTAS_PAGAMENTO, TELA_CONSULTAS_PACIENTE } from "./destino-status-pagamento";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

const url = new URL(DESTINO_VER_CONSULTAS_PAGAMENTO, "https://exemplo.test");
eq("destino exato", DESTINO_VER_CONSULTAS_PAGAMENTO, "/paciente?tela=consultas");
eq("caminho do app do paciente", url.pathname, "/paciente");
eq("tela = consultas", url.searchParams.get("tela"), "consultas");
eq("não usa a rota compartilhada /consultas", url.pathname === "/consultas", false);

const dir = join(import.meta.dir);
const tela = readFileSync(join(dir, "StatusPagamentoStripe.tsx"), "utf8");
eq("botão usa a constante", /href=\{DESTINO_VER_CONSULTAS_PAGAMENTO\}[\s\S]{0,200}Ver minhas consultas/.test(tela), true);
eq("nenhum href para /consultas na tela", /href="\/consultas"/.test(tela), false);

const app = readFileSync(join(dir, "PacienteApp.tsx"), "utf8");
eq("PacienteApp trata o deep link de consultas", app.includes("tela === TELA_CONSULTAS_PACIENTE"), true);
eq("constante da tela", TELA_CONSULTAS_PACIENTE, "consultas");

console.log(`destino-status-pagamento: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
