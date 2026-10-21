/**
 * LGPD — filtro de dados pessoais de PACIENTES no texto livre que o MÉDICO
 * digita no BION Copilot (chat da BION IA) antes de ir para o Google
 * (Gemini/Gemma). Complementa o anonimizar-ia.ts (que tira os dados do
 * próprio usuário logado) com:
 *  - nomes de pacientes que o servidor conhece (pacientes com consulta com
 *    esse médico) → "o paciente";
 *  - qualquer data dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa ou aaaa-mm-dd
 *    (possível data de nascimento) → "[data removida]";
 *  - endereços com logradouro + número ("Rua X, 123") → "[endereço removido]";
 *  - CPF, telefone, e-mail e CEP (por padrão de formato, via anonimizar-ia).
 *
 * Arquivo puro (sem "server-only") para o teste em anonimizar-texto.teste.ts.
 */
import { removerIdentificadores, SUBSTITUTO_NOME } from "./anonimizar-ia";

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

// Datas: dd/mm/aaaa (também com - ou .) e aaaa-mm-dd; aceita ano com 2 dígitos em dd/mm/aa.
const RE_DATA_BR = /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:\d{4}|\d{2})(?!\d)/g;
const RE_DATA_ISO = /(?<!\d)(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d)/g;
// CEP só com dígitos ("01310100") quando vem depois da palavra CEP.
const RE_CEP_PALAVRA = /\bCEP\s*:?\s*\d{5}-?\d{3}\b/giu;
// Logradouro + nome + número (opcional complemento). Heurístico, conservador.
const RE_ENDERECO = new RegExp(
  String.raw`(?<![\p{L}])(?:rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.|estrada|rodovia|praça|praca|largo|viela|beco|quadra|qd\.?|rod\.)\s+[\p{L}\p{N}'.\- ]{2,60}?,?\s*(?:n[º°o.]?\s*)?\d{1,6}(?:\s*[-,]\s*(?:apto?\.?|apartamento|bloco|casa|sala|conj\.?)\s*[\p{L}\p{N}]{1,6})*`,
  "giu",
);

function escapar(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reTermo(termo: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapar(termo)}(?![\\p{L}\\p{N}])`, "giu");
}

/** Nome completo + primeiro e último nome (≥ 3 letras, sem partículas). */
function termosDoNome(nome: string): string[] {
  const n = nome.trim().replace(/\s+/g, " ");
  if (n.length < 3) return [];
  const partes = n.split(" ").filter((p) => p.length >= 3 && !PARTICULAS.has(p.toLowerCase()));
  return [n, partes[0], partes.at(-1)].filter((x): x is string => Boolean(x));
}

export type OpcoesAnonimizarTexto = {
  /** Nomes de pacientes conhecidos pelo servidor. */
  nomesPacientes?: (string | null | undefined)[];
  /** Texto que entra no lugar do nome (padrão: "o paciente"). */
  substitutoNome?: string;
};

export function anonimizarTexto(texto: string, op: OpcoesAnonimizarTexto = {}): string {
  let t = texto;
  // 1) Nomes conhecidos, do mais longo para o mais curto (nome completo antes do primeiro nome).
  const termos = Array.from(new Set((op.nomesPacientes ?? []).flatMap((n) => termosDoNome(n ?? ""))));
  termos.sort((a, b) => b.length - a.length);
  for (const termo of termos) t = t.replace(reTermo(termo), op.substitutoNome || SUBSTITUTO_NOME);
  // 2) Endereço e CEP antes dos padrões numéricos (o número da casa não vira "telefone").
  t = t.replace(RE_CEP_PALAVRA, "[CEP removido]");
  t = t.replace(RE_ENDERECO, "[endereço removido]");
  // 3) Datas (possíveis datas de nascimento).
  t = t.replace(RE_DATA_ISO, "[data removida]");
  t = t.replace(RE_DATA_BR, "[data removida]");
  // 4) CPF, telefone, e-mail, CEP formatado (padrões genéricos do anonimizar-ia).
  return removerIdentificadores(t, {});
}

export function anonimizarMensagensTexto<M extends { content: string }>(mensagens: M[], op: OpcoesAnonimizarTexto): M[] {
  return mensagens.map((m) => ({ ...m, content: anonimizarTexto(m.content, op) }));
}
