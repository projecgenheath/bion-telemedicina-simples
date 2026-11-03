/**
 * Filtro de dados pessoais no texto que a PACIENTE digita, antes de ir para a
 * IA (NVIDIA). Complementa anonimizar-ia/anonimizar-texto com nomes próprios
 * que o servidor NÃO conhece (ex.: "minha filha Ana Paula", "a Dra. Souza").
 *
 * Heurística (pede o Jurídico; não é perfeita, por isso o aviso fixo na tela):
 *  - nome conhecido da paciente (banco) → substituto;
 *  - CPF, telefone, e-mail, CEP, datas e endereço (anonimizarTexto);
 *  - sequências com inicial maiúscula (com "da/de/do/dos/das/e"): viram um
 *    único "[nome removido]" quando têm nome comum, palavra ambígua ao lado de
 *    outra (Rosa Maria Souza), 2+ palavras no meio da frase, ou vêm depois de
 *    gatilho forte (Dr., Dra., "minha filha"…) ou fraco ("com a Rosa");
 *  - FIXOS (Hospital, Clínica, São, Santa, Rua, meses…) cortam a sequência:
 *    dali em diante fica ("Carla Mendes Hospital" → "[nome removido] Hospital");
 *  - AMBIGUOS (Rosa, Vitória, Aparecida, Natal…) sozinhos e sem gatilho ficam
 *    ("moro em Vitória", "pele Rosa").
 * Palavras do app/saúde comuns em maiúscula (BION, SAMU, meses, dias,
 * siglas) ficam. Arquivo puro (testável sem banco).
 */
import { anonimizarTexto } from "./anonimizar-texto";

export const SUBSTITUTO_NOME_TERCEIRO = "[nome removido]";

const PARTICULAS = "(?:da|de|do|das|dos|e|d')";
const PALAVRA_MAIUSC = String.raw`\p{Lu}[\p{Ll}\p{M}'’-]+`;

const conjunto = (l: string[]) => new Set(l.map((p) => p.toLowerCase().normalize("NFC")));

/**
 * (a) Instituição/lugar/termo fixo: a partir desta palavra a sequência fica
 * ("Hospital Santa Maria", "São Paulo", "Clínica Médica"). O que vem ANTES
 * dela ainda pode ser nome ("Carla Mendes Hospital" → "[nome removido] Hospital").
 */
const FIXOS = conjunto([
  "hospital", "clínica", "clinica", "casa", "posto", "laboratório", "laboratorio", "farmácia", "farmacia", "unimed", "pronto", "socorro",
  "são", "sao", "santa", "santo", "rio", "belo", "horizonte", "porto", "alegre", "campo", "grande", "norte", "sul", "dom", "brasil",
  "rua", "avenida", "av", "praça", "praca", "alameda", "travessa", "rodovia", "estrada",
  "bion", "ia", "samu", "sus", "ubs", "upa", "nvidia", "google", "deus", "covid", "aids", "hiv",
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo", "feira",
  "médica", "medica", "geral", "dor", "eu", "oi", "olá", "bom", "boa", "dia", "tarde", "noite",
]);

/**
 * (b) Ambíguas: parecem nome, mas também são lugar/cor/palavra comum. Ficam
 * SÓ quando sozinhas sem gatilho ("moro em Vitória", "pele Rosa"); ao lado de
 * outro nome/sobrenome ou depois de um gatilho (Dra., "com a", "minha filha")
 * viram nome.
 */
const AMBIGUOS = conjunto([
  "vitória", "aparecida", "rosa", "natal", "esperança", "glória", "luz", "paz", "graça", "conceição", "lourdes", "belém", "palmas",
]);

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

const chave = (w: string) => w.toLowerCase().normalize("NFC");
const ehFixo = (w: string) => FIXOS.has(chave(w));
const ehAmbiguo = (w: string) => AMBIGUOS.has(chave(w));
const ehNomeComum = (w: string) => SET_NOMES_COMUNS.has(w.normalize("NFC")) && !ehAmbiguo(w);

/** Sequência de 1+ palavras com maiúscula (com partículas entre elas). */
const RE_SEQUENCIA = new RegExp(
  String.raw`(?<![\p{L}\[])${PALAVRA_MAIUSC}(?:\s+(?:${PARTICULAS}\s+)?${PALAVRA_MAIUSC})*(?![\p{L}])`,
  "gu",
);

/** Gatilho forte: o que vem depois é pessoa (qualquer palavra com maiúscula). */
const RE_GATILHO_FORTE = new RegExp(
  String.raw`(?:^|[^\p{L}])(?:(?:meu|minha|o|a)\s+(?:filho|filha|marido|esposa|esposo|mulher|mãe|mae|pai|irmão|irmao|irmã|irma|avó|avô|vó|vô|tio|tia|primo|prima|amigo|amiga|namorado|namorada|vizinho|vizinha|neto|neta|sogra|sogro|chefe|colega)|dr|dra|sr|sra|doutor|doutora|senhor|senhora|chamad[oa]|se chama|nome é|nome e)\.?\s+$`,
  "iu",
);
/** Gatilho fraco ("com a Rosa"): só torna nome uma palavra ambígua. */
const RE_GATILHO_FRACO = /(?:^|[^\p{L}])com\s+(?:a|o)\s+$/iu;

/** Início de frase: começo do texto ou depois de . ! ? : ou quebra de linha. */
function inicioDeFrase(texto: string, i: number): boolean {
  const antes = texto.slice(0, i).replace(/[\s"'“(«-]+$/u, "");
  return antes === "" || /[.!?:\n]$/u.test(antes);
}

/** "moro em Vitória", "sou de Aparecida", "no Rio": provável lugar, não pessoa. */
function depoisDeLugar(texto: string, i: number): boolean {
  return /(?:^|[^\p{L}])(?:em|de|no|na|do|da|nos|nas)\s+$/iu.test(texto.slice(Math.max(0, i - 8), i));
}

/**
 * Decide, numa sequência capitalizada, de que palavra (índice) começa o nome;
 * -1 = não é nome. `palavras` já exclui a parte fixa (instituição/lugar).
 */
function inicioDoNome(palavras: string[], antes: string, todo: string, i: number): number {
  if (!palavras.length) return -1;
  const forte = RE_GATILHO_FORTE.test(antes);
  if (forte) return 0;
  const idxComum = palavras.findIndex(ehNomeComum);
  if (palavras.length === 1) {
    const w = palavras[0];
    if (ehNomeComum(w)) return 0;
    if (ehAmbiguo(w) && RE_GATILHO_FRACO.test(antes)) return 0;
    return -1; // "Curitiba", "Losartana", "pele Rosa", "moro em Vitória"
  }
  // 2+ palavras
  if (depoisDeLugar(todo, i) && !ehNomeComum(palavras[0])) return -1; // "nasci em Campo Grande", "em Vitória da Conquista"
  if (ehNomeComum(palavras[0]) || ehAmbiguo(palavras[0])) return 0; // "Rosa Maria Souza", "Vitória Almeida", "Natal Pereira"
  if (inicioDeFrase(todo, i)) {
    // "Hoje Carla Mendes": a 1ª é só o começo da frase; o nome começa no 1º
    // nome comum/ambíguo. Sem nenhum ("Tomo Losartana Potássica") não é nome.
    const k = palavras.findIndex((w, j) => j > 0 && (ehNomeComum(w) || ehAmbiguo(w)));
    return k > 0 ? k : -1;
  }
  return idxComum >= 0 ? idxComum : 0; // meio da frase, 2+ maiúsculas: nome
}

export function filtrarNomesProprios(texto: string): string {
  const t = texto.replace(RE_SEQUENCIA, (seq: string, i: number, todo: string) => {
    // Tokens alternados: palavra, separador, palavra… (partículas são palavras minúsculas)
    const partes = seq.split(/(\s+)/u);
    const idxPalavras: number[] = [];
    for (let k = 0; k < partes.length; k += 2) if (/^\p{Lu}/u.test(partes[k])) idxPalavras.push(k);
    // Corta na 1ª palavra fixa: dali em diante a sequência fica intacta.
    const corte = idxPalavras.findIndex((k) => ehFixo(partes[k]));
    const nomeIdx = corte >= 0 ? idxPalavras.slice(0, corte) : idxPalavras;
    const palavras = nomeIdx.map((k) => partes[k]);
    const ini = inicioDoNome(palavras, todo.slice(Math.max(0, i - 40), i), todo, i);
    if (ini < 0) return seq;
    const de = nomeIdx[ini];
    const ate = corte >= 0 ? idxPalavras[corte] : partes.length; // exclusivo
    const antesNome = partes.slice(0, de).join("");
    const resto = corte >= 0 ? partes.slice(ate - 1).join("") : ""; // inclui o espaço antes do fixo
    return `${antesNome}${SUBSTITUTO_NOME_TERCEIRO}${resto}`;
  });
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
