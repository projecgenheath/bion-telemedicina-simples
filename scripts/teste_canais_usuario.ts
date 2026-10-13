/**
 * Testes dos tópicos Realtime privados por usuário (lib/server/usuario-canal.ts).
 * Rodar: bun --conditions=react-server scripts/teste_canais_usuario.ts
 */
import { topicoMensagensUsuario, topicoNotificacoesUsuario } from "../src/lib/server/usuario-canal";

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

const id = "cmg1usuario0001xyz";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
igual("sem service role: mensagens simples", topicoMensagensUsuario(id), `mensagens:user:${id}`);
igual("sem service role: notificações simples", topicoNotificacoesUsuario(id), `notificacoes:user:${id}`);

process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-1";
const m1 = topicoMensagensUsuario(id);
const n1 = topicoNotificacoesUsuario(id);
igual("formato mensagens:user:<id>:<hmac>", /^mensagens:user:cmg1usuario0001xyz:[A-Za-z0-9_-]{32}$/.test(m1), true);
igual("formato notificacoes:user:<id>:<hmac>", /^notificacoes:user:cmg1usuario0001xyz:[A-Za-z0-9_-]{32}$/.test(n1), true);
igual("3º pedaço é o id do usuário (mensagens, policy RLS)", m1.split(":")[2], id);
igual("3º pedaço é o id do usuário (notificações, policy RLS)", n1.split(":")[2], id);
igual("4 pedaços (sem ':' extra)", [m1.split(":").length, n1.split(":").length], [4, 4]);
igual("estável para o mesmo usuário", topicoMensagensUsuario(id), m1);
igual("mensagens e notificações com sufixos diferentes", m1.split(":")[3] === n1.split(":")[3], false);
igual("outro usuário, outro sufixo", topicoMensagensUsuario("outro").split(":")[3] === m1.split(":")[3], false);
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-2";
igual("outra chave, outro sufixo (não adivinhável)", topicoMensagensUsuario(id) === m1, false);
igual("outra chave, outro sufixo (notificações)", topicoNotificacoesUsuario(id) === n1, false);

console.log(`usuario-canal: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
