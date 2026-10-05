/**
 * Testes das regras puras de Agendamentos.
 * Rodar: bun src/components/bion/admin/agendamentos/agenda.teste.ts  (também com TZ=UTC e TZ=Asia/Tokyo)
 */
import type { Consulta } from "@/lib/bion-tipos";
import {
  FILTROS_PADRAO,
  agruparPorDia,
  chipsConsulta,
  corpoDesfazer,
  corpoEdicao,
  explicarErro,
  filtrarConsultas,
  horariosDoDia,
  normalizar,
  podeCancelar,
  reembolsoAoCancelar,
  resumoAgenda,
  validarHoraManual,
  validarRespostaNegar,
} from "./agenda";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido).replace(/\u00a0/g, " ");
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
const t = (iso: string) => Date.parse(iso);
const AGORA = t("2026-10-04T14:00:00-03:00"); // domingo, 14:00 em São Paulo
let n = 0;
const c = (iso: string, extra: Partial<Consulta> = {}): Consulta => ({
  id: `c${++n}`,
  medico: "Dra. Ana",
  medicoId: "m1",
  especialidade: "Clínica Geral",
  paciente: "José da Silva",
  pacienteId: "p1",
  data: "",
  hora: "",
  status: "confirmada",
  ts: t(iso),
  pago: true,
  valor: "R$ 150,00",
  ...extra,
});

const lista = [
  c("2026-10-04T09:00:00-03:00", { status: "concluida" }), // hoje cedo
  c("2026-10-04T23:30:00-03:00"), // hoje à noite (ainda "hoje" em SP; já é dia 5 em UTC)
  c("2026-10-05T00:30:00-03:00", { medicoId: "m2", medico: "Dr. Bruno", paciente: "Maria Ângela", pago: false, status: "em_espera" }), // amanhã
  c("2026-10-03T21:30:00-03:00", { status: "cancelada", motivoCancelamento: "x" }), // ontem
  c("2026-10-10T10:00:00-03:00", { especialidade: "Cardiologia" }),
];

// Período e ordenação (fuso de SP, não do navegador)
igual("hoje", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "hoje" }, AGORA).map((x) => x.id), ["c1", "c2"]);
igual("próximas (de hoje 00:00 em diante, crescente)", filtrarConsultas(lista, FILTROS_PADRAO, AGORA).map((x) => x.id), ["c1", "c2", "c3", "c5"]);
igual("passadas (decrescente)", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "passadas" }, AGORA).map((x) => x.id), ["c4"]);
igual("todas (decrescente)", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas" }, AGORA).map((x) => x.id), ["c5", "c3", "c2", "c1", "c4"]);
// Filtros
igual("busca sem acento", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", busca: "angela" }, AGORA).map((x) => x.id), ["c3"]);
igual("busca especialidade", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", busca: "cardio" }, AGORA).map((x) => x.id), ["c5"]);
igual("busca médico", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", busca: "bruno" }, AGORA).map((x) => x.id), ["c3"]);
igual("status", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", status: "cancelada" }, AGORA).map((x) => x.id), ["c4"]);
igual("médico por id", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", medicoId: "m2" }, AGORA).map((x) => x.id), ["c3"]);
igual("só não pagas", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", pago: "nao_pago" }, AGORA).map((x) => x.id), ["c3"]);
igual("só pagas", filtrarConsultas(lista, { ...FILTROS_PADRAO, periodo: "todas", pago: "pago" }, AGORA).length, 4);
igual("normalizar", normalizar("  ÂNGELA José "), "angela jose");

// Agrupar por dia (23:30 de SP fica no dia 04, mesmo em UTC/Tóquio)
igual(
  "agrupar por dia",
  agruparPorDia(filtrarConsultas(lista, FILTROS_PADRAO, AGORA)).map((g) => [g.dia, g.itens.length]),
  [
    ["2026-10-04", 2],
    ["2026-10-05", 1],
    ["2026-10-10", 1],
  ],
);
igual("resumo", resumoAgenda(lista, AGORA), { total: 5, hoje: 2, confirmadas: 2, concluidas: 1, canceladas: 1, aguardando: 0 });

// Cancelar
igual("pode cancelar confirmada", podeCancelar({ status: "confirmada" }), true);
igual("não cancela concluída", podeCancelar({ status: "concluida" }), false);
igual("não cancela cancelada", podeCancelar({ status: "cancelada" }), false);
igual("reembolso integral se paga", reembolsoAoCancelar({ pago: true, valor: "R$ 1.250,50" }), 125050);
igual("sem reembolso se não paga", reembolsoAoCancelar({ pago: false, valor: "R$ 150,00" }), 0);

// Horários do dia
const grade = ["09:00", "10:00", "14:00", "15:00", "23:00", "xx", "10:00"];
const agenda = [
  c("2026-10-05T10:00:00-03:00", { id: "ocupa" }),
  c("2026-10-05T15:00:00-03:00", { id: "livre-cancelada", status: "cancelada" }),
  c("2026-10-05T09:00:00-03:00", { id: "outro-medico", medicoId: "m2" }),
  c("2026-10-07T09:00:00-03:00", {
    id: "reserva",
    remarcacaoPendente: { novaData: "2026-10-05T14:00:00-03:00", expiraEm: "2026-10-04T14:30:00-03:00", multaCentavos: 5000, status: "pendente" },
  }),
  c("2026-10-04T15:00:00-03:00", { id: "editada" }),
];
const h = (dia: string, agora = AGORA) => horariosDoDia({ grade, dia, medicoId: "m1", consultas: agenda, consultaId: "editada", agora }).map((x) => `${x.hora}:${x.livre ? "livre" : x.motivo}`);
igual("horários amanhã", h("2026-10-05"), ["09:00:livre", "10:00:ocupado", "14:00:reservado", "15:00:livre", "23:00:vedado"]);
igual("reserva vencida libera", h("2026-10-05", t("2026-10-04T14:31:00-03:00")), ["09:00:livre", "10:00:ocupado", "14:00:livre", "15:00:livre", "23:00:vedado"]);
igual("horários hoje (passado e atual)", h("2026-10-04"), ["09:00:passado", "10:00:passado", "14:00:passado", "15:00:atual", "23:00:vedado"]);
igual("dia mal formado", h("ontem"), []);

igual("hora manual ok", validarHoraManual("14:30"), null);
igual("hora manual inválida", validarHoraManual("25:00"), "Use o formato HH:MM (ex.: 14:30).");
igual("hora manual vedada", validarHoraManual("23:15"), "Não há atendimento entre 23:00 e 00:00.");

// Corpo do PATCH (só o que mudou; médico sempre por id)
const base = { ts: t("2026-10-05T10:00:00-03:00"), medicoId: "m1", especialidade: "Clínica Geral" };
igual("nada mudou", corpoEdicao(base, { dia: "2026-10-05", hora: "10:00", medicoId: "m1", especialidade: "Clínica Geral" }), null);
igual("só horário", corpoEdicao(base, { dia: "2026-10-05", hora: "15:00", medicoId: "m1", especialidade: "Clínica Geral" }), { acao: "atualizar", data: "2026-10-05", hora: "15:00" });
igual("só médico", corpoEdicao(base, { dia: "2026-10-05", hora: "10:00", medicoId: "m2", especialidade: "Cardiologia" }), { acao: "atualizar", medicoId: "m2", especialidade: "Cardiologia" });
igual("desfazer", corpoDesfazer(base), { acao: "atualizar", data: "2026-10-05", hora: "10:00", medicoId: "m1", especialidade: "Clínica Geral" });

// Chips
igual("chips confirmada paga remarcada", chipsConsulta(c("2026-10-05T10:00:00-03:00", { remarcada: true }), AGORA).map((e) => e.rotulo), ["Confirmada", "Pago", "Remarcada"]);
igual("chips cancelada sem pagamento", chipsConsulta(c("2026-10-05T10:00:00-03:00", { status: "cancelada" }), AGORA).map((e) => e.rotulo), ["Cancelada"]);
igual(
  "chips completos",
  chipsConsulta(
    c("2026-10-05T10:00:00-03:00", {
      status: "aguardando_reagendamento",
      pago: false,
      motivoReagendamento: "falta_medico",
      falta: true,
      reembolsoManual: { status: "em_analise", respostaAdmin: null },
      remarcacaoPendente: { novaData: "2026-10-06T10:00:00-03:00", expiraEm: "2026-10-04T14:30:00-03:00", multaCentavos: 7500, status: "pendente" },
    }),
    AGORA,
  ).map((e) => e.rotulo),
  ["Aguardando reagendamento", "Não pago", "Médico não compareceu", "Multa pendente até 14:30", "Falta do paciente", "Reembolso em análise"],
);

// Reembolso e erros
igual("negar curto", validarRespostaNegar("  curto  "), "Explique o motivo ao paciente (mínimo de 10 caracteres).");
igual("negar ok", validarRespostaNegar("Falta sem justificativa válida."), null);
igual("erro sem conexão", explicarErro(0, null), "Sem conexão com o servidor. Nada foi alterado; tente de novo.");
igual("erro 403", explicarErro(403, "Acesso negado."), "Sem permissão. Entre de novo com uma conta de administrador.");
igual("erro 409 horário (texto do servidor)", explicarErro(409, "Esse horário já está ocupado na agenda do médico."), "Esse horário já está ocupado na agenda do médico.");
igual(
  "erro 409 consulta mudou",
  explicarErro(409, "A consulta foi alterada por outra pessoa enquanto você salvava. Atualize a tela e tente de novo."),
  "Outra pessoa mudou esta consulta agora há pouco. Atualize a tela e tente de novo.",
);
igual("erro 409 já decidido", explicarErro(409, "Este pedido já foi decidido."), "Este pedido já foi decidido.");
igual("erro 404", explicarErro(404, "Consulta não encontrada."), "Consulta não encontrada.");
igual("erro 500 sem texto", explicarErro(500, null), "O servidor respondeu 500. Nada foi alterado.");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
