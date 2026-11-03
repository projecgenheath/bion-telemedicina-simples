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
 * (a) INSTITUIÇÕES/LUGARES: a partir desta palavra a sequência fica
 * ("Hospital Santa Maria", "São Paulo", "Rua Augusta"). O que vem ANTES dela
 * ainda pode ser nome ("Carla Mendes Hospital" → "[nome removido] Hospital").
 */
const INSTITUICOES = conjunto([
  "hospital", "clínica", "clinica", "casa", "posto", "laboratório", "laboratorio", "farmácia", "farmacia", "unimed", "pronto", "socorro",
  "são", "sao", "santa", "santo", "rio", "belo", "horizonte", "porto", "alegre", "campo", "grande", "norte", "sul", "dom", "brasil",
  "rua", "avenida", "av", "praça", "praca", "alameda", "travessa", "rodovia", "estrada",
  "bion", "ia", "samu", "sus", "ubs", "upa", "nvidia", "google", "deus", "covid", "aids", "hiv",
]);

/**
 * Lugares que também viram SOBRENOME ("Maria Santa Souza", "Joana Brasil"):
 * quando a sequência já é nome, a remoção continua através deles.
 */
/** Prefixos de lugar/santo: o nome comum logo depois é parte do lugar. */
const PREFIXO_LUGAR = conjunto(["são", "sao", "santa", "santo", "dom", "rio", "porto", "belo", "campo", "vila", "jardim"]);

const CONTINUA_NOME = conjunto(["são", "sao", "santa", "santo", "dom", "brasil"]);

/**
 * SEPARADORES: palavras comuns com maiúscula (saudação, começo de frase,
 * dias, meses). Saem da sequência e o que vem depois é avaliado como uma
 * sequência NOVA ("Oi Carla" → "Oi [nome removido]").
 */
const SEPARADORES = conjunto([
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo", "feira",
  "médica", "medica", "geral", "dor", "eu", "oi", "olá", "ola", "bom", "boa", "dia", "tarde", "noite",
  "sou", "estou", "moro", "tenho", "hoje", "ontem", "amanhã", "quero", "preciso", "fui", "tomo", "meu", "minha", "obrigado", "obrigada",
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
const ehInstituicao = (w: string) => INSTITUICOES.has(chave(w));
const ehSeparador = (w: string) => SEPARADORES.has(chave(w));
const continuaNome = (w: string) => CONTINUA_NOME.has(chave(w));
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
 * Decide, numa região capitalizada sem instituições nem separadores, de que
 * palavra (índice) começa o nome; -1 = não é nome.
 * `iniRegiao` = posição da 1ª palavra no texto (para gatilho/lugar);
 * `comecoFrase` = a região abre a frase (talvez depois de separadores).
 */
function inicioDoNome(palavras: string[], todo: string, iniRegiao: number, comecoFrase: boolean): number {
  if (!palavras.length) return -1;
  const antes = todo.slice(Math.max(0, iniRegiao - 40), iniRegiao);
  if (RE_GATILHO_FORTE.test(antes)) return 0;
  const lugar = depoisDeLugar(todo, iniRegiao);
  if (palavras.length === 1) {
    const w = palavras[0];
    if (ehNomeComum(w)) return 0;
    if (ehAmbiguo(w) && !lugar && RE_GATILHO_FRACO.test(antes)) return 0;
    return -1; // "Curitiba", "Losartana", "pele Rosa", "moro em Vitória"
  }
  // 2+ palavras
  if (lugar && !ehNomeComum(palavras[0])) return -1; // "em Campo Grande", "da Vitória Almeida" (limitação conhecida)
  if (ehNomeComum(palavras[0]) || ehAmbiguo(palavras[0])) return 0; // "Rosa Maria Souza", "Vitória Almeida"
  const k = palavras.findIndex((w, j) => j > 0 && (ehNomeComum(w) || ehAmbiguo(w)));
  if (comecoFrase) return k > 0 ? k : -1; // "Tomo Losartana Potássica" fica
  return k > 0 ? k : 0; // meio da frase, 2+ maiúsculas: nome
}

type Palavra = { w: string; k: number; pos: number };

/** Intervalos [de, ate] (índices de `partes`) a trocar numa sequência. */
function nomesNoSegmento(W: Palavra[], todo: string, comecoFrase: boolean): [number, number][] {
  if (!W.length) return [];
  const c = W.findIndex((p) => ehInstituicao(p.w));
  if (c === 0) {
    // "a Santa Clara Souza ligou": Santa/São + 2 palavras sem instituição = nome
    // (fora de contexto de lugar: "moro em São José dos Campos" fica).
    const antes = todo.slice(Math.max(0, W[0].pos - 40), W[0].pos);
    if (
      continuaNome(W[0].w) &&
      W.length >= 3 &&
      !W.slice(1).some((p) => ehInstituicao(p.w)) &&
      !depoisDeLugar(todo, W[0].pos) &&
      (RE_GATILHO_FORTE.test(antes) || !comecoFrase)
    )
      return [[W[0].k, W.at(-1)!.k]];
    // Depois da instituição: "Hospital Carla Mendes" → "Hospital [nome removido]"
    // só se a palavra seguinte for nome comum ("Hospital Albert Einstein" fica).
    let j = 0;
    while (j < W.length && ehInstituicao(W[j].w)) j++;
    // Mas "São Paulo", "Santa Maria", "Hospital São Lucas": depois de prefixo de
    // lugar/santo o nome comum faz parte do nome do lugar e fica.
    if (j < W.length && ehNomeComum(W[j].w) && !PREFIXO_LUGAR.has(chave(W[j - 1].w))) {
      let fim = j;
      while (fim + 1 < W.length && !ehInstituicao(W[fim + 1].w)) fim++;
      return [[W[j].k, W[fim].k], ...nomesNoSegmento(W.slice(fim + 1), todo, false)];
    }
    // pula até a próxima palavra não-instituição e avalia o resto
    let prox = j;
    while (prox < W.length && !ehInstituicao(W[prox].w)) prox++;
    return nomesNoSegmento(W.slice(prox), todo, false);
  }
  const fimRegiao = c < 0 ? W.length : c;
  const regiao = W.slice(0, fimRegiao);
  const ini = inicioDoNome(regiao.map((p) => p.w), todo, regiao[0].pos, comecoFrase);
  if (ini < 0) return c < 0 ? [] : nomesNoSegmento(W.slice(c), todo, false);
  let fim = fimRegiao - 1;
  // Já é nome: continua por Santa/São/Brasil… e o que vier ("Maria Santa Souza").
  while (fim + 1 < W.length && continuaNome(W[fim + 1].w)) {
    fim++;
    while (fim + 1 < W.length && !ehInstituicao(W[fim + 1].w)) fim++;
  }
  return [[regiao[ini].k, W[fim].k], ...nomesNoSegmento(W.slice(fim + 1), todo, false)];
}

export function filtrarNomesProprios(texto: string): string {
  const t = texto.replace(RE_SEQUENCIA, (seq: string, i: number, todo: string) => {
    // Tokens alternados: palavra, separador de espaço, palavra… (partículas são minúsculas)
    const partes = seq.split(/(\s+)/u);
    const pos: number[] = [];
    let acc = i;
    for (const p of partes) {
      pos.push(acc);
      acc += p.length;
    }
    const palavras: Palavra[] = [];
    for (let k = 0; k < partes.length; k += 2) if (/^\p{Lu}/u.test(partes[k])) palavras.push({ w: partes[k], k, pos: pos[k] });
    // Separadores quebram a sequência em segmentos independentes.
    const intervalos: [number, number][] = [];
    let seg: Palavra[] = [];
    let frase = inicioDeFrase(todo, i);
    let fraseDoSeg = frase;
    const fechar = () => {
      intervalos.push(...nomesNoSegmento(seg, todo, fraseDoSeg));
      seg = [];
    };
    for (const p of palavras) {
      if (ehSeparador(p.w)) {
        fechar();
        // "Oi Carla": o que vem depois de um separador no começo da frase
        // ainda conta como começo de frase (só para "Tomo Losartana Potássica").
        fraseDoSeg = frase;
        continue;
      }
      if (!seg.length) fraseDoSeg = frase;
      seg.push(p);
      frase = false;
    }
    fechar();
    if (!intervalos.length) return seq;
    const out = partes.slice();
    for (const [de, ate] of intervalos) {
      out[de] = SUBSTITUTO_NOME_TERCEIRO;
      for (let x = de + 1; x <= ate; x++) out[x] = "";
    }
    return out.join("").replace(/\[nome removido\]\s+(?=\s)/gu, SUBSTITUTO_NOME_TERCEIRO);
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
