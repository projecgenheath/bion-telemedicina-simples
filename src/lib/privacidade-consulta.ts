/**
 * Privacidade da consulta (decisão do Alisson, 20/10/2026): o conteúdo
 * clínico e a conversa da teleconsulta são só do médico e do paciente.
 * O admin continua vendo o que precisa para operar (agenda, status,
 * pagamento, contagens), mas nunca o conteúdo: triagem/anamnese, texto de
 * receitas e atestados (CID, medicamento, posologia, observações) e arquivos
 * clínicos.
 *
 * Funções puras, usadas por lib/server/dados.ts e
 * lib/server/arquivos-acesso.ts.
 */

export type Papel = "PACIENTE" | "MEDICO" | "ADMIN";

/** Admin não recebe anamnese/triagem no bootstrap. */
export function adminVeAnamnese(role: Papel | string): boolean {
  return role !== "ADMIN";
}

/** Admin não baixa arquivo clínico (exames, laudos, anexos da consulta). */
export function adminBaixaArquivoClinico(role: Papel | string): boolean {
  return role !== "ADMIN";
}

type DocumentoClinico = {
  conteudo: string;
  medicamento?: string | null;
  posologia?: string | null;
  duracao?: string | null;
  observacoes?: string | null;
  cid?: string | null;
};

/**
 * Documento como o admin vê: tipo, título, médico, paciente e data ficam
 * (contagens, relatórios, LGPD); o conteúdo clínico sai.
 */
export function documentoParaPapel<T extends DocumentoClinico>(doc: T, role: Papel | string): T {
  if (role !== "ADMIN") return doc;
  const out: T = { ...doc, conteudo: "", medicamento: null, posologia: null, duracao: null, observacoes: null, cid: null };
  // Auditoria admin 09/11: o documento levava ao admin o CPF e a data de
  // nascimento do paciente EM CLARO (vão no PDF da receita), furando a
  // máscara do painel e o "revelar com motivo" auditado. O admin não gera
  // o PDF: os dois campos saem.
  delete (out as { pacienteCpf?: unknown }).pacienteCpf;
  delete (out as { pacienteNascimento?: unknown }).pacienteNascimento;
  return out;
}

/**
 * Consulta como o admin vê (auditoria admin 09/11): o resumo do médico
 * ("Resumo da consulta" da sala) é conteúdo clínico e nenhuma tela do admin
 * o usa — sai. Agenda, status, pagamento e o motivo informado no
 * agendamento continuam.
 */
export function consultaParaPapel<T extends { resumoMedico?: string | null }>(c: T, role: Papel | string): T {
  if (role !== "ADMIN" || c.resumoMedico === undefined) return c;
  const out: T = { ...c };
  delete out.resumoMedico;
  return out;
}
