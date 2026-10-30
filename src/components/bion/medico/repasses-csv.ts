/**
 * Exportação contábil (CSV) dos repasses do médico — gerada NO CLIENTE a
 * partir dos dados que a RepassesSheet já carregou (GET /api/medico/repasses
 * e /api/medico/repasses/[id]). Nenhum valor é recalculado por outra regra:
 * cada linha usa os centavos do próprio wire; a única derivação é a
 * APRESENTAÇÃO da comissão em % (comissão ÷ bruto da mesma linha), que é
 * razão de exibição, não regra de cálculo.
 *
 * Formato = o padrão de CSV do projeto (admin/auditoria/trilha.ts): BOM
 * UTF-8, separador vírgula, aspas só quando o campo contém vírgula, aspas
 * ou quebra de linha. Datas e moeda em pt-BR (fuso da clínica), como na
 * folha. Tipos estruturais mínimos (subconjuntos dos wires de
 * useDadosMedico) para o módulo não depender do hook.
 */

const FUSO = "America/Sao_Paulo";

export type ItemRepasseCsv = {
  tipo: string;
  data: string;
  paciente?: string | null;
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  liquidoCentavos: number;
};

export type AjusteRepasseCsv = {
  motivo: string;
  valorAplicadoCentavos: number;
  criadoEm: string;
};

export type TotaisRepasseCsv = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  ajustesCentavos: number;
  liquidoCentavos: number;
};

export type RepasseResumoCsv = TotaisRepasseCsv & {
  competencia: string;
  status: string;
  itens: number;
};

export type PreviaRepasseCsv = {
  competencia: string;
  totais: TotaisRepasseCsv;
  itens: ItemRepasseCsv[];
  ajustesPendentesRestantesCentavos: number;
};

export type DetalheRepasseCsv = TotaisRepasseCsv & {
  competencia: string;
  status: string;
  itens: ItemRepasseCsv[];
  ajustes: AjusteRepasseCsv[];
};

const ROTULO_TIPO: Record<string, string> = {
  consulta: "Consulta",
  multa_cancelamento: "Multa de cancelamento",
  multa_remarcacao: "Multa de remarcação",
  renovacao: "Renovação de receita",
};

const ROTULO_STATUS: Record<string, string> = {
  fechado: "Aguardando pagamento",
  pago: "Pago",
};

const ROTULO_MOTIVO: Record<string, string> = {
  reembolso: "Reembolso após o fechamento",
  saldo_anterior: "Saldo de ajuste anterior",
};

/** Igual ao csvLinha do projeto (auditoria): vírgula, aspas só quando precisa. */
export function csvLinhaRepasse(valores: (string | number | undefined)[]): string {
  return valores
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

const fmtNumero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos → "1.234,56" (sem "R$": número legível por planilha; o cabeçalho diz a moeda). */
export const fmtCentavosCsv = (centavos: number) => fmtNumero.format(centavos / 100);

/** Comissão em % da MESMA linha (comissão ÷ bruto), 1 casa: "10,0". Sem bruto, vazio. */
export function pctComissaoCsv(brutoCentavos: number, comissaoCentavos: number): string {
  if (brutoCentavos <= 0) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    (comissaoCentavos / brutoCentavos) * 100,
  );
}

/** "2026-10-04" → "04/10/2026" (competência já é dia SP) — mesmo formato da folha. */
export function fmtCompetenciaCsv(dia: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

/** ISO → "04/10/2026 14:32" no fuso da clínica — mesmo formato da folha. */
export function fmtDataHoraCsv(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: FUSO,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const CABECALHO_REPASSES_CSV = [
  "Data",
  "Tipo",
  "Paciente",
  "Status",
  "Bruto (R$)",
  "Comissão (R$)",
  "Comissão (%)",
  "Taxa do gateway (R$)",
  "Reembolsos (R$)",
  "Multas (R$)",
  "Ajustes (R$)",
  "Líquido (R$)",
];

type LinhaTotais = {
  data: string;
  tipo: string;
  paciente: string;
  status: string;
  totais: TotaisRepasseCsv;
  /** Itens individuais não têm coluna de ajustes: vazio em vez de 0. */
  ajustes?: boolean;
};

function linhaTotais({ data, tipo, paciente, status, totais, ajustes = true }: LinhaTotais): string {
  return csvLinhaRepasse([
    data,
    tipo,
    paciente,
    status,
    fmtCentavosCsv(totais.brutoCentavos),
    fmtCentavosCsv(totais.comissaoCentavos),
    pctComissaoCsv(totais.brutoCentavos, totais.comissaoCentavos),
    fmtCentavosCsv(totais.taxasCentavos),
    fmtCentavosCsv(totais.reembolsosCentavos),
    fmtCentavosCsv(totais.multasCentavos),
    ajustes ? fmtCentavosCsv(totais.ajustesCentavos) : "",
    fmtCentavosCsv(totais.liquidoCentavos),
  ]);
}

/** A prévia entra no histórico exportado só quando tem algo (itens ou valor). */
export function previaTemConteudo(previa: PreviaRepasseCsv): boolean {
  const t = previa.totais;
  return (
    previa.itens.length > 0 ||
    t.brutoCentavos !== 0 ||
    t.liquidoCentavos !== 0 ||
    previa.ajustesPendentesRestantesCentavos > 0
  );
}

/**
 * CSV do HISTÓRICO exibido na folha: uma linha por repasse (totais da
 * competência, como a lista mostra) + a prévia de hoje quando tem conteúdo.
 * O detalhe por paciente é o CSV do detalhe (csvDetalheRepasse).
 */
export function csvHistoricoRepasses(previa: PreviaRepasseCsv, repasses: RepasseResumoCsv[]): string {
  const linhas = [csvLinhaRepasse(CABECALHO_REPASSES_CSV)];
  if (previaTemConteudo(previa)) {
    linhas.push(
      linhaTotais({
        data: fmtCompetenciaCsv(previa.competencia),
        tipo: "Prévia do dia (em aberto)",
        paciente: "",
        status: "Em aberto",
        totais: previa.totais,
      }),
    );
  }
  for (const r of repasses) {
    linhas.push(
      linhaTotais({
        data: fmtCompetenciaCsv(r.competencia),
        tipo: `Fechamento do dia (${r.itens} ${r.itens === 1 ? "item" : "itens"})`,
        paciente: "",
        status: ROTULO_STATUS[r.status] ?? r.status,
        totais: r,
      }),
    );
  }
  return "\uFEFF" + linhas.join("\n");
}

/**
 * CSV do DETALHE de um repasse: uma linha por item (paciente, valores do
 * item), uma por ajuste aplicado e a linha de TOTAL com os totais do
 * próprio repasse — tudo dos dados já carregados na folha.
 */
export function csvDetalheRepasse(detalhe: DetalheRepasseCsv): string {
  const status = ROTULO_STATUS[detalhe.status] ?? detalhe.status;
  const linhas = [csvLinhaRepasse(CABECALHO_REPASSES_CSV)];
  for (const i of detalhe.itens) {
    linhas.push(
      linhaTotais({
        data: fmtDataHoraCsv(i.data),
        tipo: ROTULO_TIPO[i.tipo] ?? i.tipo,
        paciente: i.paciente || (i.tipo === "renovacao" ? "Pedido de renovação por mensagem" : ""),
        status,
        totais: { ...i, ajustesCentavos: 0 },
        ajustes: false,
      }),
    );
  }
  for (const a of detalhe.ajustes) {
    linhas.push(
      csvLinhaRepasse([
        fmtDataHoraCsv(a.criadoEm),
        `Ajuste — ${ROTULO_MOTIVO[a.motivo] ?? a.motivo}`,
        "",
        status,
        "",
        "",
        "",
        "",
        "",
        "",
        fmtCentavosCsv(a.valorAplicadoCentavos),
        fmtCentavosCsv(-a.valorAplicadoCentavos),
      ]),
    );
  }
  linhas.push(
    linhaTotais({
      data: fmtCompetenciaCsv(detalhe.competencia),
      tipo: "Total do repasse",
      paciente: "",
      status,
      totais: detalhe,
    }),
  );
  return "\uFEFF" + linhas.join("\n");
}

/** Baixa o CSV no navegador (mesmo padrão de download do projeto: Blob + objectURL). */
export function baixarCsvRepasse(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
