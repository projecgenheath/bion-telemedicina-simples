/**
 * Segurança na prescrição — FASE 1 (melhoria nº 14 da auditoria médica):
 * checagem TEXTUAL, não bloqueante, do medicamento sendo prescrito contra
 * (a) as alergias registradas do paciente e (b) os medicamentos que ele já
 * está usando (duplicidade). Não é base de interações medicamentosas — isso
 * exige base externa e fica para a fase 2; aqui é comparação de nomes com
 * normalização (caixa/acento) e correspondência por token/raiz simples,
 * para o médico VER o aviso antes de emitir e decidir.
 *
 * Funções puras, sem efeitos: quem chama decide como exibir (banner na
 * folha de emissão e no modal da sala). Alerta nunca bloqueia a emissão.
 */

export type MedicamentoEmUsoResumo = {
  nome: string;
  dose?: string | null;
};

export type AlertaPrescricao =
  | { tipo: "alergia"; referencia: string }
  | { tipo: "duplicidade"; referencia: string };

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizarTextoPrescricao(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Unidades/formas e palavras de ligação que não identificam o fármaco. */
const TOKENS_IGNORADOS = new Set([
  "mg", "ml", "g", "mcg", "ui", "cp", "comp", "comprimido", "comprimidos",
  "capsula", "capsulas", "gota", "gotas", "ampola", "ampolas", "frasco",
  "bisnaga", "sache", "saches", "envelope", "dose", "doses", "spray",
  "puff", "puffs", "adesivo", "adesivos", "ovulo", "ovulos", "supositorio",
  "colher", "colheres", "tablete", "tabletes", "pastilha", "pastilhas",
  "de", "da", "do", "das", "dos", "com", "sem", "para", "uso", "via",
  "oral", "topico", "topica", "injetavel", "solucao", "suspensao", "creme",
  "pomada", "gel", "xarope", "elixir", "po", "efervescente",
]);

/** Tokens que identificam o fármaco (nome/raiz), sem dose, unidade ou forma. */
export function tokensDoMedicamento(s: string | null | undefined): string[] {
  return normalizarTextoPrescricao(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !TOKENS_IGNORADOS.has(t));
}

/**
 * Correspondência simples entre dois tokens: iguais, ou mesma raiz com
 * variação de plural/terminação (prefixo comum cobrindo a palavra menor
 * menos 2 caracteres, com mínimo de 5) — ex.: penicilina × penicilinas,
 * losartana × losartan. Tokens curtos (<5) só casam exatos, para não gerar
 * falso positivo (ex.: "met" de metformina × metoclopramida não casa).
 */
export function tokensSeCorrespondem(a: string, b: string): boolean {
  if (a === b) return true;
  const menor = Math.min(a.length, b.length);
  if (menor < 5) return false;
  let i = 0;
  while (i < menor && a[i] === b[i]) i++;
  return i >= 5 && i >= menor - 2;
}

function algumTokenCorresponde(a: string[], b: string[]): boolean {
  return a.some((ta) => b.some((tb) => tokensSeCorrespondem(ta, tb)));
}

/**
 * Registros de alergia que NÃO são alergia: o cadastro aceita texto livre e
 * os perfis trazem negações ("Nenhuma", "Nega alergias", "Não informado").
 * Tratá-las como alergia geraria alerta falso em toda prescrição.
 */
const NEGACAO_ALERGIA = /^(nenhum|nenhuma|nao|nega|sem|desconhecid|ignora)/;

export function alergiasValidas(alergias: string[] | null | undefined): string[] {
  return (alergias ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && !NEGACAO_ALERGIA.test(normalizarTextoPrescricao(a)));
}

/**
 * Alertas da prescrição em curso. `medicamento` vazio (ainda digitando o
 * começo) ou sem token identificável devolve lista vazia — o aviso aparece
 * quando há nome suficiente para comparar.
 */
export function verificarPrescricao(
  medicamento: string | null | undefined,
  alergias: string[] | null | undefined,
  medicamentosEmUso: MedicamentoEmUsoResumo[] | null | undefined,
): AlertaPrescricao[] {
  const tokens = tokensDoMedicamento(medicamento);
  if (!tokens.length) return [];
  const alertas: AlertaPrescricao[] = [];

  for (const alergia of alergiasValidas(alergias)) {
    if (algumTokenCorresponde(tokens, tokensDoMedicamento(alergia))) {
      alertas.push({ tipo: "alergia", referencia: alergia });
    }
  }
  for (const emUso of medicamentosEmUso ?? []) {
    if (emUso?.nome && algumTokenCorresponde(tokens, tokensDoMedicamento(emUso.nome))) {
      alertas.push({ tipo: "duplicidade", referencia: emUso.nome });
    }
  }
  return alertas;
}
