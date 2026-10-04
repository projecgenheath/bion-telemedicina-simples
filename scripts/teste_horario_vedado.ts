/**
 * Teste da janela sem teleconsulta: 23:00–00:00 (São Paulo).
 * Rodar:
 *   bun scripts/teste_horario_vedado.ts
 *   TZ=UTC bun scripts/teste_horario_vedado.ts
 *   TZ=Asia/Tokyo bun scripts/teste_horario_vedado.ts
 * O resultado deve ser o mesmo em qualquer TZ do processo.
 */
import type { Prisma } from "@prisma/client";
import {
  consultaEmHorarioVedado,
  criarSeDiaLivre,
  DURACAO_CONSULTA_MIN,
  ERRO_DIA_BLOQUEADO,
  ERRO_HORARIO_VEDADO,
  erroGradeVedada,
  fimDaConsulta,
  horariosVedadosDaGrade,
  horarioVedado,
  slotVedado,
} from "../src/lib/server/bloqueio-agenda";
import { gerarGrade, paraMin, slotNaJanelaVedada } from "../src/components/bion/medico/metricas";

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

/** Horário de parede de São Paulo (UTC-3 fixo) → instante. */
const sp = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const min = (n: number) => n * 60_000;

// ── Constantes ───────────────────────────────────────────────────────
igual("mensagem", ERRO_HORARIO_VEDADO, "Não há atendimento entre 23:00 e 00:00.");
igual("duração do servidor", DURACAO_CONSULTA_MIN, 30);
igual("fimDaConsulta = +30 min", fimDaConsulta(sp("2026-10-10T22:30")).toISOString(), sp("2026-10-10T23:00").toISOString());

// ── Bordas com a duração do servidor (30 min) ────────────────────────
const bordas: [string, boolean][] = [
  ["22:00", false],
  ["22:29", false], // termina 22:59
  ["22:30", false], // termina 23:00 exato (intervalo semiaberto)
  ["22:31", true],
  ["22:45", true], // 22:45–23:15
  ["22:59", true],
  ["23:00", true],
  ["23:30", true],
  ["23:59", true], // atravessa a meia-noite
  ["00:00", false],
  ["00:01", false],
  ["12:00", false],
];
for (const [h, esperado] of bordas) {
  igual(`consulta ${h} SP`, consultaEmHorarioVedado(sp(`2026-10-10T${h}`)), esperado);
  igual(`grade ${h}`, slotVedado(h), esperado);
  igual(`grade cliente ${h} (30 min)`, slotNaJanelaVedada(paraMin(h), 30), esperado);
}

// ── Intervalos arbitrários ───────────────────────────────────────────
const I = (a: string, b: string) => horarioVedado(sp(a), sp(b));
igual("[22:00,23:00) não encosta", I("2026-10-10T22:00", "2026-10-10T23:00"), false);
igual("[22:00,23:01) encosta", I("2026-10-10T22:00", "2026-10-10T23:01"), true);
igual("[23:59,00:29) atravessa", I("2026-10-10T23:59", "2026-10-11T00:29"), true);
igual("[00:00,22:59) livre", I("2026-10-11T00:00", "2026-10-11T22:59"), false);
igual("[00:00,00:00 +1d) pega 23h", I("2026-10-11T00:00", "2026-10-12T00:00"), true);
igual("[12:00, 12:00 +1d) pega 23h", I("2026-10-10T12:00", "2026-10-11T12:00"), true);
igual("[00:10, 22:50) livre", I("2026-10-11T00:10", "2026-10-11T22:50"), false);
igual("vários dias", I("2026-10-10T08:00", "2026-10-14T08:00"), true);
igual("instante 23:00 (vazio)", horarioVedado(sp("2026-10-10T23:00"), sp("2026-10-10T23:00")), true);
igual("instante 22:59:59.999 (vazio)", horarioVedado(new Date(sp("2026-10-10T23:00").getTime() - 1), sp("2026-10-10T22:00")), false);
igual("instante 00:00 (vazio)", horarioVedado(sp("2026-10-11T00:00"), sp("2026-10-11T00:00")), false);
igual("data inválida → false", horarioVedado(new Date("x"), new Date("y")), false);
// Em UTC: 23:00 SP = 02:00Z do dia seguinte
igual("02:00Z = 23:00 SP", consultaEmHorarioVedado(new Date("2026-10-11T02:00:00Z")), true);
igual("01:30Z = 22:30 SP", consultaEmHorarioVedado(new Date("2026-10-11T01:30:00Z")), false);
igual("03:00Z = 00:00 SP", consultaEmHorarioVedado(new Date("2026-10-11T03:00:00Z")), false);
// Virada de mês/ano
igual("31/12 23:15", consultaEmHorarioVedado(sp("2026-12-31T23:15")), true);
igual("01/01 00:00", consultaEmHorarioVedado(sp("2027-01-01T00:00")), false);
igual("28/02 23:30", consultaEmHorarioVedado(sp("2027-02-28T23:30")), true);
// Varredura minuto a minuto de um dia inteiro (30 min)
{
  let erradas = 0;
  for (let m = 0; m < 1440; m++) {
    const inicio = new Date(sp("2026-10-10T00:00").getTime() + min(m));
    const esperado = m + 30 > 23 * 60;
    if (consultaEmHorarioVedado(inicio) !== esperado) erradas++;
    const hh = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (slotVedado(hh) !== esperado || slotNaJanelaVedada(m, 30) !== esperado) erradas++;
  }
  igual("varredura 1440 min (servidor = cliente)", erradas, 0);
}

// ── Grade (servidor) ─────────────────────────────────────────────────
igual("grade com duração 60: 22:00 termina 23:00, livre", slotVedado("22:00", 60), false);
igual("grade com duração 60: 22:01 encosta", slotVedado("22:01", 60), true);
igual("grade com duração 10: 22:50 livre", slotVedado("22:50", 10), false);
igual("grade formato inválido → não vedado (formato é validado à parte)", slotVedado("24:00"), false);
igual(
  "horariosVedadosDaGrade",
  horariosVedadosDaGrade(["09:00", "22:30", "22:45", "23:00", "23:59", "00:00", 5, null]),
  ["22:45", "23:00", "23:59"],
);
igual("grade não-array", horariosVedadosDaGrade(undefined), []);
igual(
  "mensagem da grade",
  erroGradeVedada(["22:45", "23:00"]),
  "Não há atendimento entre 23:00 e 00:00. Cada consulta conta 30 min e precisa terminar até 23:00 — remova: 22:45, 23:00.",
);

// ── Grade (cliente, AgendaSheet) ─────────────────────────────────────
igual(
  "gerarGrade 21:00–23:59, 30+15",
  gerarGrade({ inicio: "21:00", fim: "23:59", duracao: 30, intervalo: 15 }),
  ["21:00", "21:45", "22:30"],
);
igual(
  "gerarGrade 22:00–23:59, 15+10 (usa 30 do servidor: 22:50 sai)",
  gerarGrade({ inicio: "22:00", fim: "23:59", duracao: 15, intervalo: 10 }),
  ["22:00", "22:25"],
);
igual(
  "gerarGrade 22:45 com 30 min não é oferecido",
  gerarGrade({ inicio: "22:45", fim: "23:59", duracao: 30, intervalo: 10 }),
  [],
);
igual(
  "gerarGrade 23:00–23:59 vazio",
  gerarGrade({ inicio: "23:00", fim: "23:59", duracao: 10, intervalo: 10 }),
  [],
);
igual(
  "gerarGrade com duração 60: 22:20 sai",
  gerarGrade({ inicio: "20:00", fim: "23:59", duracao: 60, intervalo: 10 }),
  ["20:00", "21:10"],
);
igual(
  "gerarGrade normal intocada",
  gerarGrade({ inicio: "08:00", fim: "10:00", duracao: 30, intervalo: 10 }),
  ["08:00", "08:40", "09:20"],
);
{
  // Tudo que a tela oferece o servidor aceita (várias combinações).
  let recusados = 0;
  for (const duracao of [10, 15, 20, 30, 45, 60, 90]) {
    for (const intervalo of [10, 15, 20]) {
      const g = gerarGrade({ inicio: "18:00", fim: "23:59", duracao, intervalo });
      recusados += horariosVedadosDaGrade(g).length;
    }
  }
  igual("grade da tela sempre aceita pelo servidor", recusados, 0);
}

// ── criarSeDiaLivre (transação falsa) ────────────────────────────────
async function criar(instante: Date, bloqueado: boolean) {
  let criou = false;
  const tx = {
    $executeRaw: async () => 1,
    bloqueioAgenda: { findUnique: async () => (bloqueado ? { id: "b1" } : null) },
  } as unknown as Prisma.TransactionClient;
  const r = await criarSeDiaLivre(tx, "m1", instante, async () => {
    criou = true;
    return "c1";
  });
  return { r, criou };
}
{
  const a = await criar(sp("2026-10-10T23:00"), false);
  igual("tx: 23:00 recusado", a.r, { bloqueado: true, erro: ERRO_HORARIO_VEDADO });
  igual("tx: 23:00 nada criado", a.criou, false);
  const b = await criar(sp("2026-10-10T22:30"), false);
  igual("tx: 22:30 criado", b.r, { bloqueado: false, valor: "c1" });
  const c = await criar(sp("2026-10-10T10:00"), true);
  igual("tx: dia bloqueado", c.r, { bloqueado: true, erro: ERRO_DIA_BLOQUEADO });
  igual("tx: dia bloqueado nada criado", c.criou, false);
}

console.log(`TZ=${process.env.TZ ?? "(padrão)"} — ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
