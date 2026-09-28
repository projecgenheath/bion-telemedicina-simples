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

/** Colapsa n-gramas adjacentes repetidos (eco do modelo). */
export function repararRepeticoes(texto: string): string {
  let palavras = texto.split(/\s+/).filter(Boolean);
  const norma = (w: string) =>
    w
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zà-ú0-9]/g, "");
  for (let n = 4; n >= 1; n--) {
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
