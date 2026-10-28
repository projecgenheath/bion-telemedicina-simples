import { chatNvidia, nvidiaConfig, nvidiaConfigurado, nvidiaLiberado, reservaGeminiAtiva, type RegistroNvidia } from "@/lib/server/llm-nvidia";

/** Texto fixo da sonda — sem nenhum dado de paciente. */
export const TEXTO_SONDA = "Responda apenas: ok";

export type SondaNvidia = { canal: "nvidia"; ok: boolean; detalhe: string; ms: number; modelo: string };

/**
 * Sonda do diagnóstico admin: testa SÓ o NVIDIA (mesma config/helpers do chat,
 * llm-nvidia.ts). Nunca chama o Gemini nem outro canal. A chave nunca aparece.
 */
export async function sondaNvidia(timeoutMs = 20_000): Promise<SondaNvidia> {
  const modelo = nvidiaConfig().model;
  if (!nvidiaConfigurado()) {
    const motivo = !nvidiaLiberado() ? "NVIDIA não liberado (BION_LLM_NVIDIA_ATIVO)" : "NVIDIA sem chave ou desligado";
    return { canal: "nvidia", ok: false, detalhe: motivo, ms: 0, modelo };
  }
  const registros: RegistroNvidia[] = [];
  const inicio = Date.now();
  const texto = await chatNvidia([{ role: "user", content: TEXTO_SONDA }], {
    timeoutMs,
    maxTokens: 256,
    registros,
    rotulo: "sonda",
  });
  const r = registros.at(-1);
  const detalhe = texto
    ? `HTTP ${r?.status ?? 200} texto="${texto.slice(0, 30)}"`
    : (r?.erro ?? "sem resposta") + (r?.status ? ` (HTTP ${r.status})` : "");
  return { canal: "nvidia", ok: !!texto, detalhe, ms: Date.now() - inicio, modelo };
}

/** Ordem real dos canais: NVIDIA; Gemini/env/SDK só quando a reserva está ligada. */
export function ordemCanais(): string[] {
  return reservaGeminiAtiva() ? ["nvidia", "gemini", "env", "sdk"] : ["nvidia"];
}

export const ERRO_GEMINI_DESATIVADO = {
  erro: "gemini_desativado",
  mensagem: "A reserva do Gemini está desligada (BION_LLM_RESERVA_GEMINI). Este modo do diagnóstico não chama o Gemini.",
} as const;

/** 409 quando a reserva do Gemini está desligada; null quando o Gemini pode ser chamado. */
export function bloqueioGemini(): Response | null {
  return reservaGeminiAtiva() ? null : Response.json(ERRO_GEMINI_DESATIVADO, { status: 409 });
}
