/**
 * Teste do fuso da clínica no servidor (parseDataHora + helpers de fuso.ts).
 * Rodar (precisa da condição react-server por causa do "server-only"):
 *   bun --conditions=react-server scripts/teste_fuso.ts
 *   TZ=UTC bun --conditions=react-server scripts/teste_fuso.ts
 *   TZ=Asia/Tokyo bun --conditions=react-server scripts/teste_fuso.ts
 * O resultado deve ser o mesmo em qualquer TZ do processo.
 */
import { parseDataHora } from "../src/lib/server/dados";
import { instanteNoFuso, quandoClinica, dataIsoClinica, partesNoFuso } from "../src/lib/server/fuso";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${String(obtido)} — esperado ${String(esperado)}`);
  }
}
const iso = (d: Date) => d.toISOString();
const A = (s: string) => new Date(s);

// Datas explícitas
igual("ISO 14:00", iso(parseDataHora("2026-10-01", "14:00")), "2026-10-01T17:00:00.000Z");
igual("BR 14:00", iso(parseDataHora("01/10/2026", "14:00")), "2026-10-01T17:00:00.000Z");
igual("D Mes AAAA", iso(parseDataHora("1 Out 2026", "14:00")), "2026-10-01T17:00:00.000Z");
igual("00:30", iso(parseDataHora("2026-10-01", "00:30")), "2026-10-01T03:30:00.000Z");
igual("23:59 vira dia seguinte em UTC", iso(parseDataHora("2026-10-01", "23:59")), "2026-10-02T02:59:00.000Z");
igual("hora vazia → 09:00", iso(parseDataHora("2026-10-01", "")), "2026-10-01T12:00:00.000Z");

// Rótulos relativos: "hoje" é o dia em São Paulo, não em UTC
const noite = A("2026-10-02T01:30:00Z"); // 22:30 de 01/10 em São Paulo
igual("Hoje à noite (UTC já virou)", iso(parseDataHora("Hoje", "23:00", noite)), "2026-10-02T02:00:00.000Z");
igual("Amanhã à noite (UTC já virou)", iso(parseDataHora("Amanhã", "09:00", noite)), "2026-10-02T12:00:00.000Z");
igual("amanha sem acento", iso(parseDataHora("amanha", "09:00", noite)), "2026-10-02T12:00:00.000Z");
igual("Hoje à tarde", iso(parseDataHora("hoje", "14:00", A("2026-10-01T15:00:00Z"))), "2026-10-01T17:00:00.000Z");
igual("Amanhã na virada do ano", iso(parseDataHora("Amanhã", "09:00", A("2026-12-31T15:00:00Z"))), "2027-01-01T12:00:00.000Z");
igual("D Mes sem ano", iso(parseDataHora("12 Dez", "10:00", A("2026-10-01T12:00:00Z"))), "2026-12-12T13:00:00.000Z");
igual("D Mes sem ano → próximo ano", iso(parseDataHora("5 Jan", "10:00", A("2026-12-20T12:00:00Z"))), "2027-01-05T13:00:00.000Z");

// Helpers
igual("instanteNoFuso", iso(instanteNoFuso(2026, 10, 1, 14, 0)), "2026-10-01T17:00:00.000Z");
igual("instanteNoFuso normaliza dia 32", iso(instanteNoFuso(2026, 10, 32, 9, 0)), "2026-11-01T12:00:00.000Z");
igual("horário de verão histórico (2018, UTC-2)", iso(instanteNoFuso(2018, 12, 1, 14, 0)), "2018-12-01T16:00:00.000Z");
igual("quandoClinica", quandoClinica(A("2026-10-01T17:00:00Z")), "01/10/2026 às 14:00");
igual("quandoClinica longo", quandoClinica(A("2026-10-01T17:00:00Z"), { day: "numeric", month: "long" }), "1 de outubro às 14:00");
igual("quandoClinica noite", quandoClinica(A("2026-10-02T02:00:00Z")), "01/10/2026 às 23:00");
igual("dataIsoClinica noite", dataIsoClinica(noite), "2026-10-01");
igual("partesNoFuso hora", partesNoFuso(A("2026-10-01T03:00:00Z")).hora, 0);

// Ida e volta: parse → formatação no fuso devolve o que o usuário digitou
for (const h of ["00:00", "08:30", "14:00", "20:59", "21:00", "23:30"]) {
  igual(`ida e volta ${h}`, quandoClinica(parseDataHora("2026-10-01", h)), `01/10/2026 às ${h}`);
}

console.log(`TZ do processo: ${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}`);
console.log(`${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
