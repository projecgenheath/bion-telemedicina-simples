/**
 * Lógica pura da Evolução (Teleconsulta v2), sem banco nem Next — testável
 * com bun (evolucao-logica.teste.ts) e importável dos dois lados: as rotas
 * do servidor usam para aplicar NO SERVIDOR as mesmas regras que a UI
 * anuncia; antes, parte delas vivia só no cliente (ou duplicada numa rota).
 */

/**
 * Conduta preenchida? A conduta é gravada como JSON (a UI salva
 * { texto: "..." }); vazia, sem texto ou com qualquer outro formato sem
 * conteúdo não conta como preenchida.
 */
export function condutaPreenchida(condutaJson: string | null | undefined): boolean {
  if (!condutaJson) return false;
  let v: unknown;
  try {
    v = JSON.parse(condutaJson);
  } catch {
    return false;
  }
  if (typeof v === "string") return v.trim().length > 0;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.texto === "string") return o.texto.trim().length > 0;
    return Object.values(o).some((x) => typeof x === "string" && x.trim().length > 0);
  }
  return false;
}

/** Uma seção (JSON) tem algum texto de verdade? "{}" e {"texto":""} não têm. */
function secaoTemConteudo(json: string | null | undefined): boolean {
  if (!json) return false;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return false;
  }
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>).some(
      (x) => typeof x === "string" && x.trim().length > 0,
    );
  }
  return false;
}

export type EvolucaoConteudo = {
  dados: string;
  triagem: string;
  exames: string;
  medicamentos: string;
  conduta: string;
  cid: string | null;
  documentos: string;
};

/**
 * A evolução foi INICIADA pelo médico — ele escreveu algo nela (seção com
 * texto, CID ou documento anexado)? A linha da Evolucao nasce vazia na
 * primeira entrada do médico na sala (garantirEvolucao), mesmo sem ele
 * abrir o painel: linha EXISTIR não é ter iniciado. O casco intocado
 * (todas as seções "{}", sem CID, sem documentos) equivale a "sem
 * evolução" para as regras de conclusão. O campo livre `rascunho`
 * (estado de UI do autosave) NÃO conta: nenhum cliente o preenche com
 * conteúdo clínico.
 */
export function evolucaoIniciada(e: EvolucaoConteudo): boolean {
  return (
    secaoTemConteudo(e.dados) ||
    secaoTemConteudo(e.triagem) ||
    secaoTemConteudo(e.exames) ||
    secaoTemConteudo(e.medicamentos) ||
    secaoTemConteudo(e.conduta) ||
    (typeof e.cid === "string" && e.cid.trim().length > 0) ||
    secaoTemConteudo(e.documentos)
  );
}

/**
 * A evolução impede concluir a CONSULTA pelo atalho do Encerrar? Só
 * quando há evolução iniciada em rascunho com a conduta vazia: carimbar
 * essa evolução como "concluida" violaria a regra da própria evolução
 * (a rota de concluir a evolução recusa sem conduta). Sem evolução, com
 * o casco intocado ou com a conduta preenchida, nada muda.
 */
export function evolucaoImpedeConclusao(e: EvolucaoConteudo & { status: string }): boolean {
  return e.status === "rascunho" && evolucaoIniciada(e) && !condutaPreenchida(e.conduta);
}
