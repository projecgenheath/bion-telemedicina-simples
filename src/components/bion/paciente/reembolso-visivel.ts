/* ------------------------------------------------------------------ */
/* Quando a tela do paciente mostra reembolso. Retorno grátis (valor 0) */
/* não tem nada a devolver: nada de "Reembolso integral" de R$ 0.       */
/* ------------------------------------------------------------------ */

/** "R$ 150" / "R$ 99,90" (fmtValorBRL) → centavos; null se não der para ler. */
export function centavosDoValorBRL(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const m = valor.replace(/\s/g, "").match(/(\d+(?:\.\d{3})*)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const reais = Number(m[1].replace(/\./g, ""));
  const cent = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return reais * 100 + cent;
}

/** A consulta (lista do paciente) tem valor a devolver? Valor ilegível conta como pago. */
export function consultaTemReembolso(c: { pago?: boolean; valor?: string | null }): boolean {
  if (c.pago === false) return false;
  return centavosDoValorBRL(c.valor) !== 0;
}

/** Na prévia do servidor: mostrar a linha de reembolso? */
export function previaTemReembolso(p: { pago: boolean; valorCentavos: number }): boolean {
  return p.pago && p.valorCentavos > 0;
}
