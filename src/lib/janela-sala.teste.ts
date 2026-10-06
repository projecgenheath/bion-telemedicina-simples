/**
 * Testes da janela da sala (lib/janela-sala.ts) — fonte única usada pela rota
 * da sala, pelo metricas.ts do médico e pela verificação de presença.
 * Rodar: bun --conditions=react-server src/lib/janela-sala.teste.ts
 */
import { estadoJanelaSala, janelaSala, SALA_ABRE_ANTES_MIN, SALA_FECHA_DEPOIS_MIN, salaAbertaEm } from "./janela-sala";
import { salaAberta } from "@/components/bion/medico/metricas";
import { CARENCIA_APOS_INICIO_MIN } from "@/lib/server/presenca-consulta";

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

const INI = Date.parse("2026-10-06T17:00:00.000Z"); // 14:00 SP
const m = (n: number) => INI + n * 60_000;
igual("constantes 30 / 120", [SALA_ABRE_ANTES_MIN, SALA_FECHA_DEPOIS_MIN], [30, 120]);
igual("janela", janelaSala(INI), { abreEm: m(-30), fechaEm: m(120) });
igual("31 min antes: antes", estadoJanelaSala(INI, m(-31)), "antes");
igual("30 min antes: aberta", estadoJanelaSala(INI, m(-30)), "aberta");
igual("2 h depois: aberta", estadoJanelaSala(INI, m(120)), "aberta");
igual("2h01 depois: fechada", estadoJanelaSala(INI, m(121)), "fechada");
igual("aceita Date", estadoJanelaSala(new Date(INI), new Date(m(10))), "aberta");
for (const t of [-31, -30, 0, 120, 121]) igual(`metricas.salaAberta igual à janela (${t})`, salaAberta(INI, m(t)), salaAbertaEm(INI, m(t)));
igual("carência da verificação = fechamento da sala", CARENCIA_APOS_INICIO_MIN, SALA_FECHA_DEPOIS_MIN);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
