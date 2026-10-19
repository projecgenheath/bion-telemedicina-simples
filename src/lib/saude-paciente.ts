/**
 * Regras puras de pedidos de medição e medicamentos em uso (lado do paciente).
 * Sem dependência de servidor: usadas pelas rotas /api/paciente/* e pela UI.
 */

/** Tipos do PedidoMedicao.tipos (JSON). Medicao.tipo usa "pa" para pressão. */
export const TIPOS_PEDIDO = ["peso", "altura", "pressao"] as const;
export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

export const ROTULO_TIPO: Record<TipoPedido, string> = {
  peso: "Peso",
  altura: "Altura",
  pressao: "Pressão arterial",
};

/** Lê o JSON de PedidoMedicao.tipos, ignorando valores desconhecidos e repetidos. */
export function lerTiposPedido(json: string | null | undefined): TipoPedido[] {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];
  const saida: TipoPedido[] = [];
  for (const t of bruto) {
    const n = t === "pa" ? "pressao" : t;
    if (TIPOS_PEDIDO.includes(n as TipoPedido) && !saida.includes(n as TipoPedido)) saida.push(n as TipoPedido);
  }
  return saida;
}

export type RespostaPedido = {
  peso?: number;
  altura?: number;
  sistolica?: number;
  diastolica?: number;
};

export type MedicaoNova = { tipo: "peso" | "altura" | "pa"; valor1: number; valor2?: number };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Mesmos intervalos plausíveis de POST /api/medicoes. */
export function validarResposta(
  tipos: TipoPedido[],
  r: RespostaPedido,
): { ok: true; medicoes: MedicaoNova[] } | { ok: false; erro: string } {
  if (!tipos.length) return { ok: false, erro: "Este pedido não tem medidas para informar." };
  const medicoes: MedicaoNova[] = [];
  for (const t of tipos) {
    if (t === "peso") {
      if (!num(r.peso) || r.peso < 20 || r.peso > 400) return { ok: false, erro: "Informe o peso entre 20 e 400 kg." };
      medicoes.push({ tipo: "peso", valor1: r.peso });
    } else if (t === "altura") {
      if (!num(r.altura) || r.altura < 50 || r.altura > 250)
        return { ok: false, erro: "Informe a altura entre 50 e 250 cm." };
      medicoes.push({ tipo: "altura", valor1: r.altura });
    } else {
      if (!num(r.sistolica) || r.sistolica < 50 || r.sistolica > 300)
        return { ok: false, erro: "Informe a pressão máxima (sistólica) entre 50 e 300." };
      if (!num(r.diastolica) || r.diastolica < 30 || r.diastolica > 200)
        return { ok: false, erro: "Informe a pressão mínima (diastólica) entre 30 e 200." };
      if (r.diastolica >= r.sistolica) return { ok: false, erro: "A pressão mínima precisa ser menor que a máxima." };
      medicoes.push({ tipo: "pa", valor1: r.sistolica, valor2: r.diastolica });
    }
  }
  return { ok: true, medicoes };
}

/** Posologia do MedicamentoEmUso (JSON livre). Campos que o paciente entende. */
export type Posologia = { frequencia?: string; horarios?: string[]; duracaoDias?: number; instrucoes?: string };

export function lerPosologia(json: string | null | undefined): Posologia {
  try {
    const p = JSON.parse(json ?? "{}");
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const saida: Posologia = {};
    if (typeof p.frequencia === "string") saida.frequencia = p.frequencia;
    if (Array.isArray(p.horarios)) saida.horarios = p.horarios.filter((h: unknown) => typeof h === "string" && HORA.test(h));
    if (num(p.duracaoDias)) saida.duracaoDias = p.duracaoDias;
    if (typeof p.instrucoes === "string") saida.instrucoes = p.instrucoes;
    return saida;
  } catch {
    return {};
  }
}

export const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Texto curto: "1 comprimido · oral · 8/8h". */
export function resumoMedicamento(m: { dose?: string | null; via?: string | null; posologia?: string | null }): string {
  const p = lerPosologia(m.posologia);
  return [m.dose, m.via, p.frequencia].filter((x) => x && String(x).trim()).join(" · ");
}

export type MedicamentoEntrada = { nome?: unknown; dose?: unknown; via?: unknown; frequencia?: unknown; usoContinuo?: unknown };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valida o que o paciente digita ao adicionar um medicamento. */
export function validarMedicamento(
  b: MedicamentoEntrada,
): { ok: true; dados: { nome: string; dose: string | null; via: string | null; posologia: string; usoContinuo: boolean } } | { ok: false; erro: string } {
  const nome = texto(b.nome, 120);
  if (nome.length < 2) return { ok: false, erro: "Informe o nome do medicamento." };
  const frequencia = texto(b.frequencia, 80);
  return {
    ok: true,
    dados: {
      nome,
      dose: texto(b.dose, 80) || null,
      via: texto(b.via, 40) || null,
      posologia: JSON.stringify(frequencia ? { frequencia } : {}),
      usoContinuo: b.usoContinuo === true,
    },
  };
}

export const FREQUENCIAS_LEMBRETE = ["Todos os dias", "Dias úteis", "Semanal"] as const;
