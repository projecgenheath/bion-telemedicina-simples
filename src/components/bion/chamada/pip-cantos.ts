/**
 * Cantos do quadrinho da própria câmera (PiP) na tela de chamada 9:16.
 * Regras puras (sem DOM), testadas em pip-cantos.teste.ts.
 */
export type CantoPip = "sup-esq" | "sup-dir" | "inf-esq" | "inf-dir";

/** Canto mais perto do centro do PiP quando o dedo/mouse solta. */
export function cantoMaisProximo(centroX: number, centroY: number, largura: number, altura: number): CantoPip {
  const esquerda = centroX < largura / 2;
  const cima = centroY < altura / 2;
  if (cima) return esquerda ? "sup-esq" : "sup-dir";
  return esquerda ? "inf-esq" : "inf-dir";
}

/**
 * Canto de destino de um arrasto. Um "peteleco" (arrasto curto e rápido)
 * também troca de canto na direção do movimento, como nos apps de ligação.
 */
export function cantoAposArrasto(
  inicio: CantoPip,
  centroX: number,
  centroY: number,
  largura: number,
  altura: number,
  velocidadeX = 0,
  velocidadeY = 0,
): CantoPip {
  const LIMIAR = 0.6; // px/ms
  let canto = cantoMaisProximo(centroX, centroY, largura, altura);
  if (Math.abs(velocidadeX) > LIMIAR) {
    const esquerda = velocidadeX < 0;
    canto = (canto.startsWith("sup") ? (esquerda ? "sup-esq" : "sup-dir") : esquerda ? "inf-esq" : "inf-dir") as CantoPip;
  }
  if (Math.abs(velocidadeY) > LIMIAR) {
    const cima = velocidadeY < 0;
    canto = ((cima ? "sup-" : "inf-") + canto.split("-")[1]) as CantoPip;
  }
  return inicio === canto ? inicio : canto;
}

/** Arrasto de poucos px é toque, não arrasto. */
export function foiArrasto(dx: number, dy: number, tolerancia = 6): boolean {
  return Math.hypot(dx, dy) > tolerancia;
}

/** Classes Tailwind de posição de cada canto (o inferior fica acima da barra de botões). */
export function classesCanto(canto: CantoPip, barraVisivel: boolean): string {
  const topo = "top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)]";
  const base = barraVisivel
    ? "bottom-[calc(max(1rem,env(safe-area-inset-bottom))+7.5rem)]"
    : "bottom-[max(1rem,env(safe-area-inset-bottom))]";
  const vertical = canto.startsWith("sup") ? topo : base;
  const horizontal = canto.endsWith("esq") ? "left-3" : "right-3";
  return `${vertical} ${horizontal}`;
}
