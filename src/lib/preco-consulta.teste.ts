/**
 * O preço da consulta é sempre o `valor` salvo; promoção nunca vale (CFM).
 * Rodar: bun src/lib/preco-consulta.teste.ts
 */
import { expect, test } from "bun:test";
import { precoConsulta, VALOR_PADRAO_CONSULTA } from "./preco-consulta";

test("usa o valor salvo do médico", () => {
  expect(precoConsulta({ valor: 200 })).toBe(200);
});

test("ignora qualquer campo de promoção ou desconto", () => {
  const perfil = {
    valor: 200,
    promocaoValor: 100,
    promocaoAte: new Date(Date.now() + 86_400_000),
    desconto: 50,
  } as { valor: number };
  expect(precoConsulta(perfil)).toBe(200);
});

test("sem perfil ou sem valor cai no padrão", () => {
  expect(precoConsulta(null)).toBe(VALOR_PADRAO_CONSULTA);
  expect(precoConsulta({ valor: null })).toBe(VALOR_PADRAO_CONSULTA);
});
