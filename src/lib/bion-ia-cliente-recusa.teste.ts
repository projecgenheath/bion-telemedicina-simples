/** Rodar: bun --conditions=react-server test ./src/lib/bion-ia-cliente-recusa.teste.ts */
import { expect, test } from "bun:test";
import { recusarIaGuardandoTermos } from "./bion-ia-cliente";
import { dataDaVersao, rotuloVersoes } from "./consentimento-ia";

let chamadas: { url: string; metodo: string }[] = [];
let resposta = 200;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  chamadas.push({ url, metodo: init?.method ?? "GET" });
  return new Response("{}", { status: resposta });
}) as unknown as typeof fetch;

test("recusar a IA com a caixa dos Termos marcada grava SÓ os Termos", async () => {
  chamadas = [];
  resposta = 200;
  expect(await recusarIaGuardandoTermos({ termosPendentes: true, marcouTermos: true })).toBe(true);
  expect(chamadas).toEqual([{ url: "/api/paciente/aceite-termos", metodo: "POST" }]);
});
test("recusar sem marcar os Termos não grava nada", async () => {
  chamadas = [];
  expect(await recusarIaGuardandoTermos({ termosPendentes: true, marcouTermos: false })).toBe(true);
  expect(await recusarIaGuardandoTermos({ termosPendentes: false, marcouTermos: true })).toBe(true);
  expect(chamadas).toEqual([]);
});
test("falha ao gravar os Termos → não fecha (false)", async () => {
  resposta = 503;
  expect(await recusarIaGuardandoTermos({ termosPendentes: true, marcouTermos: true })).toBe(false);
});
test("versão mostrada como data, sem código interno", () => {
  expect(dataDaVersao("termos-paciente-v2.1-2026-11-03")).toBe("03/11/2026");
  expect(rotuloVersoes("termos-paciente-v2-2026-10-28", "privacidade-v2-2026-10-28")).toBe("versão de 28/10/2026");
  expect(rotuloVersoes("a-2026-11-03", "b-2026-10-28")).toBe("versões de 03/11/2026 e 28/10/2026");
});
