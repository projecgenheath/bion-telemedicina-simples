/**
 * Testes das derivações da etapa 2 (consultas e agendamento do paciente).
 * Rodar: bun src/components/bion/paciente/consultas/consultas-dados.teste.ts
 */
import type { Consulta } from "@/lib/bion-tipos";
import {
  agruparHorarios,
  faixaDaGrade,
  minutosDoHorario,
  passoDaAgenda,
  semanaDoDia,
  consultaEmFoco,
  filtrarConsultas,
  fimDoHorario,
  nomeDiaLongo,
  partesValor,
  podeMexer,
  proximasConsultas,
  semanasDoCalendario,
  tituloMeses,
} from "./consultas-dados";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${JSON.stringify(obtido)} — esperado ${JSON.stringify(esperado)}`);
  }
}

// Minicalendário: terça 24/11/2026 até 07/12 (14 dias) → 3 semanas, segunda a domingo
const sem = semanasDoCalendario("2026-11-24", "2026-12-07");
igual("3 semanas", sem.length, 3);
igual("começa na segunda", sem[0]![0]!.iso, "2026-11-23");
igual("termina no domingo", sem[2]![6]!.iso, "2026-12-13");
igual("7 dias por semana", sem.every((s) => s.length === 7), true);
igual("índice da semana", sem[0]![1]!.semana, 1);
igual("título 2 meses", tituloMeses(sem), { mes: "Novembro – Dezembro", ano: "2026" });
igual("título 1 mês", tituloMeses(semanasDoCalendario("2026-11-02", "2026-11-10")), { mes: "Novembro", ano: "2026" });
igual("título virada de ano", tituloMeses(semanasDoCalendario("2026-12-28", "2027-01-05")).ano, "2027");
igual("último antes de hoje vira 1 semana", semanasDoCalendario("2026-11-24", "2026-11-01").length, 1);
igual("nome longo", nomeDiaLongo(sem[0]![2]!), "Quarta, 25 de novembro");
igual("domingo", nomeDiaLongo(sem[0]![6]!), "Domingo, 29 de novembro");

// Horários
igual("grupos", agruparHorarios(["08:00", "11:30", "12:00", "17:30", "18:00"]), [
  { periodo: "Manhã", horarios: ["08:00", "11:30"] },
  { periodo: "Tarde", horarios: ["12:00", "17:30"] },
  { periodo: "Noite", horarios: ["18:00"] },
]);
igual("sem grupos vazios", agruparHorarios(["14:00"]).map((g) => g.periodo), ["Tarde"]);
igual("vazio", agruparHorarios([]), []);
igual("fim 30 min", fimDoHorario("10:00", 30), "10:30");
igual("fim vira a hora", fimDoHorario("10:45", 30), "11:15");
igual("fim meia-noite", fimDoHorario("23:45", 30), "00:15");

// Consultas
const H = 3_600_000;
const D = 24 * H;
const agora = Date.parse("2026-11-24T09:30:00-03:00");
const c = (id: string, ts: number, status: Consulta["status"], extra: Partial<Consulta> = {}): Consulta => ({
  id, medico: "Dra. Helena Exemplo", especialidade: "Clínica Geral", paciente: "Ana", data: "Hoje", hora: "10:00", status, ts, ...extra,
});
const lista = [
  c("a", agora - 2 * D, "concluida", { pago: true }),
  c("b", agora + 3 * D, "confirmada", { pago: true, medico: "Dr. Paulo Nery", especialidade: "Cardiologia" }),
  c("c", agora + 1 * D, "em_espera", { pago: false }),
  c("d", agora - 5 * D, "cancelada"),
];
igual("foco = próxima", consultaEmFoco(lista, agora)?.id, "c");
igual("foco sem futuras = mais recente", consultaEmFoco([lista[0]!, lista[3]!], agora)?.id, "a");
igual("foco vazio", consultaEmFoco([], agora), null);
igual("próximas em ordem", proximasConsultas(lista, agora).map((x) => x.id), ["c", "b"]);
igual("busca médico sem acento", filtrarConsultas(lista, "paulo").map((x) => x.id), ["b"]);
igual("busca especialidade", filtrarConsultas(lista, "CARDIO").map((x) => x.id), ["b"]);
igual("busca situação", filtrarConsultas(lista, "aguardando pag").map((x) => x.id), ["c"]);
igual("busca vazia", filtrarConsultas(lista, "  ").length, 4);
igual("pode mexer futura", podeMexer(lista[1]!, agora), true);
igual("não mexe encerrada", podeMexer(lista[0]!, agora), false);
igual("não mexe cancelada", podeMexer(lista[3]!, agora), false);
igual("não mexe aguardando reagendamento", podeMexer(c("e", agora + D, "aguardando_reagendamento"), agora), false);
igual("valor", partesValor("R$ 180,00"), { numero: "180,00", moeda: "R$" });
igual("valor sem moeda", partesValor("180"), { numero: "180", moeda: "" });
igual("valor ausente", partesValor(undefined), null);

// Agenda própria do paciente (rodada 2)
igual("minutos", minutosDoHorario("10:30"), 630);
igual("faixa vazia", faixaDaGrade([], 30), { inicio: 8, fim: 18 });
igual("faixa 09:00–17:30", faixaDaGrade(["09:00", "17:30", "11:00"], 30), { inicio: 9, fim: 19 });
igual("faixa mínima 10 h", faixaDaGrade(["10:00"], 30), { inicio: 10, fim: 20 });
igual("faixa 07:00–19:30", faixaDaGrade(["07:00", "19:30"], 30), { inicio: 7, fim: 20 });
igual("faixa até 24 h", faixaDaGrade(["22:30"], 30), { inicio: 14, fim: 24 });
const sems = semanasDoCalendario("2026-11-24", "2026-12-07");
igual("semana do dia (1ª)", semanaDoDia(sems, "2026-11-29"), 0);
igual("semana do dia (2ª)", semanaDoDia(sems, "2026-11-30"), 1);
igual("semana do dia fora", semanaDoDia(sems, "2027-01-01"), -1);
igual("passo especialidade", passoDaAgenda({}), "especialidade");
igual("passo médico", passoDaAgenda({ especialidade: "x" }), "medico");
igual("passo dia", passoDaAgenda({ especialidade: "x", medico: "y" }), "dia");
igual("passo hora", passoDaAgenda({ especialidade: "x", medico: "y", diaIso: "2026-11-24" }), "hora");
igual("passo confirmar", passoDaAgenda({ especialidade: "x", medico: "y", diaIso: "2026-11-24", hora: "10:00" }), "confirmar");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
