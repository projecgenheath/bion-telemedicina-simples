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


console.log("=== 8. DESPEJO REAL capturado em produção 2026-09-24 (User persona + Constraints + Draft 1 aninhado + resposta duplicada colada) ===");
const dumpReal = `*   User persona: BION IA (virtual assistant for BION Telemedicina).
    *   Language: Brazilian Portuguese.
    *   Tone: Direct, addressing the user ("você").
    *   Constraint 1: Maximum 5 lines.
    *   Constraint 2: First line must be the response itself.
    *   Constraint 3: NO reasoning, analysis, plans, drafts, or meta-comments (no "The user wants...", "Draft", etc.).
    *   Constraint 4: NEVER cite or repeat the user's request.
    *   Input: "Olá! Quero renovar minha receita de remédio de uso contínuo. Não tenho sintoma nenhum."

    *   The user wants to renew a continuous medication prescription without symptoms.
    *   Context: Telemedicine.
    *   Standard procedure in telemedicine for prescription renewal: A re-evaluation teleconsultation is needed.

    *   *Draft 1:* Com certeza! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação**. É um processo rápido e feito sem a necessidade de sintomas. Basta clicar em **Agendar consulta** para começarmos.
    *   *Check constraints:*
        *   Directly addressing "você"? Yes.
        *   First line is the response? Yes.
        *   No meta-talk? Yes.
        *   No repetition of request? Yes.
        *   Max 5 lines? Yes (3 lines).
        *   Language: PT-BR.

    *   "Com certeza! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação** — é um processo rápido e não exige sintomas. Toque em **Agendar consulta** aqui embaixo que eu te ajudo com o restante."

    *   Lines: 3.
    *   Style: Matches the example provided.

    "Com certeza! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação** — é um processo rápido e não exige sintomas. Toque em **Agendar consulta** aqui embaixo que eu te ajudo com o restante."Com certeza! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação** — é um processo rápido e não exige sintomas. Toque em **Agendar consulta** aqui embaixo que eu te ajudo com o restante.`;
const rReal = extrairRespostaFinal(dumpReal);
const respostaRealEsperada = "Com certeza! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação** — é um processo rápido e não exige sintomas. Toque em **Agendar consulta** aqui embaixo que eu te ajudo com o restante.";
verificar("resposta única e limpa extraída do despejo real", rReal === respostaRealEsperada, `got: ${rReal?.slice(0, 120)}`);


console.log("=== 9. Checklist '? Yes.' sem bullet + resposta duplicada colada (produção [3]) ===");
const dump9 = `*   The user asks if Losartana is registered in her profile.
    *   Check profile: Losartana 50mg (1x/dia) is in the medications list.
    *   Checklist:
        *   Markdown? Yes.
        *   No preamble? Yes.
        *   No reasoning/meta-talk? Yes.
"Sim, Marina! A **Losartana 50mg (1x/dia)** está registrada no seu perfil como medicamento em uso."Sim, Marina! A **Losartana 50mg (1x/dia)** está registrada no seu perfil como medicamento em uso.`;
const r9 = extrairRespostaFinal(dump9);
const esperada9 = "Sim, Marina! A **Losartana 50mg (1x/dia)** está registrada no seu perfil como medicamento em uso.";
verificar("checklist '? Yes.' quebrado + dedupe da cauda", r9 === esperada9, `got: ${r9?.slice(0, 120)}`);

console.log("=== 10. 'Addressing user as \"você\"? Yes.' antes da resposta (produção [4]) ===");
const dump10 = `*   User persona: BION IA.
    *   Input: "Beleza, mas não quero marcar consulta agora."
    *   The user wants confirmation about her medication.
    *   Addressing user as "você"? Yes.
Claro! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação** — é rápida e não exige que você esteja com sintomas. Toque em **Agendar consulta** aqui embaixo que eu te guio no resto.`;
const r10 = extrairRespostaFinal(dump10);
const esperada10 = "Claro! Para renovar sua receita, você precisa realizar uma **teleconsulta de reavaliação** — é rápida e não exige que você esteja com sintomas. Toque em **Agendar consulta** aqui embaixo que eu te guio no resto.";
verificar("'? Yes.' com aspas dentro quebra o bloco", r10 === esperada10, `got: ${r10?.slice(0, 120)}`);


console.log("=== 11. Duas versões quase iguais da resposta COLADAS X+Y (produção [2] v4) ===");
const A2 = "Claro! A receita é emitida pelo médico em uma **teleconsulta de reavaliação** — é rápida e específica para uso contínuo. \n• Toque em **Agendar consulta** para escolher o melhor horário e eu te guio no restante.";
const Y2 = "Claro! A receita é emitida pelo médico em uma **teleconsulta de reavaliação** — é um atendimento rápido e específica para uso contínuo. \n• Toque em **Agendar consulta** para escolher o melhor horário e eu te guio no restante.";
const dump11 = `*   The user wants to renew a continuous prescription without symptoms.
    *   Draft the response: reevaluation teleconsultation path.
    ${A2.replace(/\n/g, " ")}${Y2.replace(/\n/g, " ")}`;
const r11 = extrairRespostaFinal(dump11);
verificar("cola X+Y quase idêntica → 1ª versão", r11 === A2.replace(/\n/g, " "), `got: ${r11?.slice(0, 150)}`);

console.log("=== 12. Scaffolds 'Let's refine', '(This is 3 lines)', 'Self-Correction' intercalados (produção [3] v4) ===");
const dump12 = `Let's refine for maximum impact and brevity.
Sim, a **Losartana 50mg (1x/dia)** está registrada no seu perfil como medicamento em uso.
• Você pode conferir todos os seus dados e medicamentos na aba **Meu Perfil** da plataforma.
(This is 3 lines).
Self-Correction during drafting:* The user said "não quero marcar agora" — confirm without pushing.
Sim, a **Losartana 50mg (1x/dia)** está registrada no seu perfil como medicamento em uso.
• Você pode conferir todos os seus dados e medicamentos na aba **Meu Perfil** da plataforma.`;
const r12 = extrairRespostaFinal(dump12);
const esperada12 = "Sim, a **Losartana 50mg (1x/dia)** está registrada no seu perfil como medicamento em uso.\n• Você pode conferir todos os seus dados e medicamentos na aba **Meu Perfil** da plataforma.";
verificar("scaffolds intercalados removidos, resposta única", r12 === esperada12, `got: ${r12?.slice(0, 160)}`);

console.log("=== 13. 'Let's ensure it's concise.' no fim antes da resposta (produção [4] v4) ===");
const dump13 = `*   The user asks about prescription renewal without symptoms.
Let's ensure it's concise.
Com certeza! A receita é emitida pelo médico em uma **teleconsulta de reavaliação** — é rápida e você não precisa estar com sintomas. Toque em **Agendar consulta** aqui embaixo que eu te guio no resto.`;
const r13 = extrairRespostaFinal(dump13);
const esperada13 = "Com certeza! A receita é emitida pelo médico em uma **teleconsulta de reavaliação** — é rápida e você não precisa estar com sintomas. Toque em **Agendar consulta** aqui embaixo que eu te guio no resto.";
verificar("'Let's ensure' quebra o bloco", r13 === esperada13, `got: ${r13?.slice(0, 160)}`);

console.log(`\n=== RESULTADO: ${passou} PASS / ${falhou} FAIL ===`);
process.exit(falhou ? 1 : 0);
