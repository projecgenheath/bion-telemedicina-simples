/**
 * Testes das métricas PURAS do app do médico (contagem de remarcadas/
 * canceladas pelo paciente, reserva pendente, agenda do dia, cancelar dia).
 * Rodar: bun src/components/bion/medico/metricas.teste.ts
 * (também com TZ=UTC / TZ=Asia/Tokyo: o resultado não pode depender do fuso.)
 */
import type { Avaliacao, Consulta, Medico } from "@/lib/bion-tipos";
import {
  agendaDoDia,
  completudePerfil,
  consultasCancelaveisDoDia,
  contarAcoesPacienteHoje,
  deveVigiarPresenca,
  diaHoraClinica,
  diaSemanaISO,
  desfechosSistema,
  ESPERA_FALTA_MIN,
  faixaPrecosEspecialidade,
  janelasComparacao,
  medicoEsperouAteOLimite,
  metricasPeriodo,
  janelaRespostaPaciente,
  pacienteEsteveNaSala,
  podeMarcarDesfechoNaAgenda,
  podeMarcarFalta,
  prazoDesfecho,
  pontosReceita,
  receitaPrevista,
  reservaVigente,
  reservasNoDia,
  resumoAvaliacoes,
  rotuloStatusMedico,
  somarDiasISO,
  textoReservaPendente,
  variacaoPct,
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

// Rótulos de falta do paciente / falha técnica (eventos do sistema)
{
  const falhasT = desfechosSistema([
    ev({ consultaId: "ft", por: "sistema", tipo: "falha_tecnica", motivo: "falha_tecnica" }),
    ev({ consultaId: "fp", por: "sistema", tipo: "falta_paciente", motivo: "falta_paciente" }),
    ev({ consultaId: "fm", por: "sistema", tipo: "falha_tecnica", motivo: "falta_medico" }),
  ]);
  igual("desfechos do sistema", [...falhasT], [["ft", "falha_tecnica"], ["fm", "falta_medico"]]);
  igual("rótulo médico não compareceu", rotuloStatusMedico(consulta({ id: "fm", dataISO: HOJE_9H, status: "aguardando_reagendamento" }), falhasT), "Médico não compareceu");
  igual("rótulo falha técnica", rotuloStatusMedico(consulta({ id: "ft", dataISO: HOJE_9H, status: "aguardando_reagendamento" }), falhasT), "Falha técnica");
  igual("rótulo falta do paciente", rotuloStatusMedico(consulta({ id: "fp", dataISO: HOJE_9H, falta: true }), falhasT), "Falta do paciente");
  igual("rótulo sem evento = status", rotuloStatusMedico(consulta({ id: "x", dataISO: HOJE_9H, status: "em_espera" })), "Aguardando pagamento");
}

/* ---- Desfecho marcado pelo médico (regras do Alisson, 06/10/2026) ---- */
{
  // Consulta às 14:00 de 06/10/2026 em São Paulo (17:00Z).
  const INI = Date.parse("2026-10-06T17:00:00.000Z");
  const m = (min: number) => INI + min * 60_000;
  const sessao = (entrou: number | null, ultimo: number | null) => ({ entrouEm: entrou, ultimoPing: ultimo });

  igual("prazo = 23:30 SP do dia", new Date(prazoDesfecho(INI)).toISOString(), "2026-10-07T02:30:00.000Z");
  igual("prazo de consulta às 22:30 SP (01:30Z do dia seguinte) ainda é 23:30 do dia dela", new Date(prazoDesfecho("2026-10-07T01:30:00.000Z")).toISOString(), "2026-10-07T02:30:00.000Z");
  igual("espera é 15 min", ESPERA_FALTA_MIN, 15);

  // Médico na sala desde 13:58, agora 14:05 → espera, libera 14:15.
  let r = podeMarcarFalta({ dataInicio: INI, agora: m(5), medico: sessao(m(-2), m(5)), paciente: null });
  igual("antes de 15 min: não pode", [r.pode, !r.pode && r.motivo, r.liberaEm, r.faltaMs], [false, "aguardar", m(15), 10 * 60_000]);
  r = podeMarcarFalta({ dataInicio: INI, agora: m(15), medico: sessao(m(-2), m(15)), paciente: null });
  igual("aos 15 min na sala: pode", [r.pode, r.pode && r.esperouMs], [true, 15 * 60_000]);
  // Médico entrou atrasado (14:10): aos 14:12 ainda não; aos 14:15 sim.
  r = podeMarcarFalta({ dataInicio: INI, agora: m(12), medico: sessao(m(10), m(12)), paciente: null });
  igual("entrou atrasado: espera até o horário + 15", [r.pode, r.liberaEm], [false, m(15)]);
  r = podeMarcarFalta({ dataInicio: INI, agora: m(15), medico: sessao(m(10), m(15)), paciente: null });
  igual("entrou atrasado: libera no horário + 15", [r.pode, r.pode && r.esperouMs], [true, 5 * 60_000]);
  // Paciente com presença depois do horário → nunca.
  r = podeMarcarFalta({ dataInicio: INI, agora: m(30), medico: sessao(m(0), m(30)), paciente: sessao(m(3), m(4)) });
  igual("paciente esteve depois do horário: não pode", [r.pode, !r.pode && r.motivo], [false, "paciente_esteve"]);
  // Paciente só antes do horário → não impede.
  r = podeMarcarFalta({ dataInicio: INI, agora: m(20), medico: sessao(m(0), m(20)), paciente: sessao(m(-10), m(-5)) });
  igual("paciente só antes do horário: pode", r.pode, true);
  // Médico saiu antes de 15 min (sinal parado) → não pode; precisa voltar.
  r = podeMarcarFalta({ dataInicio: INI, agora: m(20), medico: sessao(m(0), m(8)), paciente: null });
  igual("médico saiu antes de 15 min: não pode", [r.pode, !r.pode && r.motivo, r.liberaEm], [false, "medico_nao_esteve", null]);
  r = podeMarcarFalta({ dataInicio: INI, agora: m(10), medico: null, paciente: null });
  igual("médico nunca entrou (antes do limite): entre e espere", [r.pode, !r.pode && r.motivo, r.liberaEm], [false, "medico_nao_esteve", m(15)]);
  // Pela agenda, mais tarde no mesmo dia: vale a sessão que alcançou o limite.
  r = podeMarcarFalta({ dataInicio: INI, agora: m(300), medico: sessao(m(0), m(16)), paciente: null });
  igual("pela agenda no mesmo dia, com espera feita: pode", r.pode, true);
  // Depois das 23:30 → prazo.
  r = podeMarcarFalta({ dataInicio: INI, agora: prazoDesfecho(INI) + 60_000, medico: sessao(m(0), m(16)), paciente: null });
  igual("depois das 23:30: prazo", [r.pode, !r.pode && r.motivo], [false, "prazo"]);
  r = podeMarcarFalta({ dataInicio: INI, agora: m(-5), medico: sessao(m(-6), m(-5)), paciente: null });
  igual("antes do horário: não pode", [r.pode, !r.pode && r.motivo], [false, "antes_do_horario"]);

  igual("paciente esteve: ping no horário conta", pacienteEsteveNaSala(INI, sessao(m(-1), m(0))), true);
  igual("paciente esteve: ping antes não conta", pacienteEsteveNaSala(INI, sessao(m(-9), m(-1))), false);
  igual("médico esperou até o limite", [medicoEsperouAteOLimite(INI, sessao(m(0), m(15))), medicoEsperouAteOLimite(INI, sessao(m(0), m(14)))], [true, false]);

  // Botões na agenda: consulta que já começou, ativa, sem desfecho, dentro do prazo.
  const c14 = consulta({ id: "a", dataISO: new Date(INI).toISOString(), status: "confirmada" });
  igual("agenda: antes do horário não mostra", podeMarcarDesfechoNaAgenda(c14, m(-1)), false);
  igual("agenda: depois do horário mostra", podeMarcarDesfechoNaAgenda(c14, m(1)), true);
  igual("agenda: depois das 23:30 não mostra", podeMarcarDesfechoNaAgenda(c14, prazoDesfecho(INI) + 1), false);
  igual("agenda: com falta não mostra", podeMarcarDesfechoNaAgenda({ ...c14, falta: true }, m(30)), false);
  igual("agenda: com falha técnica não mostra", podeMarcarDesfechoNaAgenda(c14, m(30), new Map([["a", "falha_tecnica" as const]])), false);
  igual("agenda: concluída não mostra", podeMarcarDesfechoNaAgenda({ ...c14, status: "concluida" }, m(30)), false);
}

/* ---------- janelaRespostaPaciente (PC2: regra do POST /api/mensagens) ---------- */
{
  const DIA = 86_400_000;
  const resumo = (j: ReturnType<typeof janelaRespostaPaciente>) =>
    j ? [j.base.id, j.limite, j.diasRestantes, j.encerrada] : null;

  igual("janela: sem consultas = null", janelaRespostaPaciente([], AGORA), null);
  igual(
    "janela: só cancelada = null",
    janelaRespostaPaciente([consulta({ id: "c", dataISO: HOJE_9H, status: "cancelada" })], AGORA),
    null,
  );
  // Base = NÃO cancelada mais recente (a cancelada de 25/09 é ignorada,
  // mesmo sendo mais nova que a concluída de 20/09) — como o servidor.
  const base20 = consulta({ id: "base", dataISO: "2026-09-20T12:00:00.000Z", status: "concluida" });
  const canc25 = consulta({ id: "canc", dataISO: "2026-09-25T12:00:00.000Z", status: "cancelada" });
  igual("janela: base ignora cancelada mais recente", resumo(janelaRespostaPaciente([canc25, base20], AGORA))?.[0], "base");
  // Limite = base + 30 dias; em 01/10 faltam 19 dias para 20/10.
  igual(
    "janela: limite e dias restantes",
    resumo(janelaRespostaPaciente([base20], AGORA)),
    ["base", Date.parse("2026-09-20T12:00:00.000Z") + 30 * DIA, 19, false],
  );
  // Fronteira igual à do servidor (bloqueia com agora > limite): no limite
  // exato ainda está aberta; 1 ms depois, encerrada.
  const limite = base20.ts + 30 * DIA;
  igual("janela: no limite exato ainda aberta", janelaRespostaPaciente([base20], limite)?.encerrada, false);
  igual("janela: 1 ms após o limite, encerrada", resumo(janelaRespostaPaciente([base20], limite + 1)), ["base", limite, 0, true]);
  // Consulta futura não cancelada vira a base (servidor ordena por
  // dataInicio desc, sem filtrar passado): janela segue aberta.
  const futura = consulta({ id: "fut", dataISO: AMANHA_9H, status: "confirmada" });
  igual(
    "janela: consulta futura é a base",
    resumo(janelaRespostaPaciente([base20, futura], AGORA))?.[0],
    "fut",
  );
}

/* ---------- Painel de gestão: janelas e indicadores de período ---------- */
{
  igual("somarDiasISO dentro do mês", somarDiasISO("2026-10-01", -6), "2026-09-25");
  igual("somarDiasISO cruzando o mês", somarDiasISO("2026-09-30", 1), "2026-10-01");
  igual("somarDiasISO cruzando o ano", somarDiasISO("2026-12-31", 1), "2027-01-01");
  igual("diaSemanaISO quinta", diaSemanaISO("2026-10-01"), 4);
  igual("diaSemanaISO domingo", diaSemanaISO("2026-10-04"), 0);

  igual("janelas 7d", janelasComparacao(AGORA, 7), {
    atual: { deISO: "2026-09-25", ateISO: "2026-10-01" },
    anterior: { deISO: "2026-09-18", ateISO: "2026-09-24" },
  });
  igual("janelas 30d", janelasComparacao(AGORA, 30).atual, { deISO: "2026-09-02", ateISO: "2026-10-01" });

  const janela = { deISO: "2026-09-25", ateISO: "2026-10-01" };
  const lista: Consulta[] = [
    consulta({ id: "g1", dataISO: "2026-09-28T12:00:00.000Z", status: "concluida", valor: "R$ 200" }),
    consulta({ id: "g2", dataISO: "2026-09-29T12:00:00.000Z", status: "concluida", valor: "R$ 100" }),
    consulta({ id: "g3", dataISO: "2026-09-30T12:00:00.000Z", status: "falta_paciente", valor: "R$ 200" }),
    consulta({ id: "g4", dataISO: "2026-09-30T15:00:00.000Z", status: "cancelada", pago: false }),
    consulta({ id: "g5", dataISO: HOJE_9H, status: "confirmada", valor: "R$ 150" }),
    consulta({ id: "g6", dataISO: "2026-09-20T12:00:00.000Z", status: "concluida", valor: "R$ 999" }), // fora da janela
  ];
  const todos = metricasPeriodo(lista, { slotsPorDiaSemana: [4, 4, 4, 4, 4, 4, 4], diasAtendimento: [] }, janela);
  igual("gestão: ofertados todos os dias", todos.ofertados, 28); // 7 dias × 4
  igual("gestão: ofertados seg–sex", metricasPeriodo(lista, { slotsPorDiaSemana: [4, 4, 4, 4, 4, 4, 4], diasAtendimento: [1, 2, 3, 4, 5] }, janela).ofertados, 20); // sex 25, seg 28–qui 01
  // Grade por dia da semana: dom sem slots e sáb com 2 — sex 4 + sáb 2 +
  // dom 0 + seg–qui 4×4 = 22.
  igual("gestão: ofertados com grade por dia", metricasPeriodo(lista, { slotsPorDiaSemana: [0, 4, 4, 4, 4, 4, 2], diasAtendimento: [] }, janela).ofertados, 22);
  igual("gestão: ocupados", todos.ocupados, 4);
  igual("gestão: ocupação", todos.ocupacao, 4 / 28);
  igual("gestão: atendimentos", todos.atendimentos, 2);
  igual("gestão: faltas", todos.faltas, 1);
  igual("gestão: taxa de falta", todos.taxaFalta, 1 / 3);
  igual("gestão: canceladas", todos.canceladas, 1);
  igual("gestão: pagas", todos.consultasPagas, 4);
  igual("gestão: receita das consultas", todos.receitaConsultas, 650);
  igual("gestão: ticket médio", todos.ticketMedio, 162.5);
  igual(
    "gestão: janela vazia",
    metricasPeriodo([], { slotsPorDiaSemana: [0, 0, 0, 0, 0, 0, 0], diasAtendimento: [] }, janela),
    { ofertados: 0, ocupados: 0, ocupacao: null, atendimentos: 0, faltas: 0, taxaFalta: null, canceladas: 0, consultasPagas: 0, receitaConsultas: 0, ticketMedio: null },
  );
  // Falta pelo selo `falta` do bootstrap (status já concluída no legado).
  const comSelo = metricasPeriodo(
    [consulta({ id: "g7", dataISO: "2026-09-28T12:00:00.000Z", status: "concluida", falta: true })],
    { slotsPorDiaSemana: [1, 1, 1, 1, 1, 1, 1], diasAtendimento: [] },
    janela,
  );
  igual("gestão: falta pelo selo", [comSelo.faltas, comSelo.ocupados], [1, 1]);

  const futura = consulta({ id: "g8", dataISO: AMANHA_9H, status: "confirmada", valor: "R$ 300" });
  igual("receita prevista", receitaPrevista([futura, ...lista], AGORA), { total: 300, qtd: 1 });
  igual("receita prevista vazia", receitaPrevista(lista, AGORA), { total: 0, qtd: 0 });

  igual("variação +50%", variacaoPct(150, 100), 50);
  igual("variação −50%", variacaoPct(50, 100), -50);
  igual("variação sem base", variacaoPct(10, 0), null);
  igual("variação zero/zero", variacaoPct(0, 0), 0);
}

/* ---------- Avaliações: resumo com sub-notas ---------- */
{
  const av = (p: Partial<Avaliacao> & { id: string; nota: number }): Avaliacao => ({
    paciente: "Paciente",
    medico: "Dra. Ana",
    especialidade: "Clínica",
    quando: "há 1 dia",
    ts: 0,
    ...p,
  });
  const lista = [
    av({ id: "a1", nota: 5, pontualidade: 5, atencao: 4, clareza: 5, comentario: "Ótima." }),
    av({ id: "a2", nota: 4, pontualidade: 4, atencao: 5 }),
    av({ id: "a3", nota: 3, comentario: "Ok." }),
  ];
  const r = resumoAvaliacoes(lista);
  igual("avaliações: total", r.total, 3);
  igual("avaliações: média", r.media, 4);
  igual("avaliações: distribuição", r.distribuicao, [0, 0, 1, 1, 1]);
  igual("avaliações: pontualidade", r.pontualidade, 4.5);
  igual("avaliações: atenção", r.atencao, 4.5);
  igual("avaliações: clareza (só quem avaliou)", r.clareza, 5);
  igual("avaliações: com comentário", r.comComentario, 2);
  igual("avaliações: vazio", resumoAvaliacoes([]), {
    total: 0, media: null, distribuicao: [0, 0, 0, 0, 0], pontualidade: null, atencao: null, clareza: null, comComentario: 0,
  });
}

/* ---------- Perfil: completude e faixa de preço ---------- */
{
  const base: Pick<Medico, "foto" | "bio" | "formacao" | "experiencia" | "idiomas" | "subespecialidades" | "horariosDisponiveis"> = {
    foto: "data:image/png;base64,x",
    bio: "Clínica geral com foco em prevenção.",
    formacao: "FMUSP",
    experiencia: "10 anos",
    idiomas: ["Português"],
    subespecialidades: ["Check-up"],
    horariosDisponiveis: ["08:00"],
  };
  igual("completude cheia", completudePerfil(base), { percentual: 100, preenchidos: 7, total: 7, faltantes: [] });
  const parcial = completudePerfil({ ...base, foto: undefined, bio: " ", experiencia: "", idiomas: [] });
  igual("completude parcial", parcial.percentual, 43);
  igual("completude faltantes", parcial.faltantes, ["foto de perfil", "apresentação (bio)", "experiência", "idiomas"]);

  const med = (id: string, especialidade: string, valor: number, status: Medico["status"] = "ativo") =>
    ({ id, especialidade, valor, status }) as Pick<Medico, "id" | "especialidade" | "valor" | "status">;
  const diretorio = [
    med("eu", "Clínica", 200),
    med("m2", "Clínica", 100),
    med("m3", "Clínica", 150),
    med("m4", "Clínica", 300),
    med("m5", "Pediatria", 999),
    med("m6", "Clínica", 50, "pendente"),
    med("m7", "Clínica", 0),
  ];
  igual("faixa: ímpar", faixaPrecosEspecialidade(diretorio, "Clínica", "eu"), { min: 100, mediana: 150, max: 300, n: 3 });
  igual(
    "faixa: par (mediana média dos centrais)",
    faixaPrecosEspecialidade([...diretorio, med("m8", "Clínica", 200)], "Clínica", "eu"),
    { min: 100, mediana: 175, max: 300, n: 4 },
  );
  igual("faixa: sem pares", faixaPrecosEspecialidade(diretorio, "Dermatologia", "eu"), null);
  igual("faixa: especialidade case-insensitive", faixaPrecosEspecialidade(diretorio, " clínica ", "eu")?.n, 3);
}

/* Item 22: a vigia da presença só roda com a sala aberta (30 min antes … 2 h depois). */
{
  const inicio = Date.UTC(2026, 9, 30, 17, 0, 0); // instante qualquer; a janela é relativa a ele
  igual("vigia: 31 min antes não vigia", deveVigiarPresenca(inicio, inicio - 31 * 60_000), false);
  igual("vigia: 30 min antes vigia (abertura)", deveVigiarPresenca(inicio, inicio - 30 * 60_000), true);
  igual("vigia: no horário vigia", deveVigiarPresenca(inicio, inicio), true);
  igual("vigia: 2 h depois vigia (fechamento)", deveVigiarPresenca(inicio, inicio + 120 * 60_000), true);
  igual("vigia: 2 h e 1 min depois não vigia", deveVigiarPresenca(inicio, inicio + 121 * 60_000), false);
}

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
