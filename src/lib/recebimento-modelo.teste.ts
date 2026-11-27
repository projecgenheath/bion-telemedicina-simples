/**
 * Testes do modelo novo de recebimento do médico (funções puras e textos).
 * Rodar: bun src/lib/recebimento-modelo.teste.ts
 * Regras: decisão do Alisson de 21/11/2026 (regras-pagamento-bion-2026-11.md).
 */
import {
  AVISO_GERAL_RECEBIMENTO,
  AVISO_RETIDO_PLATAFORMA,
  TEXTO_COBRANCA_RETIDA,
  TEXTO_FALTA_MEDICO,
  TEXTO_FALTA_PACIENTE_PLATAFORMA,
  TEXTO_MULTAS,
  TEXTO_PRAZO_BANCO,
  TEXTO_REEMBOLSOS,
  TEXTO_TRANSFERENCIA,
  TOTAIS_ZERO,
  efeitoFaltaPaciente,
  itemRetidoDaConsulta,
  transferenciaAposConsulta,
} from "./recebimento-modelo";

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

/* ---------- transferência prevista (regra 2) ---------- */
igual(
  "R$ 150 com taxa de R$ 6,45: médico 90% − taxa",
  transferenciaAposConsulta(15000, 645),
  { brutoCentavos: 15000, comissaoCentavos: 1500, taxaCentavos: 645, medicoCentavos: 12855, bionCentavos: 1500, comissaoPct: 10, parteMedicoPct: 90 },
);
igual("sem taxa informada: médico fica com 90% inteiro", transferenciaAposConsulta(15000, null).medicoCentavos, 13500);
igual("taxa zero", transferenciaAposConsulta(15000, 0).taxaCentavos, 0);
igual("taxa maior que os 90%: limitada, líquido nunca negativo", transferenciaAposConsulta(15000, 99999), {
  brutoCentavos: 15000,
  comissaoCentavos: 1500,
  taxaCentavos: 13500,
  medicoCentavos: 0,
  bionCentavos: 1500,
  comissaoPct: 10,
  parteMedicoPct: 90,
});
igual("taxa negativa vira zero", transferenciaAposConsulta(15000, -5).taxaCentavos, 0);
igual("valor zero", transferenciaAposConsulta(0, 645), {
  brutoCentavos: 0,
  comissaoCentavos: 0,
  taxaCentavos: 0,
  medicoCentavos: 0,
  bionCentavos: 0,
  comissaoPct: 10,
  parteMedicoPct: 90,
});
igual("valor negativo vira zero", transferenciaAposConsulta(-100, 10).medicoCentavos, 0);
igual("arredondamento da comissão (Math.round, como financeiro.ts)", transferenciaAposConsulta(15001, 0).bionCentavos, 1500);
igual("comissão personalizada 20%", transferenciaAposConsulta(15000, 500, 20), {
  brutoCentavos: 15000,
  comissaoCentavos: 3000,
  taxaCentavos: 500,
  medicoCentavos: 11500,
  bionCentavos: 3000,
  comissaoPct: 20,
  parteMedicoPct: 80,
});
igual("comissão inválida cai no padrão 10%", transferenciaAposConsulta(15000, 0, Number.NaN).comissaoPct, 10);

/* ---------- item do bloco `retido` (contrato, seção 2) ---------- */
const DATA_ITEM = new Date("2026-11-28T18:00:00.000Z");
igual("item retido: 20000 com taxa desconhecida", itemRetidoDaConsulta("c1", DATA_ITEM, 20000, null, "sem_desfecho"), {
  consultaId: "c1",
  dataInicio: "2026-11-28T18:00:00.000Z",
  valorCentavos: 20000,
  comissaoCentavos: 2000,
  taxaCentavos: null,
  previstoCentavos: 18000,
  desfecho: "sem_desfecho",
});
igual("item retido: taxa 700 informada", itemRetidoDaConsulta("c2", DATA_ITEM, 20000, 700, "realizada"), {
  consultaId: "c2",
  dataInicio: "2026-11-28T18:00:00.000Z",
  valorCentavos: 20000,
  comissaoCentavos: 2000,
  taxaCentavos: 700,
  previstoCentavos: 17300,
  desfecho: "realizada",
});
igual("item retido: valor negativo vira zero", itemRetidoDaConsulta("c3", DATA_ITEM, -500, null, "sem_desfecho").previstoCentavos, 0);
igual("totais zero: nada negativo", TOTAIS_ZERO.liquidoCentavos, 0);
contem("aviso geral: BION 10%", AVISO_GERAL_RECEBIMENTO, "A BION fica com 10%");
contem("aviso geral: taxa no reembolso", AVISO_GERAL_RECEBIMENTO, "inclusive no reembolso");

/* ---------- textos das regras 1 a 8 ---------- */
contem("regra 1: cobrado na marcação", TEXTO_COBRANCA_RETIDA, "cobrado na marcação");
contem("regra 1: fica na plataforma", TEXTO_COBRANCA_RETIDA, "fica na conta da plataforma até a consulta terminar");
contem("regra 2: 90% menos a taxa", TEXTO_TRANSFERENCIA, "90% do valor menos a taxa do cartão");
contem("regra 2: BION 10%", TEXTO_TRANSFERENCIA, "A BION fica com 10%");
contem("regra 2: só depois da consulta realizada", TEXTO_TRANSFERENCIA, "Depois da consulta realizada");
contem("regra 3: não entra em 10 minutos", TEXTO_FALTA_MEDICO, "não entrar em até 10 minutos");
contem("regra 3: primeiro médico não recebe", TEXTO_FALTA_MEDICO, "o primeiro não recebe");
contem("regra 3: sem nova cobrança", TEXTO_FALTA_MEDICO, "sem nova cobrança");
contem("regra 5: 7 dias corridos", TEXTO_REEMBOLSOS, "7 dias corridos");
contem("regras 4/5: nenhum médico recebe", TEXTO_REEMBOLSOS, "Nenhum médico recebe");
contem("regra 6: BION não devolve a taxa", TEXTO_REEMBOLSOS, "A BION não devolve a taxa do cartão");
contem("regra 7: metade do médico", TEXTO_MULTAS, "sua metade (50%)");
contem("regra 7: taxa sai da metade", TEXTO_MULTAS, "menos a taxa do cartão");
contem("regra 8: calendário da Stripe", TEXTO_PRAZO_BANCO, "calendário da Stripe");
contem("regra 8: cartão brasileiro 30 dias", TEXTO_PRAZO_BANCO, "30 dias corridos");
contem("regra 8: sem fechamento 23:30 no modelo novo", TEXTO_PRAZO_BANCO, "não há fechamento diário às 23:30");
contem("aviso do retido: até a consulta terminar", AVISO_RETIDO_PLATAFORMA, "até a consulta terminar");
contem("aviso do retido: 90% menos a taxa", AVISO_RETIDO_PLATAFORMA, "90% menos a taxa do cartão");

/* ---------- o que NÃO pode prometer ---------- */
const todos = [TEXTO_COBRANCA_RETIDA, TEXTO_TRANSFERENCIA, TEXTO_FALTA_MEDICO, TEXTO_REEMBOLSOS, TEXTO_MULTAS, TEXTO_PRAZO_BANCO, AVISO_RETIDO_PLATAFORMA].join(" ");
igual("não promete depósito no dia da consulta", todos.includes("depósito no dia"), false);
igual("não promete crédito na hora do pagamento", todos.includes("cai na hora"), false);
igual("não promete devolução da taxa pela BION", todos.includes("BION devolve a taxa"), false);

/* ---------- falta do paciente por modelo (contrato, seção 3 + emenda 27/11) ---------- */
contem("falta plataforma: médico não recebe", TEXTO_FALTA_PACIENTE_PLATAFORMA, "você não recebe por esta consulta");
contem("falta plataforma: 7 dias para remarcar sem custo", TEXTO_FALTA_PACIENTE_PLATAFORMA, "7 dias para remarcar sem custo");
contem("falta plataforma: reembolso sem remarcação", TEXTO_FALTA_PACIENTE_PLATAFORMA, "sem remarcação, o valor é reembolsado");
igual("falta plataforma: não promete recebimento", TEXTO_FALTA_PACIENTE_PLATAFORMA.includes("recebe normalmente"), false);
igual("plataforma troca o texto legado", efeitoFaltaPaciente("plataforma", "Você recebe normalmente."), TEXTO_FALTA_PACIENTE_PLATAFORMA);
igual("legado mantém o texto da tela", efeitoFaltaPaciente("legado", "Você recebe normalmente."), "Você recebe normalmente.");
igual("sem modelo (servidor antigo) mantém o texto da tela", efeitoFaltaPaciente(undefined, "Você recebe normalmente."), "Você recebe normalmente.");
igual("modelo nulo mantém o texto da tela", efeitoFaltaPaciente(null, "Você recebe normalmente."), "Você recebe normalmente.");

console.log(`recebimento-modelo: ${ok} ok, ${falhas} falhas`);
if (falhas > 0) process.exit(1);
