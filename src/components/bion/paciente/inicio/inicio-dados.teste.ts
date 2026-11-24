/**
 * Testes das derivações do Início do paciente (redesign azul, etapa 1).
 * Rodar: bun src/components/bion/paciente/inicio/inicio-dados.teste.ts
 */
import type { Consulta } from "@/lib/bion-tipos";
import { acaoPrioritaria, dataHora, diaPorExtenso, filtrarHistorico, historicoConsultas, iniciaisNome, plural } from "./inicio-dados";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${JSON.stringify(obtido)} — esperado ${JSON.stringify(esperado)}`);
  }
}

const H = 3_600_000;
const D = 24 * H;
const agora = Date.parse("2026-11-24T09:30:00-03:00");
const c = (id: string, ts: number, status: Consulta["status"], extra: Partial<Consulta> = {}): Consulta => ({
  id, medico: "Dra. Helena Exemplo", especialidade: "Clínica Geral", paciente: "Ana", data: "Hoje", hora: "10:00", status, ts, ...extra,
});

igual("dia por extenso", diaPorExtenso(agora), "Terça-feira, 24 de novembro");
igual("data e hora", dataHora(agora), { data: "24/11/2026", hora: "09:30" });
igual("iniciais dra", iniciaisNome("Dra. Helena Exemplo"), "HE");
igual("iniciais de", iniciaisNome("Maria de Souza"), "MS");
igual("iniciais vazio", iniciaisNome(""), "?");
igual("plural 1", plural(1, "consulta", "consultas"), "1 consulta");
igual("plural 3", plural(3, "consulta", "consultas"), "3 consultas");

const lista = [
  c("futura", agora + D, "confirmada"),
  c("feita", agora - 2 * D, "concluida", { medico: "Dr. Paulo Nery", especialidade: "Cardiologia" }),
  c("cancel", agora - 1 * D, "cancelada"),
  c("falta", agora - 9 * D, "falta_paciente"),
  c("espera", agora - 3 * D, "em_espera"),
];
const hist = historicoConsultas(lista);
igual("histórico só encerradas, mais recente primeiro", hist.map((l) => l.id), ["cancel", "feita", "falta"]);
igual("situação realizada", hist[1]!.situacao, { texto: "Realizada", tom: "ok" });
igual("situação falta", hist[2]!.situacao.texto, "Falta registrada");
igual("busca por especialidade sem acento", filtrarHistorico(hist, "cardio").map((l) => l.id), ["feita"]);
igual("busca por médico", filtrarHistorico(hist, "helena").map((l) => l.id), ["cancel", "falta"]);
igual("busca vazia", filtrarHistorico(hist, "  ").length, 3);

const p = c("p", agora + H, "confirmada");
igual("nada", acaoPrioritaria({}), { tipo: "nada" });
igual("mensagem", acaoPrioritaria({ mensagemDe: "Dr. X", mensagensDoRemetente: 2 }), { tipo: "mensagem", medico: "Dr. X", total: 2 });
igual("triagem antes de mensagem", acaoPrioritaria({ proxima: p, triagemPendente: "nao_iniciada", mensagemDe: "Dr. X" }).tipo, "triagem");
igual("pagar antes de triagem", acaoPrioritaria({ proxima: p, proximaAguardandoPagamento: true, triagemPendente: "andamento" }).tipo, "pagar");
igual("reagendar primeiro", acaoPrioritaria({ aguardandoReagendamento: c("r", agora, "aguardando_reagendamento"), proxima: p, proximaAguardandoPagamento: true }).tipo, "reagendar");
igual("triagem em andamento", acaoPrioritaria({ proxima: p, triagemPendente: "andamento" }), { tipo: "triagem", medico: "Dra. Helena Exemplo", quando: "Hoje · 10:00", andamento: true });

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
