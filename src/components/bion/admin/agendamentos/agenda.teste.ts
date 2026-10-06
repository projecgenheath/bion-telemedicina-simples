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
import { avisoMotivo, desfechoNoStore, destaqueDinheiro, podeCorrigirDesfecho, textoAvisos, textoConfirmacao, validarMotivoCorrecao, type PlanoWire } from "./desfecho";

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

/* ---------- Desfecho (rótulo do store, prévia e confirmação) ---------- */
const passada = "2026-10-03T10:00:00-03:00";
igual("desfecho: aberta e passada = sem desfecho", desfechoNoStore(c(passada), AGORA), { rotulo: "Sem desfecho", tom: "atencao" });
igual("desfecho: aberta e futura = nada", desfechoNoStore(c("2026-10-05T10:00:00-03:00"), AGORA), null);
igual("desfecho: concluída = realizada", desfechoNoStore(c(passada, { status: "concluida" }), AGORA)?.rotulo, "Realizada");
igual("desfecho: falta do paciente", desfechoNoStore(c(passada, { falta: true }), AGORA)?.rotulo, "Falta do paciente");
igual("desfecho: aguardando por falha", desfechoNoStore(c(passada, { status: "aguardando_reagendamento", motivoReagendamento: "falha_tecnica" }), AGORA)?.rotulo, "Falha técnica");
igual("desfecho: aguardando por falta do médico", desfechoNoStore(c(passada, { status: "aguardando_reagendamento", motivoReagendamento: "falta_medico" }), AGORA)?.rotulo, "Falta do médico");
igual("desfecho: não paga cancelada por falha", desfechoNoStore(c(passada, { status: "cancelada", pago: false, motivoCancelamento: "Falha técnica: a consulta não aconteceu" }), AGORA)?.rotulo, "Falha técnica");
igual("desfecho: cancelada por outro motivo = nada", desfechoNoStore(c(passada, { status: "cancelada", motivoCancelamento: "Paciente pediu" }), AGORA), null);
igual("corrigir desfecho: só depois de começar", [podeCorrigirDesfecho(c(passada), AGORA), podeCorrigirDesfecho(c("2026-10-05T10:00:00-03:00"), AGORA)], [true, false]);
const plano = (efeito: PlanoWire["dinheiro"]["efeito"], extra: Partial<PlanoWire> = {}): PlanoWire => ({
  atual: "sem_desfecho",
  novo: "realizada",
  statusAntes: "confirmada",
  statusDepois: "concluida",
  efeitos: [],
  reembolsosEncerrados: [],
  notificarPaciente: true,
  motivoParaPaciente: false,
  notificarMedico: true,
  dinheiro: { efeito, pagoConfirmado: true, valorCentavos: 20000, liquidoMedicoCentavos: 18000, medicoRecebiaAntes: false, medicoRecebeDepois: true, repasse: null },
  ...extra,
});
igual("prévia: entra no repasse", destaqueDinheiro(plano("entra_no_proximo_repasse").dinheiro), { valor: "+ R$ 180,00", legenda: "para o médico no próximo fechamento (23:30)", tom: "dinheiro" });
igual("prévia: sai do repasse", destaqueDinheiro(plano("sai_do_repasse").dinheiro).valor, "− R$ 180,00");
igual("prévia: repasse fechado (desconto só com reembolso)", destaqueDinheiro(plano("desconto_se_reembolso").dinheiro), { valor: "até − R$ 180,00", legenda: "desconto no próximo repasse, só se o paciente escolher o reembolso", tom: "atencao" });
igual("prévia: sem pagamento", destaqueDinheiro(plano("sem_pagamento").dinheiro).valor, "—");
igual("prévia: sem mudança", destaqueDinheiro(plano("nenhum").dinheiro), { valor: "Sem mudança", legenda: "o médico continua com R$ 180,00", tom: "neutro" });
igual("confirmação cita o desfecho e quem é avisado", textoConfirmacao(plano("entra_no_proximo_repasse")), 'Revisei o efeito no dinheiro: corrigir para "Realizada" não tem "Desfazer" e o paciente e o médico serão avisados.');
igual("confirmação só paciente", textoConfirmacao(plano("nenhum", { notificarMedico: false, novo: "falta_paciente" })).endsWith("o paciente será avisado."), true);
igual("confirmação: sem desfecho → realizada avisa só o médico", textoConfirmacao(plano("entra_no_proximo_repasse", { notificarPaciente: false })).endsWith("e só o médico será avisado."), true);
igual("confirmação: ninguém avisado", textoConfirmacao(plano("sem_pagamento", { notificarPaciente: false, notificarMedico: false })).endsWith("e ninguém será avisado."), true);
igual("confirmação: motivo vai ao paciente", textoConfirmacao(plano("nenhum", { notificarMedico: false, novo: "falta_paciente", motivoParaPaciente: true })).endsWith("o paciente será avisado, com o motivo."), true);
igual("avisos: paciente e médico", textoAvisos(plano("entra_no_proximo_repasse")), "Avisos: paciente e médico (muda o que o médico recebe).");
igual("avisos: só o médico", textoAvisos(plano("entra_no_proximo_repasse", { notificarPaciente: false })), "Aviso: só o médico (muda o que ele recebe). Para o paciente nada muda na tela.");
igual("avisos: ninguém", textoAvisos(plano("sem_pagamento", { notificarPaciente: false, notificarMedico: false })), "Sem aviso: para o paciente nada muda na tela.");
igual("avisos: paciente lê o motivo", textoAvisos(plano("nenhum", { notificarMedico: false, motivoParaPaciente: true })), "Aviso: só o paciente. O paciente lê o motivo.");
igual("aviso do motivo: vai ao paciente", avisoMotivo(plano("nenhum", { motivoParaPaciente: true })), { texto: "O paciente vai ler este motivo.", vaiParaPaciente: true });
igual("aviso do motivo: fica na auditoria", avisoMotivo(plano("nenhum")), { texto: "Não vai para o paciente.", vaiParaPaciente: false });
igual("aviso do motivo: sem opção escolhida", avisoMotivo(null).texto, "Não vai para o paciente.");
igual("motivo curto", validarMotivoCorrecao("  curto  "), "Explique o motivo com pelo menos 10 caracteres (fica na auditoria).");
igual("motivo ok", validarMotivoCorrecao("O suporte confirmou."), null);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
