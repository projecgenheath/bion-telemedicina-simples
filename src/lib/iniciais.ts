/**
 * Iniciais para monogramas (avatar sem foto): primeira + última palavra do
 * nome, ignorando partículas (de, da, do, das, dos, e). Nome de uma palavra
 * só gera uma letra; nome vazio, "?".
 *
 * Antes, a regra local do Perfil pegava as duas primeiras palavras com mais
 * de uma letra — "Alisson de Santana Siqueira" virava "AD" (a preposição
 * entrava como inicial).
 */

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

export function iniciaisNome(nome: string): string {
  const partes = (nome ?? "")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !PARTICULAS.has(p.toLocaleLowerCase("pt-BR")));
  if (partes.length === 0) return "?";
  const primeira = partes[0][0]?.toUpperCase() ?? "";
  if (partes.length === 1) return primeira || "?";
  const ultima = partes[partes.length - 1][0]?.toUpperCase() ?? "";
  return `${primeira}${ultima}` || "?";
}
