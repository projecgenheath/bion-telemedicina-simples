/**
 * Testes das regras das pendências LGPD.
 * Rodar: bun src/lib/lgpd-pendencias-logica.teste.ts
 */
import { filtrarAbertas, idsPendenciaConcluidos, lerPathsStorage, marcaPendencia } from "./lgpd-pendencias-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`FALHOU ${nome}: obtido ${a}, esperado ${b}`);
  }
}

// 1) Fechada só com conclusão da PRÓPRIA pendência
igual("marca", marcaPendencia("p1"), "pendencia=p1");
const conc = idsPendenciaConcluidos(["pendencia=p1", "pendencia=p3; supabaseId=x", "supabaseId=abc", null, "outra pendencia=p9"]);
igual("ids concluídos", [...conc].sort(), ["p1", "p3"]);
igual("conclusão só com supabaseId não fecha", conc.has("abc"), false);
igual("texto livre com pendencia= no meio não fecha", conc.has("p9"), false);
// Duas pendências da mesma entidade: concluir a 1ª não fecha a 2ª
const mesmaEntidade = [{ id: "p1", entidadeId: "u1" }, { id: "p2", entidadeId: "u1" }];
igual("mesma entidade: só a concluída fecha", filtrarAbertas(mesmaEntidade, idsPendenciaConcluidos(["pendencia=p1"]), 10).map((p) => p.id), ["p2"]);

// 2) Limite depois do filtro
const muitas = Array.from({ length: 150 }, (_, i) => ({ id: `p${i}` }));
const fechadas = new Set(muitas.slice(0, 120).map((p) => p.id));
const abertas = filtrarAbertas(muitas, fechadas, 100);
igual("limite após filtrar: abertas novas aparecem", [abertas.length, abertas[0].id, abertas.at(-1)?.id], [30, "p120", "p149"]);
igual("limite corta só abertas", filtrarAbertas(muitas, new Set(), 100).length, 100);

// 3) Storage: JSON inválido vira falha
igual("paths ok", lerPathsStorage(JSON.stringify({ paths: ["a/b.pdf"], erro: "x" })), { ok: true, paths: ["a/b.pdf"] });
igual("JSON inválido é falha", lerPathsStorage("{quebrado").ok, false);
igual("vazio é falha", lerPathsStorage(null).ok, false);
igual("sem paths é falha", lerPathsStorage("{}").ok, false);
igual("paths não string é falha", lerPathsStorage(JSON.stringify({ paths: [1] })).ok, false);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
