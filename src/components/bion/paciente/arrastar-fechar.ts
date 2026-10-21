/**
 * Decisão pura do "arrastar para fechar" das janelas de baixo do paciente.
 * Fecha se arrastou mais que `limitePx` ou se foi um "peteleco" rápido para baixo.
 */
export const LIMITE_FECHAR_PX = 120;
export const VELOCIDADE_FECHAR_PX_MS = 0.5;
/** Movimento mínimo para decidir se o gesto é vertical (arrastar) ou não. */
export const FOLGA_GESTO_PX = 8;

export function deveFecharArrasto(deslocamentoPx: number, velocidadePxMs: number, limitePx = LIMITE_FECHAR_PX): boolean {
  if (!(deslocamentoPx > 0)) return false;
  if (deslocamentoPx >= limitePx) return true;
  // Peteleco: rápido e com um mínimo de distância (evita fechar num toque).
  return velocidadePxMs >= VELOCIDADE_FECHAR_PX_MS && deslocamentoPx >= 24;
}

/** O gesto é um arrasto vertical para baixo? (dx/dy desde o início) */
export function ehArrastoParaBaixo(dx: number, dy: number): boolean | null {
  if (Math.abs(dx) < FOLGA_GESTO_PX && Math.abs(dy) < FOLGA_GESTO_PX) return null; // ainda indefinido
  return dy > 0 && Math.abs(dy) > Math.abs(dx);
}

/** Resistência leve: segue o dedo para baixo, nada para cima. */
export function deslocamentoVisivel(dy: number): number {
  return dy > 0 ? dy : 0;
}
