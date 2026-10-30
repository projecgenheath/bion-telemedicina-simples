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
};

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
    const duracao = limpo(c.duracao);
    if (!duracao) return "";
    const paciente = limpo(c.pacienteNome);
    return `Atesto, para os devidos fins, que ${paciente ? `o(a) paciente ${paciente}` : "o(a) paciente"} necessita de afastamento de suas atividades por ${duracao}.${trechoCid}`;
  }

  // exame / exame_solicitado: o "conteúdo" é a solicitação em si — nasce do
  // título (nome do exame) e o médico complementa com a justificativa.
  const titulo = limpo(c.titulo);
  if (!titulo) return "";
  return `Solicito a realização de: ${titulo}.`;
}
