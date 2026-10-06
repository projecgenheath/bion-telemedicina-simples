/**
 * Testes do tópico Realtime da sala (lib/server/sala-canal.ts).
 * Rodar: bun --conditions=react-server src/lib/server/sala-canal.teste.ts
 */
import { topicoSala } from "./sala-canal";

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

const id = "cmg1abcdef0001xyz";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
igual("sem service role: tópico simples", topicoSala(id), `sala:consulta:${id}`);

process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-1";
const t1 = topicoSala(id);
igual("formato sala:consulta:<id>:<hmac>", /^sala:consulta:cmg1abcdef0001xyz:[A-Za-z0-9_-]{32}$/.test(t1), true);
// A policy RLS tira o id com split_part(topico, ':', 3)
igual("3º pedaço é o id da consulta (policy RLS)", t1.split(":")[2], id);
igual("estável para a mesma consulta", topicoSala(id), t1);
igual("outra consulta, outro sufixo", topicoSala("outra").split(":")[3] === t1.split(":")[3], false);
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-2";
igual("outra chave, outro sufixo (não adivinhável sem a chave)", topicoSala(id) === t1, false);

console.log(`sala-canal: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
