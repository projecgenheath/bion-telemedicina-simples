/**
 * Teste unitário do sanitizador de eco (extrairRespostaFinal) — llm.ts.
 * Cenários baseados nos despejos REAIS documentados do Gemma 4 hospedado
 * (quarantena 2026-09: "*   User prompt:", "*Draft 1:", "*Refining:",
 * "The user wants...", "* Final answer:", checklists em inglês).
 *
 * Uso: bunx tsx scripts/teste_sanitizador.ts
 */
import { extrairRespostaFinal } from "../src/lib/server/llm";

let passou = 0;
let falhou = 0;

function verificar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    passou++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhou++;
    console.log(`  FAIL  ${nome}${detalhe ? ` → ${detalhe}` : ""}`);
  }
}

const RESPOSTA_ESPERADA =
  'Claro! A receita é emitida pelo médico em uma **teleconsulta de reavaliação** — é rápida. Toque em **Agendar consulta** aqui embaixo que eu te guio no resto.';

const RESPOSTA_BULLETS =
  "Olá, Marina! Para **renovar sua receita**:\n• Agende uma **teleconsulta de reavaliação**\n• O médico revisa seu histórico e emite a receita atualizada\n\nPosso te ajudar a agendar?";

console.log("=== 1. Despejo com marcador de prompt citado + rascunhos + resposta no fim ===");
const dump1 = `*   User prompt: "Olá! Quero renovar minha receita de remédio de uso contínuo. Não tenho sintoma nenhum."

*   Analyzing the request:
    *   The user wants to renew a prescription.
    *   The user has no symptoms.
    *   Constraint Check: I cannot prescribe. The platform policy is teleconsultation.

*Draft 1:*
Para renovar sua receita, é necessária uma consulta. Agende uma teleconsulta.

*Refining the response (tone: welcoming, direct):*
${RESPOSTA_ESPERADA}`;
const r1 = extrairRespostaFinal(dump1);
verificar("detecta eco (não devolve o bruto)", r1 !== null && r1 !== dump1);
verificar("extrai resposta final do despejo", r1?.includes("teleconsulta de reavaliação") === true && !/User prompt|Draft|Refining/i.test(r1 ?? ""), `got: ${r1?.slice(0, 80)}`);

console.log("=== 2. Despejo narrativo 'The user wants...' sem marcador final ===");
const dump2 = `Let me analyze this request.
The user is asking to renew a prescription for continuous medication. She states she has no symptoms.
I should not ask about symptoms. The correct path is the reevaluation teleconsultation.

${RESPOSTA_ESPERADA}`;
const r2 = extrairRespostaFinal(dump2);
verificar("detecta eco narrativo (não devolve o bruto)", r2 !== null && r2 !== dump2);
verificar("extrai resposta (filtro de linhas)", r2 === RESPOSTA_ESPERADA || r2?.includes("teleconsulta de reavaliação") === true, `got: ${r2?.slice(0, 120)}`);

console.log("=== 3. Despejo com '* Final answer:' explícito ===");
const dump3 = `* User's Input: quero renovar receita
*   Draft 2 (personalized):
    *   Greeting: "Olá, Marina!"
    *   Body: renewal path
* Final answer:
${RESPOSTA_BULLETS}`;
const r3 = extrairRespostaFinal(dump3);
verificar("extrai após Final answer", r3?.startsWith("Olá, Marina!") === true && r3?.includes("•") === true, `got: ${r3?.slice(0, 120)}`);

console.log("=== 4. Resposta LIMPA passa intacta ===");
const r4 = extrairRespostaFinal(RESPOSTA_BULLETS);
verificar("resposta limpa inalterada", r4 === RESPOSTA_BULLETS, `got: ${r4}`);

console.log("=== 5. Despejo insanitizável → null (cadeia segue) ===");
const dump5 = `*   User prompt: "oi"
*   Draft 1: ...
*   Draft 2: ...
*   Refining...`;
const r5 = extrairRespostaFinal(dump5);
verificar("despejo sem resposta → null", r5 === null, `got: ${r5}`);

console.log("=== 6. Resposta legítima com palavra inglesa isolada NÃO é eco ===");
const limpo6 = "Envie o laudo em **PDF ou foto** pelo clip 📎 — eu leio e envio para o médico. Drafts de exames antigos também podem ser anexados!";
const r6 = extrairRespostaFinal(limpo6);
verificar("não falso-positivo (eco na 1ª linha estrutural apenas)", extrairRespostaFinal(limpo6) === limpo6, `alterou texto limpo`);
verificar("passa intacta", r6 === limpo6);

console.log("=== 7. Casos nulos/vazios ===");
verificar("null → null", extrairRespostaFinal(null) === null);
verificar("vazio → null", extrairRespostaFinal("   ") === null);

console.log(`\n=== RESULTADO: ${passou} PASS / ${falhou} FAIL ===`);
process.exit(falhou ? 1 : 0);
