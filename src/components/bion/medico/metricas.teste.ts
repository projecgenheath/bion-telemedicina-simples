/**
 * Testes das métricas PURAS do app do médico (contagem de remarcadas/
 * canceladas pelo paciente, reserva pendente, agenda do dia, cancelar dia).
 * Rodar: bun src/components/bion/medico/metricas.teste.ts
 * (também com TZ=UTC / TZ=Asia/Tokyo: o resultado não pode depender do fuso.)
 */
import type { Consulta } from "@/lib/bion-tipos";
import {
  agendaDoDia,
  consultasCancelaveisDoDia,
  contarAcoesPacienteHoje,
  diaHoraClinica,
  pontosReceita,
  reservaVigente,
  reservasNoDia,
  textoReservaPendente,
  type EventoMedico,
} from "./metricas";

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

// "Agora": 01/10/2026 10:00 em São Paulo (13:00Z).
const AGORA = Date.parse("2026-10-01T13:00:00.000Z");
const HOJE_9H = "2026-10-01T12:00:00.000Z";
const HOJE_23H = "2026-10-02T02:00:00.000Z"; // 23:00 SP ainda é hoje
const ONTEM_23H = "2026-10-01T02:00:00.000Z"; // 23:00 SP de 30/09
const AMANHA_9H = "2026-10-02T12:00:00.000Z";

const ev = (p: Partial<EventoMedico> & { consultaId: string }): EventoMedico => ({
  tipo: "remarcada",
  por: "paciente",
  motivo: "pedido_paciente",
  em: "2026-10-01T11:00:00.000Z",
  dataAnterior: HOJE_9H,
  dataNova: AMANHA_9H,
  ...p,
});

/* ---------- contarAcoesPacienteHoje ---------- */
igual("vazio", contarAcoesPacienteHoje([], AGORA), { remarcadas: 0, canceladas: 0, total: 0 });
igual(
  "remarcação + cancelamento do paciente hoje",
  contarAcoesPacienteHoje(
    [ev({ consultaId: "a" }), ev({ consultaId: "b", tipo: "cancelada", dataNova: null, dataAnterior: HOJE_23H })],
    AGORA,
  ),
  { remarcadas: 1, canceladas: 1, total: 2 },
);
igual(
  "mesma consulta remarcada 2x conta 1",
  contarAcoesPacienteHoje([ev({ consultaId: "a" }), ev({ consultaId: "a", em: "2026-10-01T12:30:00.000Z" })], AGORA),
  { remarcadas: 1, canceladas: 0, total: 1 },
);
igual(
  "data original ontem 23h SP não conta (UTC seria hoje)",
  contarAcoesPacienteHoje([ev({ consultaId: "a", dataAnterior: ONTEM_23H })], AGORA),
  { remarcadas: 0, canceladas: 0, total: 0 },
);
igual(
  "data original amanhã não conta",
  contarAcoesPacienteHoje([ev({ consultaId: "a", dataAnterior: AMANHA_9H })], AGORA),
  { remarcadas: 0, canceladas: 0, total: 0 },
);
igual(
  "evento do médico/sistema/admin não conta",
  contarAcoesPacienteHoje(
    [
      ev({ consultaId: "a", por: "medico", tipo: "cancelada", motivo: "agenda_cancelada" }),
      ev({ consultaId: "b", por: "sistema", tipo: "falha_tecnica", motivo: "falha_tecnica" }),
      ev({ consultaId: "c", por: "admin", motivo: "admin" }),
    ],
    AGORA,
  ),
  { remarcadas: 0, canceladas: 0, total: 0 },
);
igual(
  "motivo reagendamento (depois do médico cancelar) não conta",
  contarAcoesPacienteHoje(
    [
      ev({ consultaId: "a", por: "medico", tipo: "cancelada", motivo: "agenda_cancelada", em: "2026-10-01T10:00:00.000Z" }),
      ev({ consultaId: "a", motivo: "reagendamento", em: "2026-10-01T11:00:00.000Z" }),
    ],
    AGORA,
  ),
  { remarcadas: 0, canceladas: 0, total: 0 },
);
igual(
  "paciente escolhe reembolso depois do médico cancelar não conta",
  contarAcoesPacienteHoje(
    [
      ev({ consultaId: "a", por: "paciente", tipo: "cancelada", motivo: "pedido_paciente", em: "2026-10-01T11:00:00.000Z" }),
      ev({ consultaId: "a", por: "medico", tipo: "cancelada", motivo: "agenda_cancelada", em: "2026-10-01T10:00:00.000Z" }),
    ],
    AGORA,
  ),
  { remarcadas: 0, canceladas: 0, total: 0 },
);
igual(
  "tipo desconhecido (falta_paciente) não conta",
  contarAcoesPacienteHoje([ev({ consultaId: "a", tipo: "falta_paciente" })], AGORA),
  { remarcadas: 0, canceladas: 0, total: 0 },
);
igual(
  "remarcou e depois cancelou: 1 em cada, total 1",
  contarAcoesPacienteHoje(
    [
      ev({ consultaId: "a", em: "2026-10-01T10:00:00.000Z" }),
      ev({ consultaId: "a", tipo: "cancelada", dataAnterior: HOJE_9H, em: "2026-10-01T11:00:00.000Z" }),
    ],
    AGORA,
  ),
  { remarcadas: 1, canceladas: 1, total: 1 },
);

/* ---------- reserva pendente + agenda do dia ---------- */
const consulta = (p: Partial<Consulta> & { id: string; dataISO: string }): Consulta => ({
  medico: "Dra. Ana",
  medicoId: "m1",
  especialidade: "Clínica",
  paciente: `Paciente ${p.id}`,
  data: "",
  hora: "",
  status: "confirmada",
  ts: Date.parse(p.dataISO),
  pago: true,
  remarcacaoPendente: null,
  ...p,
});
const reserva = (novaData: string, expiraEm: string) => ({ novaData, expiraEm, multaCentavos: 7500, status: "pendente" as const });

const comReserva = consulta({ id: "r", dataISO: HOJE_23H, remarcacaoPendente: reserva(AMANHA_9H, "2026-10-01T13:15:00.000Z") });
const expirada = consulta({ id: "x", dataISO: HOJE_23H, remarcacaoPendente: reserva(AMANHA_9H, "2026-10-01T12:59:00.000Z") });
igual("reserva vigente", reservaVigente(comReserva, AGORA)?.novaData, AMANHA_9H);
igual("reserva expirada = null", reservaVigente(expirada, AGORA), null);
igual("sem reserva = null", reservaVigente(consulta({ id: "s", dataISO: HOJE_9H }), AGORA), null);
igual("diaHoraClinica em SP", diaHoraClinica(AMANHA_9H), "02/10 às 09:00");
igual(
  "texto da reserva",
  textoReservaPendente(comReserva.remarcacaoPendente!),
  "Novo horário reservado, aguardando pagamento: 02/10 às 09:00 (até 10:15)",
);

const lista = [
  comReserva,
  expirada,
  consulta({ id: "c1", dataISO: AMANHA_9H.replace("12:00", "13:00") }), // amanhã 10:00
  consulta({ id: "c2", dataISO: "2026-10-02T14:00:00.000Z", status: "cancelada" }), // amanhã 11:00, cancelada
];
const amanha = agendaDoDia(lista, "2026-10-02", ["09:00", "10:00", "11:00", "14:00"], AGORA);
igual(
  "agenda de amanhã: 09:00 reservado, 10:00 ocupado, 11:00 liberado, 14:00 livre",
  amanha.map((s) => [s.hora, s.estado, s.reservadoPor?.id ?? null]),
  [
    ["09:00", "reservado", "r"],
    ["10:00", "ocupado", null],
    ["11:00", "encerrada", null],
    ["14:00", "livre", null],
  ],
);
const hoje = agendaDoDia(lista, "2026-10-01", ["09:00"], AGORA);
igual(
  "agenda de hoje: consulta com reserva fica no horário ORIGINAL (23:00)",
  hoje.map((s) => [s.hora, s.estado, s.consultas.map((c) => c.id)]),
  [
    ["09:00", "livre", []],
    ["23:00", "ocupado", ["r", "x"]],
  ],
);
igual("reservas no dia de amanhã (expirada ignorada)", reservasNoDia(lista, "2026-10-02", AGORA).map((c) => c.id), ["r"]);

/* ---------- consultasCancelaveisDoDia ---------- */
const doDia = [
  consulta({ id: "passou", dataISO: HOJE_9H }), // 09:00 já começou
  consulta({ id: "ok1", dataISO: "2026-10-01T18:00:00.000Z" }),
  consulta({ id: "ok2", dataISO: "2026-10-01T15:00:00.000Z", status: "em_espera", pago: false }),
  consulta({ id: "canc", dataISO: "2026-10-01T16:00:00.000Z", status: "cancelada" }),
  consulta({ id: "conc", dataISO: "2026-10-01T16:30:00.000Z", status: "concluida" }),
  consulta({ id: "aguard", dataISO: "2026-10-01T17:00:00.000Z", status: "aguardando_reagendamento" }),
  consulta({ id: "amanha", dataISO: AMANHA_9H }),
  consulta({ id: "noite", dataISO: HOJE_23H }),
];
igual(
  "cancelar dia: só ativas, de hoje (SP), ainda não começadas, em ordem",
  consultasCancelaveisDoDia(doDia, "2026-10-01", AGORA).map((c) => c.id),
  ["ok2", "ok1", "noite"],
);

/* ---------- pontosReceita ---------- */
const zero = { liquidoCentavos: 0, brutoCentavos: 0, comissaoCentavos: 0, taxaCentavos: 0, multasMedicoCentavos: 0, totalCentavos: 0, consultas: 0 };
igual(
  "pontos da receita",
  pontosReceita({
    de: "2026-09-30",
    ate: "2026-10-01",
    dias: [
      { dia: "2026-09-30", ...zero },
      { dia: "2026-10-01", ...zero, totalCentavos: 13500, consultas: 1 },
    ],
    totais: { ...zero, totalCentavos: 13500, consultas: 1 },
    regra: { comissaoPct: 10, multaParteMedicoPct: 50 },
  }),
  [
    { iso: "2026-09-30", rotulo: "30/09", centavos: 0, qtd: 0 },
    { iso: "2026-10-01", rotulo: "01/10", centavos: 13500, qtd: 1 },
  ],
);
igual("pontos sem resposta", pontosReceita(null), []);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
