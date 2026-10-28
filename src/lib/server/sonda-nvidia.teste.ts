/**
 * Testes da sonda NVIDIA do diagnóstico admin, com fetch simulado.
 * Rodar: bun --conditions=react-server src/lib/server/sonda-nvidia.teste.ts
 */
import { bloqueioGemini, ordemCanais, sondaNvidia, TEXTO_SONDA } from "./sonda-nvidia";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

const urls: string[] = [];
const corpos: string[] = [];
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: { choices: [{ message: { content: "ok" } }] } };
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  urls.push(String(url));
  corpos.push(String(init?.body ?? ""));
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status });
}) as typeof fetch;

function ambiente(v: Record<string, string | undefined>) {
  for (const k of ["NVIDIA_API_KEY", "BION_LLM_NVIDIA_ATIVO", "BION_LLM_NVIDIA", "BION_LLM_RESERVA_GEMINI", "VERCEL_ENV", "GEMINI_API_KEY"]) delete process.env[k];
  Object.assign(process.env, v);
}

async function main() {
  // 1) configurado → chama SÓ o endpoint NVIDIA, com o texto fixo
  ambiente({ NVIDIA_API_KEY: "nv-segredo", BION_LLM_NVIDIA_ATIVO: "true", GEMINI_API_KEY: "g-segredo" });
  urls.length = 0;
  let s = await sondaNvidia(5_000);
  igual("ok", s.ok, true);
  igual("canal", s.canal, "nvidia");
  igual("uma chamada", urls.length, 1);
  igual("url nvidia", urls[0], "https://integrate.api.nvidia.com/v1/chat/completions");
  igual("nunca gemini", urls.some((u) => u.includes("googleapis")), false);
  igual("texto da sonda", corpos[0].includes(TEXTO_SONDA), true);

  // 2) erro HTTP → ok=false, sem vazar a chave, sem cair no Gemini
  resposta = { status: 500, corpo: { error: { message: "falhou nv-segredo" } } };
  urls.length = 0;
  s = await sondaNvidia(5_000);
  igual("erro ok", s.ok, false);
  igual("erro sem chave", s.detalhe.includes("nv-segredo"), false);
  igual("erro só nvidia", urls.length, 1);

  // 3) não liberado → nenhuma chamada
  ambiente({ NVIDIA_API_KEY: "nv-segredo", GEMINI_API_KEY: "g-segredo" });
  urls.length = 0;
  s = await sondaNvidia(5_000);
  igual("não liberado", s.ok, false);
  igual("não liberado sem fetch", urls.length, 0);

  // 4) ordem
  ambiente({ VERCEL_ENV: "production" });
  igual("ordem prod", ordemCanais(), ["nvidia"]);
  ambiente({ BION_LLM_RESERVA_GEMINI: "true" });
  igual("ordem com reserva", ordemCanais(), ["nvidia", "gemini", "env", "sdk"]);

  // 5) bloqueio do Gemini (listar / mensagens)
  ambiente({ VERCEL_ENV: "production" });
  const b = bloqueioGemini();
  igual("bloqueio status", b?.status, 409);
  igual("bloqueio erro", (await b?.json())?.erro, "gemini_desativado");
  ambiente({ BION_LLM_RESERVA_GEMINI: "0" });
  igual("bloqueio desligada explícita", bloqueioGemini()?.status, 409);
  ambiente({ BION_LLM_RESERVA_GEMINI: "true", VERCEL_ENV: "production" });
  igual("sem bloqueio com reserva", bloqueioGemini(), null);

  console.log(`sonda-nvidia: ${ok} ok, ${falhas} falha(s)`);
  if (falhas) process.exit(1);
}
main();
