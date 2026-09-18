/**
 * Teste do caminho Gemini no llm.ts — espera:
 *  - Sandbox (geo-bloqueado): gemini falha → cadeia cai para público/sdk;
 *  - Nenhum crash, e o corpo da requisição é montado sem erro.
 * Executar: BION_LLM_GEMINI_API_KEY=... bun scripts/teste-gemini-caminho.ts
 */
process.env.BION_LLM_GEMINI_API_KEY = process.env.BION_LLM_GEMINI_API_KEY || "chave-de-teste-invalida";

async function main() {
  const { chatComFonte } = await import("../src/lib/server/llm");
  const mensagens = [
    { role: "assistant" as const, content: "Você é um assistente clínico." },
    { role: "user" as const, content: "Diga ok." },
  ];
  const t0 = Date.now();
  const r = await chatComFonte(mensagens, 20_000);
  console.log(`fonte=${r.fonte} tempo=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("texto:", (r.texto ?? "(null — cadeia inteira indisponível)").slice(0, 120));
  if (r.fonte === "gemini") console.log(">>> Gemini RESPONDEU (região liberada?)");
  else console.log(">>> Comportamento esperado no sandbox: caiu para", r.fonte);
}

main();
