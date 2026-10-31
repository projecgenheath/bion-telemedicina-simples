/**
 * Testes do conteúdo sugerido do documento (lib/conteudo-documento.ts) —
 * melhoria nº 5 da auditoria médica: o texto nasce dos campos já
 * preenchidos, por tipo, e devolve "" sem os campos mínimos (a folha não
 * inventa texto e a validação de sempre continua valendo).
 * Rodar: bun src/lib/conteudo-documento.teste.ts
 */
import { gerarConteudoDocumento, rotuloPeriodoAfastamento } from "./conteudo-documento";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (Object.is(atual, esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}

// Receita completa: medicamento + posologia + duração + CID.
igual(
  "receita completa",
  gerarConteudoDocumento({ tipo: "receita", medicamento: "Loratadina 10 mg", posologia: "1 comprimido ao dia", duracao: "30 dias", cid: "J30.1" }),
  "Prescrevo Loratadina 10 mg — 1 comprimido ao dia, por 30 dias. CID: J30.1.",
);
// Receita sem duração nem CID: texto válido mesmo assim (≥10 caracteres).
igual(
  "receita mínima",
  gerarConteudoDocumento({ tipo: "receita", medicamento: "Dipirona 500 mg", posologia: "1 comprimido de 6/6h se dor" }),
  "Prescrevo Dipirona 500 mg — 1 comprimido de 6/6h se dor.",
);
// Receita sem posologia não gera (campo mínimo do tipo).
igual("receita sem posologia", gerarConteudoDocumento({ tipo: "receita", medicamento: "Dipirona 500 mg" }), "");
igual("receita sem medicamento", gerarConteudoDocumento({ tipo: "receita", posologia: "1 comprimido ao dia" }), "");
// Espaços ao redor são aparados.
igual(
  "receita com espaços",
  gerarConteudoDocumento({ tipo: "receita", medicamento: "  Dipirona 500 mg  ", posologia: " 1 comprimido ao dia " }),
  "Prescrevo Dipirona 500 mg — 1 comprimido ao dia.",
);

// Atestado com paciente e CID.
igual(
  "atestado completo",
  gerarConteudoDocumento({ tipo: "atestado", duracao: "3 dias", cid: "J06.9", pacienteNome: "Maria Silva" }),
  "Atesto, para os devidos fins, que o(a) paciente Maria Silva necessita de afastamento de suas atividades por 3 dias. CID: J06.9.",
);
// Atestado sem nome do paciente mantém a fórmula genérica.
igual(
  "atestado sem paciente",
  gerarConteudoDocumento({ tipo: "atestado", duracao: "1 dia" }),
  "Atesto, para os devidos fins, que o(a) paciente necessita de afastamento de suas atividades por 1 dia.",
);
// Atestado sem período não gera.
igual("atestado sem duração", gerarConteudoDocumento({ tipo: "atestado", pacienteNome: "Maria Silva" }), "");

// ── Atestado estruturado (item 32): tipo + período alimentam o texto ──
// Afastamento com período completo: o intervalo entra no texto.
igual(
  "atestado afastamento com período",
  gerarConteudoDocumento({
    tipo: "atestado",
    tipoAtestado: "afastamento",
    duracao: "3 dias",
    dataInicio: "30/10/2026",
    dataFim: "01/11/2026",
    cid: "J06.9",
    pacienteNome: "Maria Silva",
  }),
  "Atesto, para os devidos fins, que o(a) paciente Maria Silva necessita de afastamento de suas atividades por 3 dias, no período de 30/10/2026 a 01/11/2026. CID: J06.9.",
);
// Afastamento só com data inicial: "a partir de".
igual(
  "atestado afastamento só com início",
  gerarConteudoDocumento({ tipo: "atestado", tipoAtestado: "afastamento", duracao: "2 dias", dataInicio: "30/10/2026" }),
  "Atesto, para os devidos fins, que o(a) paciente necessita de afastamento de suas atividades por 2 dias, a partir de 30/10/2026.",
);
// Afastamento explícito sem datas = texto de antes (retrocompatível).
igual(
  "atestado afastamento sem datas",
  gerarConteudoDocumento({ tipo: "atestado", tipoAtestado: "afastamento", duracao: "1 dia" }),
  "Atesto, para os devidos fins, que o(a) paciente necessita de afastamento de suas atividades por 1 dia.",
);
// Comparecimento: atesta a presença na data, sem duração de afastamento.
igual(
  "atestado comparecimento",
  gerarConteudoDocumento({ tipo: "atestado", tipoAtestado: "comparecimento", dataInicio: "30/10/2026", cid: "Z02.7", pacienteNome: "Maria Silva" }),
  "Atesto, para os devidos fins, que o(a) paciente Maria Silva compareceu a consulta médica em 30/10/2026. CID: Z02.7.",
);
igual(
  "atestado comparecimento sem CID nem paciente",
  gerarConteudoDocumento({ tipo: "atestado", tipoAtestado: "comparecimento", dataInicio: "30/10/2026" }),
  "Atesto, para os devidos fins, que o(a) paciente compareceu a consulta médica em 30/10/2026.",
);
// Comparecimento sem data não gera (a data é o fato atestado).
igual("atestado comparecimento sem data", gerarConteudoDocumento({ tipo: "atestado", tipoAtestado: "comparecimento" }), "");

// ── Período: início + dias − 1, rótulos DD/MM/AAAA ─────────────────────
igual("período de 1 dia começa e termina no mesmo dia", JSON.stringify(rotuloPeriodoAfastamento("2026-10-30", 1)), JSON.stringify({ inicio: "30/10/2026", fim: "30/10/2026" }));
igual("período de 3 dias cruzando o mês", JSON.stringify(rotuloPeriodoAfastamento("2026-10-30", 3)), JSON.stringify({ inicio: "30/10/2026", fim: "01/11/2026" }));
igual("período com data inválida", rotuloPeriodoAfastamento("30/10/2026", 3), null);
igual("período com dias zero", rotuloPeriodoAfastamento("2026-10-30", 0), null);
igual("período sem data", rotuloPeriodoAfastamento("", 3), null);
igual("período com dias fracionados", rotuloPeriodoAfastamento("2026-10-30", 1.5), null);

// Exames: nasce do título, nos dois tipos (legado e atual).
igual(
  "exame_solicitado",
  gerarConteudoDocumento({ tipo: "exame_solicitado", titulo: "Hemograma completo" }),
  "Solicito a realização de: Hemograma completo.",
);
igual(
  "exame legado",
  gerarConteudoDocumento({ tipo: "exame", titulo: "Raio-X de tórax" }),
  "Solicito a realização de: Raio-X de tórax.",
);
igual("exame sem título", gerarConteudoDocumento({ tipo: "exame_solicitado", titulo: "  " }), "");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
