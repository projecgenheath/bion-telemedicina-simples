/**
 * CPF no cliente — só FORMATAÇÃO e máscara (isomórfico).
 *
 * A validação de dígitos verificadores é UMA só: `validarCpf` em
 * src/lib/server/validar-perfil.ts (módulo puro, sem "server-only"),
 * reusada pela folha de dados pessoais do paciente e autoritativa no
 * servidor (PATCH /api/perfil). O valor gravado no banco é o formatado
 * por ela: "000.000.000-00".
 */

/** Só os dígitos do CPF (no máximo 11) a partir de qualquer texto. */
export function digitosCpf(v: string): string {
  return v.replace(/\D/g, "").slice(0, 11);
}

/** Máscara progressiva "000.000.000-00" sobre o que já foi digitado. */
export function mascararCpfDigitacao(v: string): string {
  const d = digitosCpf(v);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Exibição: 11 dígitos (com ou sem máscara) → "000.000.000-00".
 * Vazio → "". Valor legado fora do padrão → o texto como está (a tela
 * mostra o que existe; a correção é feita pela folha de edição).
 */
export function formatarCpfExibicao(v: string | null | undefined): string {
  if (!v) return "";
  const d = digitosCpf(v);
  return d.length === 11 ? mascararCpfDigitacao(d) : v;
}
