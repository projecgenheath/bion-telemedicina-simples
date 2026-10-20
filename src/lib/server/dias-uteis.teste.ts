/** Prazo em dias úteis e reembolso automático no vencimento. Rodar: npx tsx src/lib/server/dias-uteis.teste.ts */
import { ehDiaUtil, fimDoPrazoEmDiasUteis } from "./dias-uteis";

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
// Sexta 23/10 → conta de seg 26: 26..30, 2, 3 → ter 03/11.
igual("sexta: pula o fim de semana", prazo("2026-10-23T18:00:00-03:00"), "2026-11-04T02:59:59.999Z");
// Sábado 24/10 e domingo 25/10 → mesmo fim da sexta.
igual("sábado", prazo("2026-10-24T10:00:00-03:00"), "2026-11-04T02:59:59.999Z");
igual("domingo", prazo("2026-10-25T10:00:00-03:00"), "2026-11-04T02:59:59.999Z");
// 23:30 de sexta em SP já é sábado em UTC: vale o dia de SP.
igual("sexta 23:30 (sábado em UTC) conta como sexta", prazo("2026-10-23T23:30:00-03:00"), "2026-11-04T02:59:59.999Z");
// 00:30 de sábado em SP (03:30Z) é sábado.
igual("sábado 00:30", prazo("2026-10-24T00:30:00-03:00"), "2026-11-04T02:59:59.999Z");
// Virada de mês e de ano.
igual("virada de ano", prazo("2026-12-30T12:00:00-03:00"), "2027-01-09T02:59:59.999Z");
igual("1 dia útil depois de sexta = segunda", prazo("2026-10-23T12:00:00-03:00", 1), "2026-10-27T02:59:59.999Z");

console.log(`dias-uteis: ${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
