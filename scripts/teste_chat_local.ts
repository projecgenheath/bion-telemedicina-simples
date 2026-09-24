/**
 * Teste rápido das intenções do motor local (chat-local.ts) — especialmente
 * a nova intenção de RENOVAÇÃO DE RECEITA e a saudação restrita a mensagens
 * puras. Uso: bun scripts/teste_chat_local.ts
 */
import { respostaLocal } from "../src/lib/server/chat-local";

const usuario = { id: "x", nome: "Marina Silva", role: "PACIENTE" };

const casos: { rotulo: string; texto: string; deveConter: string[]; naoDeveConter?: string[] }[] = [
  {
    rotulo: "renovar receita (cenário real da paciente)",
    texto: "Oi! Quero renovar uma receita médica, não tenho sintoma nenhum",
    deveConter: ["renovar uma receita", "teleconsulta"],
    naoDeveConter: ["Sou a **BION IA**. Posso:"],
  },
  {
    rotulo: "renovação (sem acento, outra formulação)",
    texto: "preciso da renovacao da receita do remédio",
    deveConter: ["renovar uma receita"],
  },
  {
    rotulo: "saudação pura",
    texto: "Oi",
    deveConter: ["Sou a **BION IA**"],
  },
  {
    rotulo: "saudação + tudo bem",
    texto: "Oi, tudo bem?",
    deveConter: ["Sou a **BION IA**"],
  },
  {
    rotulo: "sintoma real (não é renovação)",
    texto: "estou com dor de cabeça há dois dias",
    deveConter: ["não faço **diagnóstico**"],
  },
  {
    rotulo: "agendamento",
    texto: "quero marcar uma consulta",
    deveConter: ["Vamos agendar"],
  },
];

let falhas = 0;
for (const c of casos) {
  const r = await respostaLocal(usuario, [{ remetente: "usuario", texto: c.texto }]);
  const okDeve = c.deveConter.every((s) => r.includes(s));
  const okNao = (c.naoDeveConter ?? []).every((s) => !r.includes(s));
  const ok = okDeve && okNao;
  if (!ok) falhas += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${c.rotulo}`);
  if (!ok) console.log("   resposta:", r.slice(0, 140).replace(/\n/g, " | "));
}
console.log(falhas === 0 ? "TODOS_OK" : `FALHAS=${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
