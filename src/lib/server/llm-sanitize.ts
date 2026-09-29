import "server-only";

/**
 * Sanitização de texto da BION IA (extraído de llm.ts — P2 modularização).
 * Funções puras, testáveis sem chamar a API.
 */

/** Remove artefatos de ação (fence JSON / action_flow_id) do fim da resposta. */
export function limparArtefatos(texto: string): string {
  return texto
    .replace(/\u0060{3}[\s\S]*$/, "")
    .replace(/[{\[][^}]*?action_flow_id[\s\S]*$/m, "")
    .trim();
}

/**
 * Corta segundo rascunho do Gemma (duas falas coladas).
 * Ex.: "...plataforma- Estou muito bem... Como posso ajudar você hoje? ..."
 */
export function colapsarRascunhos(texto: string): string {
  let t = texto.replace(/\s+/g, " ").trim();
  if (t.length < 60) return t;

  const pergunta = /como posso ajudar voc[eê] hoje\??/gi;
  const hits: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pergunta.exec(t))) hits.push(m.index);
  if (hits.length >= 2) {
    t = t.slice(0, hits[1]).trim();
  }

  // Segundo draft começando com hífen + nova saudação
  const segundo = t.search(/[-–—]\s+(Estou |Tudo bem|Claro!|Obrigada|Olá)/i);
  if (segundo > 40) t = t.slice(0, segundo).trim();

  // Menu de opções repetido
  const menu = /•\s*Agendar consulta/gi;
  const menus: number[] = [];
  while ((m = menu.exec(t))) menus.push(m.index);
  if (menus.length >= 2) {
    const fim = t.indexOf("plataforma", menus[0]);
    t = (fim > menus[0] ? t.slice(0, fim + "plataforma".length) : t.slice(0, menus[1])).trim();
  }

  return t.replace(/[-–—]\s*$/, "").trim();
}

/** Colapsa n-gramas adjacentes repetidos (eco do modelo). */
export function repararRepeticoes(texto: string): string {
  const cortado = colapsarRascunhos(texto);
  let palavras = cortado.split(/\s+/).filter(Boolean);
  const norma = (w: string) =>
    w
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zà-ú0-9]/g, "");
  for (let n = 8; n >= 2; n--) {
    for (let i = 0; i + 2 * n <= palavras.length; i++) {
      const a = palavras.slice(i, i + n).map(norma).join("|");
      const b = palavras.slice(i + n, i + 2 * n).map(norma).join("|");
      if (a && a === b && norma(palavras[i]).length >= 1) {
        palavras = [...palavras.slice(0, i + n), ...palavras.slice(i + 2 * n)];
        i = -1;
      }
    }
  }
  return palavras.join(" ");
}
