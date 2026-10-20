/**
 * Testes de lib/atendimento-tipo.ts (retorno e renovação de receita).
 * Rodar: bun src/lib/atendimento-tipo.teste.ts
 */
import {
  ehViolacaoUnica,
  fimRetornoGratis,
  jaUsouRetornoGratis,
  retornoEhGratis,
  ultimoDiaRetornoGratis,
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
  statusAposFalhaDoMedico,
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

const r = (medicamento: string, extra: Partial<{ observacoes: string; conteudo: string; controlado: boolean }> = {}) => ({ tipo: "receita", medicamento, ...extra });
eq("losartana renova", podeRenovarReceita(r("Losartana 50 mg")), true);
eq("metformina renova", podeRenovarReceita(r("Metformina 850mg")), true);
eq("clonazepam bloqueia", podeRenovarReceita(r("Clonazepam 2 mg")), false);
eq("Rivotril bloqueia", podeRenovarReceita(r("RIVOTRIL gotas")), false);
eq("sertralina (C1) bloqueia", podeRenovarReceita(r("Sertralina 50mg")), false);
eq("acento: codeína bloqueia", podeRenovarReceita(r("Paracetamol + Codeína")), false);
eq("ácido valpróico bloqueia", podeRenovarReceita(r("Ácido valproico 500")), false);
eq("controle especial nas obs", podeRenovarReceita(r("Xpto", { observacoes: "Receita de controle especial em 2 vias" })), false);
eq("receita azul no conteudo", podeRenovarReceita(r("Xpto", { conteudo: "Notificação de receita B (azul)" })), false);
eq("Documento.controlado=true bloqueia mesmo sem substância", podeRenovarReceita(r("Losartana 50 mg", { controlado: true })), false);
eq("controlado=false ainda usa a lista (doc antigo)", podeRenovarReceita(r("Clonazepam 2 mg", { controlado: false })), false);
eq("controlado=false + substância comum renova", podeRenovarReceita(r("Losartana 50 mg", { controlado: false })), true);
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

eq("cancelado é status válido", lerPedidoRenovacao({ ...linha, status: "cancelado" })?.status, "cancelado");
eq("consultaId só em chamada_marcada", lerPedidoRenovacao({ ...linha, status: "renovada", consultaId: "c9" })?.consultaId, null);
eq("consultaId em chamada_marcada", lerPedidoRenovacao({ ...linha, status: "chamada_marcada", consultaId: "c9" })?.consultaId, "c9");
eq("P2002", ehViolacaoUnica({ code: "P2002" }), true);
eq("P2010/23505", ehViolacaoUnica({ code: "P2010", meta: { code: "23505" } }), true);
eq("outro erro", ehViolacaoUnica({ code: "P2010", meta: { code: "42P01" }, message: "relation does not exist" }), false);

// Retorno grátis em 30 dias (origem: 01/10 às 22:30 SP = 02/10 01:30Z)
const orig = "2026-10-02T01:30:00.000Z";
eq("fim grátis = 01/11 00:00 SP", fimRetornoGratis(orig).toISOString(), "2026-11-01T03:00:00.000Z");
eq("último dia grátis 31/10", ultimoDiaRetornoGratis(orig), "31/10");
eq("31/10 23:00 SP grátis", retornoEhGratis(orig, "2026-11-01T02:00:00.000Z", false), true);
eq("01/11 00:00 SP pago", retornoEhGratis(orig, "2026-11-01T03:00:00.000Z", false), false);
eq("dentro do prazo mas já usou", retornoEhGratis(orig, "2026-10-10T12:00:00.000Z", true), false);
eq("virada de mês curto", ultimoDiaRetornoGratis("2026-01-31T12:00:00.000Z"), "02/03");
eq("sem retornos: não usou", jaUsouRetornoGratis([]), false);
eq("grátis ativo: usou", jaUsouRetornoGratis([{ status: "confirmada", valor: 0 }]), true);
eq("grátis concluído: usou", jaUsouRetornoGratis([{ status: "concluida", valor: 0 }]), true);
eq("grátis cancelado: devolve", jaUsouRetornoGratis([{ status: "cancelada", valor: 0 }]), false);
eq("só retorno pago: não usou", jaUsouRetornoGratis([{ status: "confirmada", valor: 150 }]), false);
eq("médico falha, paga: aguarda", statusAposFalhaDoMedico({ pago: true, valor: 150 }), "aguardando_reagendamento");
eq("médico falha, grátis: cancela", statusAposFalhaDoMedico({ pago: true, valor: 0 }), "cancelada");
eq("médico falha, não paga: cancela", statusAposFalhaDoMedico({ pago: false, valor: 150 }), "cancelada");
eq("valor Decimal-like 0", statusAposFalhaDoMedico({ pago: true, valor: { toString: () => "0.00" } }), "cancelada");
eq("grátis cancelado pelo médico devolve o direito", jaUsouRetornoGratis([{ status: statusAposFalhaDoMedico({ pago: true, valor: 0 }), valor: 0 }]), false);

console.log(`atendimento-tipo: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
