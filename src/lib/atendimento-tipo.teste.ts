/**
 * Testes de lib/atendimento-tipo.ts (retorno e renovação de receita).
 * Rodar: bun src/lib/atendimento-tipo.teste.ts
 */
import {
  escolherHorarioInicial,
  lerCorpoPedidoRenovacao,
  lerPedidoRenovacao,
  pedidoDaReceita,
  lerPedidoVinculado,
  motivoSugerido,
  normalizarTipoAtendimento,
  podeRenovarReceita,
  receitaControlada,
  rotuloTipoAtendimento,
} from "./atendimento-tipo";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

eq("normaliza ausente", normalizarTipoAtendimento(undefined), "padrao");
eq("normaliza lixo", normalizarTipoAtendimento("xx"), "padrao");
eq("normaliza retorno", normalizarTipoAtendimento("retorno"), "retorno");
eq("rotulo padrao some", rotuloTipoAtendimento("padrao"), null);
eq("rotulo renovacao", rotuloTipoAtendimento("renovacao"), "Renovação de receita");

const r = (medicamento: string, extra: Partial<{ observacoes: string; conteudo: string }> = {}) => ({ tipo: "receita", medicamento, ...extra });
eq("losartana renova", podeRenovarReceita(r("Losartana 50 mg")), true);
eq("metformina renova", podeRenovarReceita(r("Metformina 850mg")), true);
eq("clonazepam bloqueia", podeRenovarReceita(r("Clonazepam 2 mg")), false);
eq("Rivotril bloqueia", podeRenovarReceita(r("RIVOTRIL gotas")), false);
eq("sertralina (C1) bloqueia", podeRenovarReceita(r("Sertralina 50mg")), false);
eq("acento: codeína bloqueia", podeRenovarReceita(r("Paracetamol + Codeína")), false);
eq("ácido valpróico bloqueia", podeRenovarReceita(r("Ácido valproico 500")), false);
eq("controle especial nas obs", podeRenovarReceita(r("Xpto", { observacoes: "Receita de controle especial em 2 vias" })), false);
eq("receita azul no conteudo", podeRenovarReceita(r("Xpto", { conteudo: "Notificação de receita B (azul)" })), false);
eq("sem medicamento não oferece", podeRenovarReceita({ tipo: "receita", medicamento: "" }), false);
eq("atestado não renova", podeRenovarReceita({ tipo: "atestado", medicamento: "Losartana" }), false);
eq("palavra parcial não casa (litio x politica)", receitaControlada(r("Losartana", { conteudo: "conforme política" })), false);

eq("pedido comum", lerPedidoVinculado({ medicoId: "m" }), null);
eq("padrao explícito", lerPedidoVinculado({ tipoAtendimento: "padrao" }), null);
eq("tipo inválido", lerPedidoVinculado({ tipoAtendimento: "segunda_opiniao", consultaOrigemId: "c" }), "Tipo de atendimento inválido.");
eq("retorno sem origem", lerPedidoVinculado({ tipoAtendimento: "retorno" }), "Informe a consulta de origem.");
eq("retorno ok", lerPedidoVinculado({ tipoAtendimento: "retorno", consultaOrigemId: " c1 " }), { tipoAtendimento: "retorno", consultaOrigemId: "c1" });
eq("renovacao sem doc", lerPedidoVinculado({ tipoAtendimento: "renovacao", consultaOrigemId: "c1" }), "Informe a receita que será renovada.");
eq("renovacao ok", lerPedidoVinculado({ tipoAtendimento: "renovacao", consultaOrigemId: "c1", documentoOrigemId: "d1" }), { tipoAtendimento: "renovacao", consultaOrigemId: "c1", documentoOrigemId: "d1" });

const origem = { especialidade: "Cardiologia", data: "12 Out", motivoConsulta: "Pressão alta" };
eq("motivo retorno", motivoSugerido("retorno", origem), "Retorno da consulta de 12 Out: Pressão alta");
eq("motivo retorno rotina", motivoSugerido("retorno", { ...origem, motivoConsulta: "Consulta de rotina" }), "Retorno da consulta de 12 Out: Cardiologia");
eq("motivo renovacao", motivoSugerido("renovacao", origem, { medicamento: "Losartana 50 mg" }), "Renovação de receita: Losartana 50 mg (consulta de 12 Out)");

const dias = [
  { iso: "2026-10-20", horarios: [] },
  { iso: "2026-10-21", horarios: ["09:00", "10:00"] },
  { iso: "2026-11-18", horarios: ["14:00"] },
];
eq("sem sugestão: primeiro livre", escolherHorarioInicial(dias)?.hora, "09:00");
eq("com sugestão: a partir dela", escolherHorarioInicial(dias, "2026-11-10T00:00:00Z")?.dia.iso, "2026-11-18");
eq("sugestão além do horizonte: cai no primeiro", escolherHorarioInicial(dias, "2027-01-01")?.dia.iso, "2026-10-21");
eq("agenda vazia", escolherHorarioInicial([]), null);

const linha = { id: "p1", pacienteId: "u", medicoId: "m", documentoId: "d1", status: "xx", criadoEm: new Date("2026-10-19T12:00:00Z") };
eq("lê linha, status desconhecido vira pendente", lerPedidoRenovacao(linha)?.status, "pendente");
eq("lê data Date", lerPedidoRenovacao(linha)?.criadoEm, "2026-10-19T12:00:00.000Z");
eq("linha sem prescricao", lerPedidoRenovacao({ ...linha, documentoId: "" }), null);
const p2 = { ...lerPedidoRenovacao(linha)!, id: "p2", status: "renovada" as const, criadoEm: "2026-10-20T00:00:00.000Z" };
eq("pedido mais recente da receita", pedidoDaReceita([lerPedidoRenovacao(linha)!, p2], "d1")?.id, "p2");
eq("sem pedido", pedidoDaReceita([p2], "zz"), null);
eq("corpo sem receita", lerCorpoPedidoRenovacao({}), "Informe a receita que será renovada.");
eq("corpo ok", lerCorpoPedidoRenovacao({ documentoId: "d1", observacaoPaciente: "  " }), { documentoId: "d1", observacaoPaciente: null });

console.log(`atendimento-tipo: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
