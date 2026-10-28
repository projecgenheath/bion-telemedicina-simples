/**
 * Pausa da BION IA (até o #108): nenhum fetch sai de llm.ts enquanto pausada.
 * Rodar: bun --conditions react-server scripts/teste_pausa_ia.ts
 */
import { chatComFonte, diagnosticoGemini, iaPausada, listarModelosGemini, obterLLM, probeCanais, respostaIaPausada, visaoGemini } from "../src/lib/server/llm";
import { estadoSaude } from "../src/components/bion/admin/llm/saude";

let ok = 0, falhas = 0;
const t = (n: string, c: boolean) => (c ? ok++ : (falhas++, console.error("✗ " + n)));
let fetches = 0;
globalThis.fetch = (async () => { fetches++; throw new Error("fetch proibido na pausa"); }) as typeof fetch;
process.env.BION_LLM_GEMINI_API_KEY = "x";
process.env.BION_LLM_API_KEY = "x";
process.env.BION_LLM_BASE_URL = "https://exemplo.invalid";

delete process.env.BION_IA_PAUSADA;
t("pausa por padrão", iaPausada());
for (const v of ["true", "1", "", "FALSO"]) { process.env.BION_IA_PAUSADA = v; t(`pausada com "${v}"`, iaPausada()); }
process.env.BION_IA_PAUSADA = " FALSE ";
t("desliga só com false", !iaPausada());
delete process.env.BION_IA_PAUSADA;

const r = await chatComFonte([{ role: "user", content: "dado de saúde" }], 5000);
t("chat sem texto", r.texto === null);
t("visão nula", (await visaoGemini("image/png", "AAAA", "p", 5000)) === null);
t("obterLLM nulo", (await obterLLM()) === null);
t("probe vazio", (await probeCanais()).length === 0);
t("listar com erro", "erro" in (await listarModelosGemini() as object));
t("diagnóstico pausado", (await diagnosticoGemini([{ role: "user", content: "x" }])).texto === null);
t("nenhum fetch", fetches === 0);
const resp = respostaIaPausada();
t("503", resp.status === 503);
const j = await resp.json();
t("corpo", j.erro === "bion_ia_pausada" && j.mensagem === "A BION IA volta em breve.");
t("painel Pausada", estadoSaude(null, [], true).rotulo === "Pausada" && estadoSaude(null, [], true).tom === "neutro");
console.log(`${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
