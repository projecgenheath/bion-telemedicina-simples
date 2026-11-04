/**
 * Testes da contagem regressiva da próxima consulta (paciente).
 * Rodar: bun src/components/bion/paciente/contagem-consulta.teste.ts
 *
 * Os instantes são montados em UTC a partir do horário de parede de
 * São Paulo (UTC-3, sem horário de verão): 23:00 SP = 02:00Z do dia seguinte.
 */
import { contagemConsulta } from "./contagem-consulta";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`);
  }
}

const sp = (dia: number, h: number, min = 0) => Date.UTC(2026, 10, dia, h + 3, min);

// Já começou / acontecendo
igual("passou", contagemConsulta(sp(4, 9), sp(4, 10)).texto, "Acontecendo agora");
// Menos de 1 h: minutos, urgente
igual("em 30 min", contagemConsulta(sp(4, 9, 30), sp(4, 9)), { texto: "Começa em 30 min", urgente: true, agora: false });
// Hoje, em horas
igual("hoje em 3 h", contagemConsulta(sp(4, 12), sp(4, 9)).texto, "Hoje, em 3 h");
igual("hoje em 1 h 30", contagemConsulta(sp(4, 10, 30), sp(4, 9)).texto, "Hoje, em 1 h 30 min");
// A5: amanhã no calendário, mas a menos de 3 h → horas/minutos, não "Amanhã"
igual("23:00 → 00:30 (90 min)", contagemConsulta(sp(5, 0, 30), sp(4, 23)).texto, "Em 1 h 30 min");
igual("22:00 → 00:00 (2 h)", contagemConsulta(sp(5, 0), sp(4, 22)).texto, "Em 2 h");
igual("21:30 → 00:15 (2 h 45)", contagemConsulta(sp(5, 0, 15), sp(4, 21, 30)).texto, "Em 2 h 45 min");
// Amanhã de verdade (≥ 3 h, dia seguinte)
igual("amanhã longe", contagemConsulta(sp(5, 14), sp(4, 23)).texto, "Amanhã");
igual("amanhã cedo", contagemConsulta(sp(5, 8), sp(4, 20)).texto, "Amanhã");
// Depois de amanhã
igual("em 3 dias", contagemConsulta(sp(7, 9), sp(4, 9)).texto, "Em 3 dias");

console.log(`contagem-consulta: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
