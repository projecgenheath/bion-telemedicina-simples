/**
 * Testes das derivações da etapa 3 (mensagens, documentos, saúde e exames do paciente).
 * Rodar: bun src/components/bion/paciente/etapa3/etapa3-dados.teste.ts
 */
import type { Mensagem } from "@/lib/bion-tipos";
import {
  avisoRenovacaoBloqueada,
  contarDocumentos,
  dataBR,
  horaCurta,
  iniciaisNome,
  linhasDaConversa,
  previaMensagem,
  rotuloDia,
  seloCancelado,
  situacaoExame,
} from "./etapa3-dados";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${JSON.stringify(obtido)} — esperado ${JSON.stringify(esperado)}`);
  }
}

// Datas no fuso da clínica (UTC-3): 02:30Z do dia 23 ainda é dia 22 em São Paulo.
igual("dataBR fuso", dataBR("2026-11-23T02:30:00Z"), "22/11/2026");
igual("dataBR vazia", dataBR(null), "");
igual("dataBR inválida", dataBR("xx"), "");

// Selo "Cancelado em dd/mm/aaaa"
igual("selo cancelado", seloCancelado({ status: "cancelado", canceladoEm: "2026-11-22T15:00:00Z" }), "Cancelado em 22/11/2026");
igual("selo sem data", seloCancelado({ status: "cancelado", canceladoEm: null }), "Cancelado");
igual("selo emitido", seloCancelado({ status: "emitido", canceladoEm: null }), null);
igual("selo sem status", seloCancelado({}), null);

// Aviso de renovação bloqueada
const base = { tipo: "receita" as const, titulo: "Receita", conteudo: "", status: "emitido" as const };
igual("renova ok", avisoRenovacaoBloqueada({ ...base, medicamento: "Losartana 50 mg" }), null);
igual("renova cancelada", avisoRenovacaoBloqueada({ ...base, status: "cancelado", medicamento: "Losartana 50 mg" }), "Renovação bloqueada: esta receita foi cancelada pelo médico.");
igual("renova sem nome", avisoRenovacaoBloqueada({ ...base, medicamento: "" }), "Renovação só em consulta: a receita não traz o nome do medicamento.");
igual("renova controlado", avisoRenovacaoBloqueada({ ...base, medicamento: "Clonazepam 2 mg", controlado: true }), "Renovação só em consulta: medicamento controlado.");
igual("renova controlado pela lista", avisoRenovacaoBloqueada({ ...base, medicamento: "Clonazepam 2 mg" }), "Renovação só em consulta: medicamento controlado.");
igual("atestado não renova", avisoRenovacaoBloqueada({ ...base, tipo: "atestado" }), null);

// Contagem sem cancelados
igual(
  "contagem",
  contarDocumentos([
    { tipo: "receita", status: "emitido" },
    { tipo: "receita", status: "cancelado" },
    { tipo: "atestado" },
    { tipo: "exame" },
    { tipo: "exame_solicitado", status: "emitido" },
  ]),
  { receitas: 1, atestados: 1, pedidos: 2 },
);

// Horas e dias (agora = 24/11/2026 09:42 em São Paulo)
const agora = Date.parse("2026-11-24T12:42:00Z");
igual("hora hoje", horaCurta(Date.parse("2026-11-24T11:12:00Z"), agora), "08:12");
igual("ontem", horaCurta(Date.parse("2026-11-23T20:00:00Z"), agora), "Ontem");
igual("dia antigo", horaCurta(Date.parse("2026-11-15T20:00:00Z"), agora), "15/11");
igual("rótulo hoje", rotuloDia(Date.parse("2026-11-24T11:12:00Z"), agora), "Hoje");
igual("rótulo ontem", rotuloDia(Date.parse("2026-11-23T11:12:00Z"), agora), "Ontem");
igual("rótulo data", rotuloDia(Date.parse("2026-11-12T11:12:00Z"), agora), "12 de novembro");
igual("rótulo outro ano", rotuloDia(Date.parse("2025-11-12T11:12:00Z"), agora), "12 de novembro de 2025");

// Balões agrupados
const msg = (id: string, deId: string, iso: string): Mensagem => ({ id, deId, de: "", paraId: "", para: "", texto: id, lida: true, minha: deId === "eu", quando: "", ts: Date.parse(iso) });
const linhas = linhasDaConversa([
  msg("a", "eu", "2026-11-23T11:00:00Z"),
  msg("b", "eu", "2026-11-24T11:00:00Z"),
  msg("c", "eu", "2026-11-24T11:03:00Z"),
  msg("d", "med", "2026-11-24T11:04:00Z"),
  msg("e", "med", "2026-11-24T11:20:00Z"),
]);
igual("novo dia", linhas.map((l) => l.novoDia), [true, true, false, false, false]);
igual("junta", linhas.map((l) => l.juntaComProxima), [false, true, false, false, false]);

igual("iniciais dra", iniciaisNome("Dra. Helena Exemplo"), "HE");
igual("iniciais dr", iniciaisNome("Dr. Paulo Nery"), "PN");
igual("iniciais um nome", iniciaisNome("Suporte"), "S");
igual("prévia minha", previaMensagem({ texto: "Oi  doutora", minha: true }), "Você: Oi doutora");
igual("prévia vazia", previaMensagem(undefined), "Sem mensagens ainda");

// Exames
igual("exame normal", situacaoExame({ itens: [{ nome: "Glicose", valor: 92, refMin: 70, refMax: 99 }] }), { alterado: false, texto: "Normal" });
igual("exame alterado", situacaoExame({ itens: [{ nome: "LDL", valor: 142, refMax: 130 }, { nome: "HDL", valor: 52, refMin: 40 }] }), { alterado: true, texto: "Alterado: LDL" });
igual("exame sem itens", situacaoExame({ itens: [] }), { alterado: false, texto: "Sem resultados lidos" });

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
