/**
 * Telefone brasileiro — máscara progressiva para digitação.
 *
 * Módulo puro (cliente): a VALIDAÇÃO continua sendo a do servidor
 * (`validarTelefone` em lib/server/validar-perfil.ts, reaplicada no PATCH
 * /api/perfil). Aqui só formatamos enquanto a pessoa digita, no mesmo
 * formato que o servidor grava: "(11) 91234-5678" (celular, 11 dígitos) /
 * "(11) 3123-4567" (fixo, 10 dígitos).
 */

/** Só os dígitos, no máximo 11 (DDD + número). Um "55" inicial com mais de
 *  11 dígitos no total é o código do país colado/digitado — sai da máscara. */
export function digitosTelefone(v: string): string {
  let d = (v ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

/** Formata os dígitos parciais: "(1", "(11", "(11) 9", "(11) 9123-4"… */
export function mascararTelefoneDigitacao(v: string): string {
  const d = digitosTelefone(v);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const numero = d.slice(2);
  // Enquanto o total não chega a 11, o hífen fica após o 4º dígito do
  // número (padrão do fixo); no 11º dígito ele anda uma casa (celular).
  const corte = d.length === 11 ? 5 : 4;
  const corpo = numero.length > corte ? `${numero.slice(0, corte)}-${numero.slice(corte)}` : numero;
  return `(${d.slice(0, 2)}) ${corpo}`;
}
