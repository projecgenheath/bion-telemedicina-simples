/**
 * Testes das derivações do Início do médico (redesign azul).
 * Rodar: bun src/components/bion/medico/inicio/inicio-dados.teste.ts
 */
import type { Consulta } from "@/lib/bion-tipos";
import type { PacienteDoMedico } from "../metricas";
import {
  alertaPrioritario,
  consultasProximosDias,
  dataHoraClinica,
  faixaHorario,
  pilhaAvatares,
  filtrarPacientes,
  linhaPaciente,
  mediaAvaliacoes,
  tomDoStatus,
} from "./inicio-dados";

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

const H = 3_600_000;
const D = 24 * H;
const agora = Date.parse("2026-11-22T12:00:00-03:00");
const c = (id: string, ts: number, status: Consulta["status"], extra: Partial<Consulta> = {}): Consulta => ({
  id, medico: "Dra. X", especialidade: "Clínica", paciente: "Ana", data: "", hora: "", status, ts, ...extra,
});

// Próximos 7 dias: só ativas, de agora até agora+7d (exclusivo).
const lista = [
  c("a", agora + H, "confirmada"),
  c("b", agora + 2 * D, "em_espera"),
  c("c", agora + 3 * D, "pendente_anamnese"),
  c("d", agora + 3 * D, "cancelada"),
  c("e", agora - H, "confirmada"),
  c("f", agora + 7 * D, "confirmada"),
  c("g", agora + 2 * D, "concluida"),
];
igual("próximos 7 dias", consultasProximosDias(lista, agora), 3);
igual("próximos 1 dia", consultasProximosDias(lista, agora, 1), 1);
igual("sem consultas", consultasProximosDias([], agora), 0);

// Média das avaliações.
igual("média sem avaliações", mediaAvaliacoes([]), null);
igual("média arredonda 1 casa", mediaAvaliacoes([{ nota: 5 }, { nota: 4 }, { nota: 4 }]), { media: 4.3, total: 3 });
igual("ignora nota inválida", mediaAvaliacoes([{ nota: 5 }, { nota: 0 }, { nota: 9 }]), { media: 5, total: 1 });

// Tons.
igual("confirmada azul", tomDoStatus("confirmada"), "azul");
igual("em_espera laranja", tomDoStatus("em_espera"), "laranja");
igual("falta vermelho", tomDoStatus("falta_paciente"), "vermelho");
igual("concluída verde", tomDoStatus("concluida"), "verde");

// Linha da tabela: usa a próxima; sem próxima, a última.
const pComProxima: PacienteDoMedico = {
  chave: "p1", pacienteId: "p1", nome: "Ana Souza", consultas: [],
  proxima: c("x", agora + H, "confirmada", { motivoConsulta: "Dor de cabeça", tipoAtendimento: "retorno" }),
  ultima: c("y", agora - 5 * D, "concluida", { motivoConsulta: "Antiga" }),
};
const l1 = linhaPaciente(pComProxima, agora);
igual("linha motivo da próxima", l1.motivo, "Dor de cabeça");
igual("linha situação", [l1.situacao, l1.tom], ["Confirmada", "azul"]);
igual("linha tipo", l1.tipo, "Retorno");
igual("linha datas", [l1.ultima, l1.proxima], [agora - 5 * D, agora + H]);
const pSoUltima: PacienteDoMedico = { chave: "p2", nome: "Bruno Lima", consultas: [], ultima: c("z", agora - D, "falta_paciente") };
const l2 = linhaPaciente(pSoUltima, agora);
igual("linha sem motivo", l2.motivo, "—");
igual("linha última", [l2.situacao, l2.tom, l2.proxima, l2.tipo], ["Falta do paciente", "vermelho", null, "Consulta"]);

const pSoFutura: PacienteDoMedico = { chave: "p4", nome: "Caio", consultas: [], proxima: c("w", agora + D, "confirmada"), ultima: c("w", agora + D, "confirmada") };
igual("futura não vira última", linhaPaciente(pSoFutura, agora).ultima, null);

// Datas no fuso da clínica.
igual("data longa", dataHoraClinica(Date.parse("2026-11-23T02:30:00Z")), { data: "22/11/2026", hora: "23:30" });
igual("data curta", dataHoraClinica(Date.parse("2026-11-22T13:05:00Z"), true), { data: "22/11/26", hora: "10:05" });

// Filtro.
const pacs = [pComProxima, pSoUltima, { chave: "p3", nome: "José Araújo", consultas: [] } as PacienteDoMedico];
igual("busca sem acento", filtrarPacientes(pacs, "araujo", false).map((p) => p.chave), ["p3"]);
igual("busca caixa", filtrarPacientes(pacs, "ANA", false).map((p) => p.chave), ["p1"]);
igual("só com próxima", filtrarPacientes(pacs, "", true).map((p) => p.chave), ["p1"]);
igual("busca vazia", filtrarPacientes(pacs, "  ", false).length, 3);

// Alerta prioritário.
const base = { evolucaoPaciente: null, pacienteNaSala: null, reservaTexto: null, acoes: null };
igual("nada", alertaPrioritario(base), { tipo: "nada" });
igual("ações zeradas = nada", alertaPrioritario({ ...base, acoes: { remarcadas: 0, canceladas: 0 } }), { tipo: "nada" });
igual("ações", alertaPrioritario({ ...base, acoes: { remarcadas: 1, canceladas: 2 } }), { tipo: "acoes", remarcadas: 1, canceladas: 2 });
igual("reserva antes de ações", alertaPrioritario({ ...base, reservaTexto: "R", acoes: { remarcadas: 1, canceladas: 0 } }).tipo, "reserva");
igual("na sala antes de reserva", alertaPrioritario({ ...base, pacienteNaSala: "Ana", reservaTexto: "R" }).tipo, "na_sala");
igual("evolução primeiro", alertaPrioritario({ ...base, evolucaoPaciente: "Bia", pacienteNaSala: "Ana" }), { tipo: "evolucao", paciente: "Bia" });

// Faixa de horário (30 min do servidor).
igual("faixa", faixaHorario(Date.parse("2026-11-22T12:30:00Z")), "09:30 – 10:00");
igual("faixa 45", faixaHorario(Date.parse("2026-11-22T12:30:00Z"), 45), "09:30 – 10:15");

// Pilha de avatares.
const P = (k: string) => ({ chave: k, nome: k });
igual("pilha envolvidos primeiro", pilhaAvatares([P("a")], [P("b"), P("a"), P("c"), P("d")]), { visiveis: [P("a"), P("b"), P("c")], resto: 1 });
igual("pilha vazia", pilhaAvatares([], []), { visiveis: [], resto: 0 });

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
