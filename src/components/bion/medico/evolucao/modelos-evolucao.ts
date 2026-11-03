/**
 * Modelos pessoais de evolução + reutilização de atendimento anterior.
 *
 * Lógica pura e testável (modelos-evolucao.teste.ts). Duas fontes de
 * reaproveitamento, um ÚNICO caminho de aplicação (mesclarConteudo):
 *
 *  1. "Usar como base": o GET da evolução devolve, no histórico, apenas a
 *     CONDUTA e o CID das evoluções concluídas anteriores (as demais
 *     seções da evolução anterior não vêm no payload e a API não foi
 *     alterada) — a base copia só isso.
 *  2. Modelos pessoais: instantâneo das seções + CID salvos pelo médico.
 *     A persistência é o localStorage DESTE APARELHO (sem servidor, sem
 *     migração) — a UI diz isso com todas as letras.
 *
 * Regras que não mudam:
 *  - Mescla conservadora: campo da fonte VAZIO nunca apaga o destino;
 *    só trecho preenchido da fonte substitui o destino.
 *  - Quem chama decide a confirmação: `sobrescreveu` diz se algum trecho
 *    já digitado seria substituído — nesse caso a UI pergunta antes
 *    (mesmo espírito da correção O1: nada de sobrescrever em silêncio).
 *  - Aplicar preenche o RASCUNHO e passa pelo autosave normal; nada aqui
 *    conclui evolução nem consulta.
 */

export const SECOES_EVOLUCAO_UI = ["dados", "triagem", "exames", "medicamentos", "conduta"] as const;
export type SecaoEvolucao = (typeof SECOES_EVOLUCAO_UI)[number];
export type TextosEvolucao = Record<SecaoEvolucao, string>;
export type ConteudoEvolucao = { textos: TextosEvolucao; cid: string };

export type ModeloEvolucao = {
  id: string;
  nome: string;
  textos: TextosEvolucao;
  cid: string;
  criadoEm: string;
};

/** Chave única dos modelos neste aparelho (um aparelho, um navegador). */
export const CHAVE_MODELOS_EVOLUCAO = "bion:modelos-evolucao:v1";
/** Teto de modelos guardados: lista de atalhos, não arquivo morto. */
export const LIMITE_MODELOS = 30;

export function textosVazios(): TextosEvolucao {
  return { dados: "", triagem: "", exames: "", medicamentos: "", conduta: "" };
}

/** Há algo escrito (seção ou CID) neste conteúdo? Espaços não contam. */
export function temConteudo(c: ConteudoEvolucao): boolean {
  return SECOES_EVOLUCAO_UI.some((s) => c.textos[s].trim().length > 0) || c.cid.trim().length > 0;
}

export type FonteConteudo = { textos: Partial<TextosEvolucao>; cid?: string | null };

/**
 * Mescla a fonte no conteúdo atual. Devolve o resultado, se algo foi de
 * fato aplicado (`aplicou`) e se algum trecho já digitado seria
 * SUBSTITUÍDO por texto diferente (`sobrescreveu` — a UI confirma antes
 * quando verdadeiro). Trecho vazio da fonte não toca o destino; trecho
 * idêntico ao destino não conta como sobrescrita.
 */
export function mesclarConteudo(
  atual: ConteudoEvolucao,
  fonte: FonteConteudo,
): { resultado: ConteudoEvolucao; aplicou: boolean; sobrescreveu: boolean } {
  const textos = { ...atual.textos };
  let aplicou = false;
  let sobrescreveu = false;
  for (const s of SECOES_EVOLUCAO_UI) {
    const v = fonte.textos[s];
    if (typeof v !== "string" || v.trim().length === 0) continue;
    if (atual.textos[s].trim().length > 0 && atual.textos[s] !== v) sobrescreveu = true;
    textos[s] = v;
    aplicou = true;
  }
  let cid = atual.cid;
  if (typeof fonte.cid === "string" && fonte.cid.trim().length > 0) {
    if (atual.cid.trim().length > 0 && atual.cid !== fonte.cid) sobrescreveu = true;
    cid = fonte.cid;
    aplicou = true;
  }
  return { resultado: { textos, cid }, aplicou, sobrescreveu };
}

/**
 * Fonte "usar como base" a partir de um item do histórico do GET da
 * evolução. O payload só traz conduta + CID da evolução anterior (e só
 * de evoluções concluídas) — é tudo o que dá para copiar sem mexer na
 * API. Sem conduta nem CID, não há base: devolve null.
 */
export function fonteDoHistorico(h: {
  evolucao: { conduta?: { texto?: unknown } | null; cid?: string | null } | null;
}): FonteConteudo | null {
  const ev = h.evolucao;
  if (!ev) return null;
  const conduta = typeof ev.conduta?.texto === "string" ? ev.conduta.texto : "";
  const cid = typeof ev.cid === "string" ? ev.cid : "";
  if (!conduta.trim() && !cid.trim()) return null;
  return { textos: conduta.trim() ? { conduta } : {}, cid };
}

/** Um modelo lido do armazenamento é confiável? (JSON de origem incerta.) */
export function modeloValido(x: unknown): x is ModeloEvolucao {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id) return false;
  if (typeof m.nome !== "string" || !m.nome.trim()) return false;
  if (typeof m.cid !== "string") return false;
  if (typeof m.criadoEm !== "string") return false;
  if (!m.textos || typeof m.textos !== "object") return false;
  const t = m.textos as Record<string, unknown>;
  return SECOES_EVOLUCAO_UI.every((s) => typeof t[s] === "string");
}

/** Interpreta o JSON guardado: inválido vira lista vazia, nunca exceção. */
export function lerModelos(bruto: string | null): ModeloEvolucao[] {
  if (!bruto) return [];
  let v: unknown;
  try {
    v = JSON.parse(bruto);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  return v.filter(modeloValido).slice(0, LIMITE_MODELOS);
}

export function carregarModelos(): ModeloEvolucao[] {
  try {
    return lerModelos(localStorage.getItem(CHAVE_MODELOS_EVOLUCAO));
  } catch {
    return [];
  }
}

/** Persiste a lista; false = o aparelho recusou (modo privado, cota…). */
export function persistirModelos(lista: ModeloEvolucao[]): boolean {
  try {
    localStorage.setItem(CHAVE_MODELOS_EVOLUCAO, JSON.stringify(lista.slice(0, LIMITE_MODELOS)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cria um modelo a partir do conteúdo atual. Nome vazio ou evolução
 * vazia não viram modelo (atalho sem conteúdo é ruído): devolve null.
 */
export function novoModelo(
  nome: string,
  conteudo: ConteudoEvolucao,
  agora: Date = new Date(),
): ModeloEvolucao | null {
  const n = nome.trim();
  if (!n || !temConteudo(conteudo)) return null;
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `m-${agora.getTime()}-${Math.floor(Math.random() * 1e9)}`;
  return {
    id,
    nome: n.slice(0, 60),
    textos: { ...conteudo.textos },
    cid: conteudo.cid,
    criadoEm: agora.toISOString(),
  };
}

/** Mais recente primeiro; a lista é cortada no teto. */
export function adicionarModelo(lista: ModeloEvolucao[], modelo: ModeloEvolucao): ModeloEvolucao[] {
  return [modelo, ...lista.filter((m) => m.id !== modelo.id)].slice(0, LIMITE_MODELOS);
}

export function removerModelo(lista: ModeloEvolucao[], id: string): ModeloEvolucao[] {
  return lista.filter((m) => m.id !== id);
}
