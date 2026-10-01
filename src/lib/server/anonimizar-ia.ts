/**
 * M6 (auditoria do perfil do paciente) — tira identificadores DIRETOS do
 * paciente do texto que vai para o modelo de IA externo (Gemini/Gemma e
 * demais canais), mantendo o conteúdo clínico.
 *
 * Remove/substitui:
 *  - nome completo, primeiro e último nome do paciente (valores do cadastro);
 *  - e-mail, CPF, telefone e CEP (por padrão de formato, em qualquer texto,
 *    inclusive o que o próprio paciente digitou no chat);
 *  - CPF, telefone e data de nascimento EXATA do cadastro (por valor).
 * Não há campo de endereço no cadastro; endereço digitado em texto livre não
 * é detectável com segurança (só o CEP é removido).
 *
 * Arquivo puro (sem "server-only") para os testes de
 * scripts/teste_validar_perfil.ts.
 */

export type IdentificadoresPaciente = {
  nome?: string | null;
  email?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  /** "YYYY-MM-DD" */
  dataNascimento?: string | null;
  /** Texto que entra no lugar do nome (padrão: "o paciente"). */
  substitutoNome?: string;
};

export const SUBSTITUTO_NOME = "o paciente";

const RE_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const RE_CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}(?!\d)/g;
// DDD + 8/9 dígitos, com ou sem +55, parênteses, espaço ou hífen (≥ 10 dígitos).
const RE_TELEFONE = /(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?!\d)/g;
const RE_CEP = /(?<!\d)\d{5}-\d{3}(?!\d)/g;

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

function escapar(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reTermo(termo: string) {
  // Limite de palavra com letras acentuadas (\b não entende "Á", "ç"…).
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapar(termo)}(?![\\p{L}\\p{N}])`, "giu");
}

/** Variações de um valor só com dígitos: "52998224725" casa com "529.982.247-25" etc. */
function reDigitos(digitos: string) {
  return new RegExp(`(?<!\\d)${digitos.split("").map(escapar).join("[\\s().-]*")}(?!\\d)`, "g");
}

export function removerIdentificadores(texto: string, ids: IdentificadoresPaciente): string {
  let t = texto;

  // 1) Valores exatos do cadastro (antes dos padrões genéricos).
  const cpf = (ids.cpf ?? "").replace(/\D/g, "");
  if (cpf.length === 11) t = t.replace(reDigitos(cpf), "[CPF removido]");
  const tel = (ids.telefone ?? "").replace(/\D/g, "");
  if (tel.length >= 8) t = t.replace(reDigitos(tel.length > 11 ? tel.slice(-11) : tel), "[telefone removido]");
  const nasc = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ids.dataNascimento ?? "");
  if (nasc) {
    const [, a, m, d] = nasc;
    for (const f of [`${d}/${m}/${a}`, `${d}-${m}-${a}`, `${d}.${m}.${a}`, `${a}-${m}-${d}`]) {
      t = t.replace(reTermo(f), "[data de nascimento removida]");
    }
  }
  const email = (ids.email ?? "").trim();
  if (email) t = t.replace(reTermo(email), "[e-mail removido]");

  // 2) Nome: completo, depois primeiro e último (≥ 3 letras, sem partículas).
  const nome = (ids.nome ?? "").trim().replace(/\s+/g, " ");
  if (nome.length >= 3) {
    const partes = nome.split(" ").filter((p) => p.length >= 3 && !PARTICULAS.has(p.toLowerCase()));
    const termos = Array.from(new Set([nome, partes[0], partes.at(-1)].filter((x): x is string => Boolean(x))));
    termos.sort((a, b) => b.length - a.length);
    for (const termo of termos) t = t.replace(reTermo(termo), ids.substitutoNome || SUBSTITUTO_NOME);
  }

  // 3) Padrões genéricos (dados de terceiros ou digitados de outro jeito).
  t = t.replace(RE_EMAIL, "[e-mail removido]");
  t = t.replace(RE_CPF, "[CPF removido]");
  t = t.replace(RE_TELEFONE, "[telefone removido]");
  t = t.replace(RE_CEP, "[CEP removido]");
  return t;
}

export function anonimizarMensagensIa<M extends { content: string }>(mensagens: M[], ids: IdentificadoresPaciente): M[] {
  return mensagens.map((m) => ({ ...m, content: removerIdentificadores(m.content, ids) }));
}
