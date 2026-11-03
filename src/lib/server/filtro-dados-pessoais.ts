/**
 * Filtro de dados pessoais no texto que a PACIENTE digita, antes de ir para a
 * IA (NVIDIA). Complementa anonimizar-ia/anonimizar-texto com nomes próprios
 * que o servidor NÃO conhece (ex.: "minha filha Ana Paula", "a Dra. Souza").
 *
 * Heurística (pede o Jurídico; não é perfeita, por isso o aviso fixo na tela):
 *  - nome conhecido da paciente (banco) → substituto;
 *  - CPF, telefone, e-mail, CEP, datas e endereço (anonimizarTexto);
 *  - 2+ palavras com inicial maiúscula seguidas (com "da/de/do/dos/das/e")
 *    que NÃO começam a frase → "[nome removido]";
 *  - 1 palavra com inicial maiúscula logo depois de um gatilho de pessoa
 *    ("meu filho", "minha mãe", "Dr.", "Dra.", "chamado/chamada", "sr./sra.")
 *    → "[nome removido]";
 *  - primeiros nomes comuns no Brasil (lista curta abaixo) em qualquer
 *    posição, se escritos com inicial maiúscula.
 * Palavras do app/saúde comuns em maiúscula (BION, SAMU, meses, dias,
 * siglas) ficam. Arquivo puro (testável sem banco).
 */
import { anonimizarTexto } from "./anonimizar-texto";

export const SUBSTITUTO_NOME_TERCEIRO = "[nome removido]";

const PARTICULAS = "(?:da|de|do|das|dos|e|d')";
const PALAVRA_MAIUSC = String.raw`\p{Lu}[\p{Ll}\p{M}'’-]+`;

/** Palavras capitalizadas que NÃO são nomes de pessoa. */
const NAO_NOMES = new Set(
  [
    "bion", "ia", "são", "santa", "santo", "rio", "belo", "horizonte", "porto", "alegre", "grande", "norte", "sul", "samu", "sus", "ubs", "upa", "brasil", "nvidia", "google", "deus", "covid", "aids", "hiv",
    "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo", "feira",
    "clínica", "médica", "geral", "pronto", "socorro", "hospital", "dor", "eu", "oi", "olá", "bom", "boa", "dia", "tarde", "noite",
  ].map((p) => p.normalize("NFC")),
);

/** Primeiros nomes muito comuns no Brasil (IBGE, Censo 2010, topo da lista). */
export const NOMES_COMUNS_BR = [
  "Maria", "José", "Ana", "João", "Antônio", "Antonio", "Francisco", "Carlos", "Paulo", "Pedro", "Lucas", "Luiz", "Luis",
  "Marcos", "Luís", "Gabriel", "Rafael", "Francisca", "Daniel", "Marcelo", "Bruno", "Eduardo", "Felipe", "Raimundo",
  "Rodrigo", "Antônia", "Adriana", "Juliana", "Márcia", "Fernanda", "Patrícia", "Aline", "Sandra", "Camila", "Amanda",
  "Bruna", "Jéssica", "Letícia", "Júlia", "Luciana", "Vanessa", "Mariana", "Gabriela", "Vera", "Vitória", "Larissa",
  "Cláudia", "Beatriz", "Rita", "Luana", "Sônia", "Renata", "Eliane", "Josefa", "Simone", "Natália", "Cristiane",
  "Carla", "Débora", "Rosângela", "Jaqueline", "Rosa", "Daniela", "Aparecida", "Marlene", "Terezinha", "Raimunda",
  "Andreia", "Fabiana", "Lúcia", "Raquel", "Ângela", "Rafaela", "Joana", "Luzia", "Elaine", "Daniele", "Regina",
  "Sebastião", "Matheus", "Mateus", "Thiago", "Tiago", "Alexandre", "Leonardo", "André", "Fernando", "Fábio", "Gustavo",
  "Vinícius", "Diego", "Leandro", "Ricardo", "Jorge", "Roberto", "Sérgio", "Manoel", "Manuel", "Miguel", "Arthur",
  "Heitor", "Davi", "Enzo", "Alice", "Helena", "Laura", "Valentina", "Sophia", "Sofia", "Isabela", "Manuela", "Lorena",
  "Marina", "Paula", "Alisson",
];
const SET_NOMES_COMUNS = new Set(NOMES_COMUNS_BR.map((n) => n.normalize("NFC")));

const ehNaoNome = (w: string) => NAO_NOMES.has(w.toLowerCase().normalize("NFC"));

const RE_SEQUENCIA = new RegExp(
  String.raw`${PALAVRA_MAIUSC}(?:\s+(?:${PARTICULAS}\s+)?${PALAVRA_MAIUSC})+`,
  "gu",
);
const RE_GATILHO = new RegExp(
  String.raw`(?<![\p{L}])((?:meu|minha|o|a)\s+(?:filho|filha|marido|esposa|esposo|mulher|mãe|mae|pai|irmão|irmao|irmã|irma|avó|avô|vó|vô|tio|tia|primo|prima|amigo|amiga|namorado|namorada|vizinho|vizinha|neto|neta|sogra|sogro|chefe|colega)\s+|(?:dr|dra|sr|sra|doutor|doutora|senhor|senhora)\.?\s+|(?:chamad[oa]|se chama|nome é|nome e)\s+)(${PALAVRA_MAIUSC})`,
  "giu",
);

/** Início de frase: começo do texto ou depois de . ! ? : ou quebra de linha. */
function inicioDeFrase(texto: string, i: number): boolean {
  const antes = texto.slice(0, i).replace(/[\s"'“(«-]+$/u, "");
  return antes === "" || /[.!?:\n]$/u.test(antes);
}

export function filtrarNomesProprios(texto: string): string {
  let t = texto.replace(RE_GATILHO, (_m, gat: string, nome: string) => (ehNaoNome(nome) ? `${gat}${nome}` : `${gat}${SUBSTITUTO_NOME_TERCEIRO}`));
  t = t.replace(RE_SEQUENCIA, (seq: string, i: number, todo: string) => {
    const palavras = seq.split(/\s+/u).filter((w) => /^\p{Lu}/u.test(w));
    if (palavras.some(ehNaoNome)) return seq;
    if (inicioDeFrase(todo, i)) {
      // "Ana Paula está com febre": a 1ª palavra pode ser só o começo da frase,
      // mas se for um nome comum a sequência toda é nome.
      if (!SET_NOMES_COMUNS.has(palavras[0].normalize("NFC"))) return seq;
    }
    return SUBSTITUTO_NOME_TERCEIRO;
  });
  t = t.replace(new RegExp(String.raw`(?<![\p{L}\[])(?<!(?:São|Santa|Santo|Rio|Dom|Porto)\s)${PALAVRA_MAIUSC}(?![\p{L}])`, "gu"), (w) =>
    SET_NOMES_COMUNS.has(w.normalize("NFC")) ? SUBSTITUTO_NOME_TERCEIRO : w,
  );
  // "[nome removido] [nome removido]" → um só
  return t.replace(/\[nome removido\](?:\s+\[nome removido\])+/gu, SUBSTITUTO_NOME_TERCEIRO);
}

/** Filtro completo do texto digitado pela paciente. */
export function filtrarDadosPessoais(
  texto: string,
  op: { nomesConhecidos?: (string | null | undefined)[]; substitutoNome?: string } = {},
): string {
  const base = anonimizarTexto(texto, { nomesPacientes: op.nomesConhecidos ?? [], substitutoNome: op.substitutoNome });
  return filtrarNomesProprios(base);
}

/** Aplica só às mensagens da PACIENTE (role "user"); prompt do sistema fica. */
export function filtrarMensagensDaPaciente<M extends { role: string; content: string }>(
  mensagens: M[],
  op: { nomesConhecidos?: (string | null | undefined)[]; substitutoNome?: string } = {},
): M[] {
  return mensagens.map((m) => (m.role === "user" ? { ...m, content: filtrarDadosPessoais(m.content, op) } : m));
}
