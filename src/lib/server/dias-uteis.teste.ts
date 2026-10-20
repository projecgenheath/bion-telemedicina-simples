/** Prazo em dias úteis e reembolso automático no vencimento. Rodar: npx tsx src/lib/server/dias-uteis.teste.ts */
import { ehDiaUtil, ehFeriadoNacional, fimDoPrazoEmDiasUteis, pascoa } from "./dias-uteis";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};
const D = (s: string) => new Date(s);
const prazo = (s: string, n = 7) => fimDoPrazoEmDiasUteis(D(s), n).toISOString();

igual("segunda é útil", ehDiaUtil(2026, 10, 19), true);
igual("sexta é útil", ehDiaUtil(2026, 10, 23), true);
igual("sábado não", ehDiaUtil(2026, 10, 24), false);
igual("domingo não", ehDiaUtil(2026, 10, 25), false);
// Terça 20/10 → conta de qua 21: 21,22,23,26,27,28,29 → fim de qui 29/10 (SP).
igual("terça: 7 úteis a partir de quarta", prazo("2026-10-20T15:00:00-03:00"), "2026-10-30T02:59:59.999Z");
// Segunda 19/10 → ter 20 … qua 28.
igual("segunda", prazo("2026-10-19T09:00:00-03:00"), "2026-10-29T02:59:59.999Z");
// Sexta 23/10 → conta de seg 26: 26..30, (2/11 Finados), 3, 4 → qua 04/11.
igual("sexta: pula o fim de semana", prazo("2026-10-23T18:00:00-03:00"), "2026-11-05T02:59:59.999Z");
// Sábado 24/10 e domingo 25/10 → mesmo fim da sexta.
igual("sábado", prazo("2026-10-24T10:00:00-03:00"), "2026-11-05T02:59:59.999Z");
igual("domingo", prazo("2026-10-25T10:00:00-03:00"), "2026-11-05T02:59:59.999Z");
// 23:30 de sexta em SP já é sábado em UTC: vale o dia de SP.
igual("sexta 23:30 (sábado em UTC) conta como sexta", prazo("2026-10-23T23:30:00-03:00"), "2026-11-05T02:59:59.999Z");
// 00:30 de sábado em SP (03:30Z) é sábado.
igual("sábado 00:30", prazo("2026-10-24T00:30:00-03:00"), "2026-11-05T02:59:59.999Z");
// Virada de mês e de ano.
// Qua 30/12 → 31, (1/1 feriado), 4, 5, 6, 7, 8, 11 → seg 11/01/2027.
igual("virada de ano pula 1/1", prazo("2026-12-30T12:00:00-03:00"), "2027-01-12T02:59:59.999Z");
igual("1 dia útil depois de sexta = segunda", prazo("2026-10-23T12:00:00-03:00", 1), "2026-10-27T02:59:59.999Z");

// Páscoa (Meeus/Butcher).
igual("Páscoa 2025", pascoa(2025), { mes: 4, dia: 20 });
igual("Páscoa 2026", pascoa(2026), { mes: 4, dia: 5 });
igual("Páscoa 2027", pascoa(2027), { mes: 3, dia: 28 });
// Móveis de 2026.
igual("Carnaval seg 16/02/2026", ehDiaUtil(2026, 2, 16), false);
igual("Carnaval ter 17/02/2026", ehDiaUtil(2026, 2, 17), false);
igual("Cinzas qua 18/02/2026 é útil", ehDiaUtil(2026, 2, 18), true);
igual("Sexta-feira Santa 03/04/2026", ehDiaUtil(2026, 4, 3), false);
igual("Corpus Christi 04/06/2026", ehDiaUtil(2026, 6, 4), false);
igual("Sexta-feira Santa 26/03/2027", ehFeriadoNacional(2027, 3, 26), true);
// Fixos.
igual("Consciência Negra sex 20/11/2026", ehDiaUtil(2026, 11, 20), false);
igual("20/11/2023 ainda não era nacional", ehFeriadoNacional(2023, 11, 20), false);
igual("Tiradentes ter 21/04/2026", ehDiaUtil(2026, 4, 21), false);
igual("12/10/2026 (seg)", ehDiaUtil(2026, 10, 12), false);
igual("25/12/2026 (sex)", ehDiaUtil(2026, 12, 25), false);
igual("1/1/2027 (sex)", ehDiaUtil(2027, 1, 1), false);
// Prazo que atravessa feriado: qua 11/11 → 12, 13, 16, 17, 18, 19, (20/11), 23 → seg 23/11.
igual("prazo atravessa 20/11", prazo("2026-11-11T10:00:00-03:00"), "2026-11-24T02:59:59.999Z");
// Prazo que atravessa o Carnaval: sex 13/02 → 18, 19, 20, 23, 24, 25, 26 → qui 26/02.
igual("prazo atravessa o Carnaval", prazo("2026-02-13T22:30:00-03:00"), "2026-02-27T02:59:59.999Z");

console.log(`dias-uteis: ${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
