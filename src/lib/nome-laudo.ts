/**
 * Verificação do nome impresso no laudo x nome da conta (BION IA — exame).
 *
 * A gravação do exame importado é sempre com o `usuarioId` da sessão, então
 * esta comparação é a ÚNICA prova de que o laudo é do paciente. Regra (M7 da
 * auditoria da área do paciente — antes bastava um subconjunto, até 1 token):
 *
 *  1. Normalização: sem acentos, minúsculas, sem honoríficos (dr./dra./sr./
 *     sra.), só letras e espaços. Nome completo igual → corresponde.
 *  2. O nome do DOCUMENTO precisa de ≥ 2 tokens significativos (> 1 letra):
 *     um token só ("Maria") não prova nada.
 *  3. TODOS os tokens significativos da CONTA precisam constar no documento
 *     — o primeiro, os do meio e o último. A ORDEM é livre (nomes do meio
 *     trocados de lugar continuam casando), mas nenhum pode faltar: um
 *     subconjunto próprio do nome da conta é rejeitado.
 *  4. O documento pode ter tokens A MAIS (laudo com o nome mais completo que
 *     o cadastro) — o que ele não pode é provar MENOS que o nome da conta.
 *  5. Casamento por token tolera abreviação: token igual, ou um é prefixo do
 *     outro com o menor tendo mais de 3 letras (ex.: "alexandre" x "alex").
 */

function normalizarNome(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(dr\.?|dra\.?|sr\.?|sra\.?)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensSignificativos(nomeNormalizado: string): string[] {
  return nomeNormalizado.split(" ").filter((t) => t.length > 1);
}

/** O token da conta consta entre os tokens do documento (regra 5)? */
function tokenConsta(token: string, tokensDocumento: string[]): boolean {
  return tokensDocumento.some(
    (x) => x === token || (token.length > 3 && x.startsWith(token)) || (x.length > 3 && token.startsWith(x)),
  );
}

/** O nome extraído do documento corresponde ao nome da conta? */
export function nomeCorresponde(extraido: string, esperado: string): boolean {
  const a = normalizarNome(extraido);
  const b = normalizarNome(esperado);
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensDoc = tokensSignificativos(a);
  const tokensConta = tokensSignificativos(b);
  if (!tokensDoc.length || !tokensConta.length) return false;
  if (tokensDoc.length < 2) return false;
  return tokensConta.every((t) => tokenConsta(t, tokensDoc));
}
