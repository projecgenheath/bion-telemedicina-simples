/**
 * Testes da Ajuda do admin. Rodar: npx tsx src/components/bion/admin/conta/ajuda.teste.ts
 */
import { VIEW_TO_PATH } from "@/lib/rotas";
import { FAQ_ADMIN, buscarFaq } from "./ajuda";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}

igual("sem termo devolve tudo", buscarFaq(FAQ_ADMIN, "  ").length, FAQ_ADMIN.length);
igual("busca sem acento", buscarFaq(FAQ_ADMIN, "aprovo medico").map((f) => f.categoria), ["Médicos"]);
igual("busca em maiúsculas na resposta", buscarFaq(FAQ_ADMIN, "LGPD").some((f) => f.categoria === "Privacidade"), true);
igual("todas as palavras precisam aparecer", buscarFaq(FAQ_ADMIN, "repasse xyzzy").length, 0);
igual("regra da divisão: 10%", buscarFaq(FAQ_ADMIN, "10%").map((f) => f.categoria), ["Financeiro"]);
igual("todo destino é uma rota existente", FAQ_ADMIN.every((f) => !f.destino || Boolean(VIEW_TO_PATH[f.destino])), true);
igual("perguntas únicas", new Set(FAQ_ADMIN.map((f) => f.pergunta)).size, FAQ_ADMIN.length);

console.log(`ajuda admin: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
