/**
 * M3 (auditoria do perfil do paciente) — peso e altura num formato só.
 *
 * FORMATO CANÔNICO GRAVADO em PerfilPaciente.peso / .altura (colunas String):
 *   - peso   → quilogramas, número em texto com ponto decimal e no máximo 1
 *              casa, sem unidade: "62", "62.5";
 *   - altura → CENTÍMETROS, mesmo formato: "168", "168.5".
 * É o mesmo padrão que /api/medicoes e a triagem já gravavam (String(valor)),
 * e a mesma unidade da tabela Medicao (valor1 em kg / cm). A unidade só
 * aparece na EXIBIÇÃO (formatarPeso / formatarAltura).
 *
 * LEITURA TOLERANTE (entrada do usuário, da IA e valores legados do banco,
 * ex.: o seed antigo gravava "62 kg" e "1,68 m"):
 *   peso:   62 · "62" · "62 kg" · "62,5" · "62.5kg"
 *   altura: 168 · "168" · "168 cm" · "1,68" · "1,68 m" · "1.68m"
 *   Altura sem unidade ≤ 3 é lida como METROS (1,68 → 168 cm).
 * Fora da faixa plausível (mesma do /api/medicoes) → null.
 *
 * Arquivo puro e isomórfico (servidor e cliente; sem "server-only").
 */

export const FAIXA_PESO_KG = { min: 20, max: 400 } as const;
export const FAIXA_ALTURA_CM = { min: 50, max: 250 } as const;

const UNIDADES_PESO = new Set(["", "kg", "kgs", "quilo", "quilos"]);
const UNIDADES_ALTURA_CM = new Set(["cm", "cms"]);
const UNIDADES_ALTURA_M = new Set(["m", "mt", "mts", "metro", "metros"]);

function numeroEUnidade(v: unknown): { n: number; unidade: string } | null {
  if (typeof v === "number") return Number.isFinite(v) ? { n: v, unidade: "" } : null;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(",", ".");
  const m = /^(\d{1,4}(?:\.\d+)?)\s*([a-z]*)\.?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? { n, unidade: m[2] } : null;
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;

/** Peso em kg (1 casa) ou null se não reconhecido / fora de 20–400 kg. */
export function lerPesoKg(v: unknown): number | null {
  const r = numeroEUnidade(v);
  if (!r || !UNIDADES_PESO.has(r.unidade)) return null;
  const kg = umaCasa(r.n);
  return kg >= FAIXA_PESO_KG.min && kg <= FAIXA_PESO_KG.max ? kg : null;
}

/** Altura em cm (1 casa) ou null se não reconhecida / fora de 50–250 cm. */
export function lerAlturaCm(v: unknown): number | null {
  const r = numeroEUnidade(v);
  if (!r) return null;
  let cm: number;
  if (UNIDADES_ALTURA_CM.has(r.unidade)) cm = r.n;
  else if (UNIDADES_ALTURA_M.has(r.unidade)) cm = r.n * 100;
  else if (r.unidade === "") cm = r.n <= 3 ? r.n * 100 : r.n;
  else return null;
  cm = umaCasa(cm);
  return cm >= FAIXA_ALTURA_CM.min && cm <= FAIXA_ALTURA_CM.max ? cm : null;
}

/** Número → texto canônico gravado no banco ("62", "62.5"). */
export function medidaCanonica(n: number): string {
  return String(umaCasa(n));
}

/** Valor legado/qualquer → texto canônico de peso (kg) ou undefined. */
export function pesoCanonico(v: unknown): string | undefined {
  const kg = lerPesoKg(v);
  return kg === null ? undefined : medidaCanonica(kg);
}

/** Valor legado/qualquer → texto canônico de altura (cm) ou undefined. */
export function alturaCanonica(v: unknown): string | undefined {
  const cm = lerAlturaCm(v);
  return cm === null ? undefined : medidaCanonica(cm);
}

const fmtBr = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Exibição com a unidade UMA vez: "62 kg", "62,5 kg"; "" se não reconhecido. */
export function formatarPeso(v: unknown): string {
  const kg = lerPesoKg(v);
  return kg === null ? "" : `${fmtBr(kg)} kg`;
}

/** Exibição com a unidade UMA vez: "168 cm"; "" se não reconhecida. */
export function formatarAltura(v: unknown): string {
  const cm = lerAlturaCm(v);
  return cm === null ? "" : `${fmtBr(cm)} cm`;
}

/** IMC = kg / m². null se faltar dado ou se o valor não for plausível. */
export function calcularImc(pesoKg: number | null | undefined, alturaCm: number | null | undefined): number | null {
  const kg = lerPesoKg(pesoKg);
  const cm = lerAlturaCm(alturaCm);
  if (kg === null || cm === null) return null;
  return kg / Math.pow(cm / 100, 2);
}
