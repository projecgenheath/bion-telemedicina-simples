/**
 * Testes da fidelização de pacientes (funções puras + canal de rascunho).
 * Rodar: bun src/components/bion/medico/fidelizacao.teste.ts
 * (dias no fuso da clínica — o resultado não pode depender do fuso do processo.)
 */
import {
  diasDesdeUltimaConsulta,
  diferencaDiasClinica,
  ehInativo,
  primeiraConsultaEm,
  rotuloSemConsulta,
  segmentosDoPaciente,
  textoModeloRetorno,
  ultimaConcluidaEm,
} from "./fidelizacao";
import { consumirRascunhoRetorno, definirRascunhoRetorno } from "./rascunho-retorno";
import type { ApptStatus } from "@/lib/bion-tipos";

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
function contem(nome: string, texto: string, trecho: string) {
  igual(nome, texto.includes(trecho), true);
}

/** Meio-dia (fuso da clínica) de um dia YYYY-MM-DD — instante estável p/ os testes. */
const em = (diaIso: string) => Date.parse(`${diaIso}T12:00:00-03:00`);
const AGORA = em("2026-10-30");
const consulta = (diaIso: string, status: ApptStatus) => ({ ts: em(diaIso), status });

/* ---------- diferencaDiasClinica ---------- */
igual("mesmo dia, horas diferentes", diferencaDiasClinica(em("2026-10-30"), em("2026-10-30")), 0);
igual("dia seguinte", diferencaDiasClinica(em("2026-10-29"), AGORA), 1);
igual("virada de mês", diferencaDiasClinica(em("2026-09-30"), em("2026-10-01")), 1);
igual("90 dias exatos", diferencaDiasClinica(em("2026-08-01"), AGORA), 90);
igual("invertida é negativa", diferencaDiasClinica(AGORA, em("2026-10-29")), -1);

/* ---------- ultimaConcluidaEm / primeiraConsultaEm ---------- */
igual(
  "ultima concluida ignora cancelada e falta",
  ultimaConcluidaEm([consulta("2026-10-01", "concluida"), consulta("2026-10-20", "cancelada"), consulta("2026-10-25", "falta_paciente")]),
  em("2026-10-01"),
);
igual("ultima concluida sem nenhuma", ultimaConcluidaEm([consulta("2026-10-01", "cancelada")]), null);
igual(
  "primeira ignora cancelada",
  primeiraConsultaEm([consulta("2026-09-01", "cancelada"), consulta("2026-10-05", "concluida"), consulta("2026-10-20", "concluida")]),
  em("2026-10-05"),
);
igual("primeira sem nenhuma válida", primeiraConsultaEm([consulta("2026-09-01", "cancelada")]), null);

/* ---------- segmentos ---------- */
igual("sem consultas", segmentosDoPaciente([], false, AGORA), []);
igual("só canceladas", segmentosDoPaciente([consulta("2026-10-01", "cancelada")], false, AGORA), []);
igual(
  "retorno próximo",
  segmentosDoPaciente([consulta("2026-11-05", "confirmada")], true, AGORA),
  ["retorno", "novo"],
);
igual(
  "acompanhamento ativo (30 dias; 1ª consulta antiga, sem 'novo')",
  segmentosDoPaciente([consulta("2026-05-10", "concluida"), consulta("2026-09-30", "concluida")], false, AGORA),
  ["acompanhamento"],
);
igual(
  "acompanhamento no limite de 90 dias",
  segmentosDoPaciente([consulta("2026-08-01", "concluida")], false, AGORA),
  ["acompanhamento"],
);
igual(
  "inativo com 91 dias",
  segmentosDoPaciente([consulta("2026-07-31", "concluida")], false, AGORA),
  ["inativo"],
);
igual(
  "inativo perde o segmento se tiver futura",
  segmentosDoPaciente([consulta("2026-07-01", "concluida"), consulta("2026-11-10", "confirmada")], true, AGORA),
  ["retorno"],
);
igual(
  "retorno + acompanhamento coexistem",
  segmentosDoPaciente(
    [consulta("2026-06-01", "concluida"), consulta("2026-10-10", "concluida"), consulta("2026-11-02", "confirmada")],
    true,
    AGORA,
  ),
  ["retorno", "acompanhamento"],
);
igual(
  "novo + acompanhamento (1ª consulta há 10 dias)",
  segmentosDoPaciente([consulta("2026-10-20", "concluida")], false, AGORA),
  ["acompanhamento", "novo"],
);
igual(
  "falta não é atendimento (sem segmento clínico)",
  segmentosDoPaciente([consulta("2026-07-01", "falta_paciente")], false, AGORA),
  [],
);
igual("ehInativo verdadeiro", ehInativo([consulta("2026-06-15", "concluida")], false, AGORA), true);
igual("ehInativo falso com futura", ehInativo([consulta("2026-06-15", "concluida")], true, AGORA), false);

/* ---------- diasDesdeUltimaConsulta / rotuloSemConsulta ---------- */
igual("dias desde a última", diasDesdeUltimaConsulta([consulta("2026-07-06", "concluida")], AGORA), 116);
igual("dias desde a última (nunca)", diasDesdeUltimaConsulta([], AGORA), null);
igual("rótulo 1 dia", rotuloSemConsulta(1), "Sem consulta há 1 dia");
igual("rótulo 45 dias", rotuloSemConsulta(45), "Sem consulta há 45 dias");
igual("rótulo 59 dias", rotuloSemConsulta(59), "Sem consulta há 59 dias");
igual("rótulo 60 dias vira meses", rotuloSemConsulta(60), "Sem consulta há 2 meses");
igual("rótulo 95 dias", rotuloSemConsulta(95), "Sem consulta há 3 meses");
igual("rótulo 365 dias", rotuloSemConsulta(365), "Sem consulta há 12 meses");

/* ---------- textoModeloRetorno ---------- */
contem("modelo usa o primeiro nome", textoModeloRetorno("Maria Silva"), "Olá, Maria!");
contem("modelo sugere agendar pelo app", textoModeloRetorno("Maria Silva"), "agendar pelo app");
igual("modelo sem nome não quebra", textoModeloRetorno("  ").startsWith("Olá! "), true);

/* ---------- rascunho de retorno (canal lista → conversa) ---------- */
igual("consumir sem nada guardado", consumirRascunhoRetorno("pac-1"), null);
definirRascunhoRetorno("pac-1", "texto de retorno");
igual("consumir devolve o texto", consumirRascunhoRetorno("pac-1"), "texto de retorno");
igual("consumo é único", consumirRascunhoRetorno("pac-1"), null);
definirRascunhoRetorno("pac-1", "de um");
igual("não vaza para outro paciente", consumirRascunhoRetorno("pac-2"), null);
igual("o do paciente certo continua", consumirRascunhoRetorno("pac-1"), "de um");

console.log(`\nfidelizacao: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
