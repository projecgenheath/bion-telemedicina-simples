/**
 * Teste isolado da camada de IA generativa (llm.ts):
 *  1. anonimização de nomes (paciente/médico, nome completo + primeiro);
 *  2. cadeia pública real (sem chave) com JSON estruturado no formato da anamnese;
 *  3. verificação de que NENHUM nome real vaza no payload enviado (inspecionado aqui via prompt curto).
 */
import { anonimizarMensagens, chatComFonte, type Msg } from "../src/lib/server/llm";

const nome = "Marina Silva";
const medico = "Dr. Carlos Mendes";

const msgs: Msg[] = [
  {
    role: "assistant",
    content:
      "Você é a BION IA. Conduz a anamnese de Marina Silva, consulta com Dr. Carlos Mendes. Responda EXCLUSIVAMENTE com JSON: {\"resposta\":\"<2 frases>\",\"etapa_concluida\":true,\"coleta\":{}}",
  },
  { role: "user", content: "Marina aqui — doutora, comecei com dor de cabeça ontem." },
];

const anon = [
  { nome, substituto: "a paciente" },
  { nome: "Marina", substituto: "a paciente" },
  { nome: medico, substituto: "o médico" },
  { nome: "Mendes", substituto: "o médico" },
];

const anonimizado = anonimizarMensagens(msgs, anon);
const tudo = anonimizado.map((m) => m.content).join(" | ");
const vazou = [nome, "Marina", medico, "Mendes"].filter((n) => new RegExp(n, "i").test(tudo));

console.log("== ANONIMIZAÇÃO ==");
console.log(anonimizado[1].content);
if (vazou.length) {
  console.error("FALHOU — nomes vazaram:", vazou);
  process.exit(1);
}
console.log("✔ nenhum nome real no payload");

(async () => {
  console.log("== CADEIA PÚBLICA (sem chave, BION_LLM_* ausentes) ==");
  const t0 = Date.now();
  const { texto, fonte } = await chatComFonte(
    [
      { role: "assistant", content: "Responda EXCLUSIVAMENTE com JSON: {\"resposta\":\"<1 frase acolhedora>\",\"etapa_concluida\":false,\"coleta\":{\"queixa\":\"<resumo>\"}}" },
      { role: "user", content: "a paciente disse: dor de cabeça desde ontem à tarde" },
    ],
    30_000,
    [{ nome: "a paciente", substituto: "a paciente" }],
  );
  console.log(`fonte=${fonte} em ${Date.now() - t0}ms`);
  console.log("texto:", texto?.slice(0, 220));
  if (!texto || fonte !== "publico") {
    console.error("FALHOU — esperado texto via canal publico");
    process.exit(1);
  }
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  JSON.parse(texto.slice(inicio, fim + 1));
  console.log("✔ JSON válido e fonte=publico");
})().catch((e) => {
  console.error("ERRO:", e?.message ?? e);
  process.exit(1);
});
