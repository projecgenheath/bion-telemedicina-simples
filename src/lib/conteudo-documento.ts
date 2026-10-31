/**
 * Conteúdo sugerido do documento clínico (melhoria nº 5 da auditoria
 * médica): a folha de emissão montava o formulário com medicamento,
 * posologia e duração — mas o `conteudo` (obrigatório, ≥10 caracteres na
 * API) partia de um textarea VAZIO e o médico reescrevia à mão o que já
 * tinha acabado de preencher. Aqui o texto nasce dos campos e é só um
 * ponto de partida: a folha o pré-preenche de forma EDITÁVEL e regenera
 * enquanto o médico não tocar no texto; depois da primeira edição manual,
 * o texto é dele e nunca é sobrescrito.
 *
 * Função pura, sem efeitos: devolve "" quando faltam os campos mínimos do
 * tipo (a folha mantém o campo vazio e a validação de sempre pede o texto).
 */
export type CamposConteudoDocumento = {
  tipo: "receita" | "atestado" | "exame" | "exame_solicitado";
  /** Título do documento (na solicitação de exames, é o nome do exame). */
  titulo?: string | null;
  medicamento?: string | null;
  posologia?: string | null;
  /** Receita: duração do tratamento. Atestado: período de afastamento. */
  duracao?: string | null;
  cid?: string | null;
  /** Nome do paciente (usado no texto do atestado). */
  pacienteNome?: string | null;
  /**
   * Atestado estruturado (item 32 da auditoria de melhorias): tipo do
   * atestado e o período já formatado. Campos NOVOS e opcionais — quem
   * não passa continua com o texto de antes, e o que vai ao servidor
   * (o campo `conteudo` resultante) não muda de natureza.
   */
  tipoAtestado?: "afastamento" | "comparecimento";
  /** Rótulo da data inicial ("30/10/2026") — vindo de rotuloPeriodoAfastamento. */
  dataInicio?: string | null;
  /** Rótulo da data final do afastamento ("01/11/2026"); comparecimento não usa. */
  dataFim?: string | null;
};

/**
 * Período de afastamento a partir da data inicial (ISO "AAAA-MM-DD", do
 * input type=date) e do número de dias: o fim é início + dias − 1 (o
 * primeiro dia conta). Rótulos em "DD/MM/AAAA" prontos para o texto do
 * atestado. null para entrada inválida (data malformada ou dias < 1).
 */
export function rotuloPeriodoAfastamento(
  dataInicioIso: string | null | undefined,
  dias: number,
): { inicio: string; fim: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataInicioIso ?? "").trim());
  if (!m || !Number.isInteger(dias) || dias < 1) return null;
  const ini = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(ini.getTime())) return null;
  const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + dias - 1);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
  return { inicio: fmt(ini), fim: fmt(fim) };
}

const limpo = (v: string | null | undefined) => (v ?? "").trim();

export function gerarConteudoDocumento(c: CamposConteudoDocumento): string {
  const cid = limpo(c.cid);
  const trechoCid = cid ? ` CID: ${cid}.` : "";

  if (c.tipo === "receita") {
    const medicamento = limpo(c.medicamento);
    const posologia = limpo(c.posologia);
    if (!medicamento || !posologia) return "";
    const duracao = limpo(c.duracao);
    return `Prescrevo ${medicamento} — ${posologia}${duracao ? `, por ${duracao}` : ""}.${trechoCid}`;
  }

  if (c.tipo === "atestado") {
    const paciente = limpo(c.pacienteNome);
    const quem = paciente ? `o(a) paciente ${paciente}` : "o(a) paciente";
    const inicio = limpo(c.dataInicio);
    if (c.tipoAtestado === "comparecimento") {
      // Comparecimento não tem duração de afastamento: o texto atesta a
      // presença na consulta na data informada.
      if (!inicio) return "";
      return `Atesto, para os devidos fins, que ${quem} compareceu a consulta médica em ${inicio}.${trechoCid}`;
    }
    const duracao = limpo(c.duracao);
    if (!duracao) return "";
    const fim = limpo(c.dataFim);
    const periodo =
      inicio && fim ? `, no período de ${inicio} a ${fim}` : inicio ? `, a partir de ${inicio}` : "";
    return `Atesto, para os devidos fins, que ${quem} necessita de afastamento de suas atividades por ${duracao}${periodo}.${trechoCid}`;
  }

  // exame / exame_solicitado: o "conteúdo" é a solicitação em si — nasce do
  // título (nome do exame) e o médico complementa com a justificativa.
  const titulo = limpo(c.titulo);
  if (!titulo) return "";
  return `Solicito a realização de: ${titulo}.`;
}
