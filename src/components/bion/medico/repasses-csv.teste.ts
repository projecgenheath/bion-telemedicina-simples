/**
 * Testes da exportação CSV de repasses do médico (funções puras).
 * Rodar: bun src/components/bion/medico/repasses-csv.teste.ts
 * (datas no fuso da clínica — o resultado não pode depender do fuso do processo.)
 */
import {
  csvDetalheRepasse,
  csvHistoricoRepasses,
  csvLinhaRepasse,
  fmtCentavosCsv,
  pctComissaoCsv,
  previaTemConteudo,
  type DetalheRepasseCsv,
  type PreviaRepasseCsv,
} from "./repasses-csv";

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

/* ---------- formatação ---------- */
igual("fmtCentavosCsv milhar", fmtCentavosCsv(123456), "1.234,56");
igual("fmtCentavosCsv zero", fmtCentavosCsv(0), "0,00");
igual("fmtCentavosCsv negativo", fmtCentavosCsv(-5000), "-50,00");
igual("pctComissao 10%", pctComissaoCsv(20000, 2000), "10,0");
igual("pctComissao sem bruto", pctComissaoCsv(0, 0), "");
igual("escape virgula", csvLinhaRepasse(["a,b", "c"]), '"a,b",c');
igual("escape aspas", csvLinhaRepasse(['a"b']), '"a""b"');
igual("sem escape", csvLinhaRepasse(["abc", 12]), "abc,12");

/* ---------- histórico ---------- */
const previaVazia: PreviaRepasseCsv = {
  competencia: "2026-10-04",
  totais: { brutoCentavos: 0, comissaoCentavos: 0, taxasCentavos: 0, reembolsosCentavos: 0, multasCentavos: 0, ajustesCentavos: 0, liquidoCentavos: 0 },
  itens: [],
  ajustesPendentesRestantesCentavos: 0,
};
igual("previa vazia detectada", previaTemConteudo(previaVazia), false);

const historico = csvHistoricoRepasses(previaVazia, [
  {
    competencia: "2026-10-03",
    status: "pago",
    itens: 2,
    brutoCentavos: 30000,
    comissaoCentavos: 3000,
    taxasCentavos: 1000,
    reembolsosCentavos: 0,
    multasCentavos: 0,
    ajustesCentavos: 0,
    liquidoCentavos: 26000,
  },
]);
igual("historico comeca com BOM", historico.startsWith("\uFEFF"), true);
contem("historico cabecalho", historico, "Data,Tipo,Paciente,Status");
contem("historico linha do repasse", historico, '03/10/2026,Fechamento do dia (2 itens),,Pago,"300,00","30,00","10,0","10,00","0,00","0,00","0,00","260,00"');
igual("historico sem previa vazia", historico.includes("Prévia"), false);

const historicoComPrevia = csvHistoricoRepasses(
  {
    ...previaVazia,
    totais: { ...previaVazia.totais, brutoCentavos: 15000, comissaoCentavos: 1500, taxasCentavos: 500, liquidoCentavos: 13000 },
    itens: [
      { tipo: "consulta", data: "2026-10-04T13:00:00.000Z", brutoCentavos: 15000, comissaoCentavos: 1500, taxasCentavos: 500, reembolsosCentavos: 0, multasCentavos: 0, liquidoCentavos: 13000 },
    ],
  },
  [],
);
contem("historico com previa", historicoComPrevia, "Prévia do dia (em aberto)");
contem("historico previa status", historicoComPrevia, "Em aberto");

/* ---------- detalhe ---------- */
const detalhe: DetalheRepasseCsv = {
  competencia: "2026-10-03",
  status: "fechado",
  brutoCentavos: 30000,
  comissaoCentavos: 3000,
  taxasCentavos: 1000,
  reembolsosCentavos: 0,
  multasCentavos: 0,
  ajustesCentavos: 2000,
  liquidoCentavos: 24000,
  itens: [
    {
      tipo: "consulta",
      data: "2026-10-03T14:30:00.000Z", // 11:30 em São Paulo
      paciente: "Maria Silva, Jr.",
      brutoCentavos: 30000,
      comissaoCentavos: 3000,
      taxasCentavos: 1000,
      reembolsosCentavos: 0,
      multasCentavos: 0,
      liquidoCentavos: 26000,
    },
  ],
  ajustes: [{ motivo: "reembolso", valorAplicadoCentavos: 2000, criadoEm: "2026-10-03T15:00:00.000Z" }],
};
const csvDetalhe = csvDetalheRepasse(detalhe);
contem("detalhe paciente com virgula escapado", csvDetalhe, '"Maria Silva, Jr."');
contem("detalhe data SP", csvDetalhe, '"03/10/2026, 11:30"');
contem("detalhe tipo consulta", csvDetalhe, "Consulta");
contem("detalhe status rotulo", csvDetalhe, "Aguardando pagamento");
contem("detalhe ajuste", csvDetalhe, "Ajuste — Reembolso após o fechamento");
contem("detalhe ajuste liquido negativo", csvDetalhe, '"-20,00"');
contem("detalhe total", csvDetalhe, "Total do repasse");
contem("detalhe total liquido", csvDetalhe, '"240,00"');

console.log(`\nrepasses-csv: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
