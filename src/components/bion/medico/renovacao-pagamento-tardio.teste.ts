/**
 * Pagamento tardio da renovação depois do cancelamento do documento
 * (pedido "recusada"): o webhook reembolsa; nunca reembolsa duas vezes.
 * Rodar: bun --conditions=react-server test src/components/bion/medico/renovacao-pagamento-tardio.teste.ts
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { confirmarPagamentoRenovacao, renovacaoEncerradaSemAtendimento } from "../../../lib/server/renovacao-pagamento";

type Reemb = { id: string; pagamentoId: string; status: string; valorCentavos: number };

function txFalso(statusPedido: string, statusPagamento = "confirmado", reembolsos: Reemb[] = []) {
  const pedido = { id: "p1", pagamentoId: "pg1", status: statusPedido };
  const pagamento = { id: "pg1", status: statusPagamento, valor: 150 };
  const tx = {
    pedidoRenovacao: {
      findUnique: async () => ({ ...pedido }),
      updateMany: async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
        if (pedido.status !== where.status) return { count: 0 };
        pedido.status = data.status;
        return { count: 1 };
      },
    },
    pagamento: { findUnique: async () => ({ ...pagamento }) },
    reembolso: {
      findFirst: async ({ where }: { where: { status: { in: string[] } } }) =>
        reembolsos.find((r) => where.status.in.includes(r.status)) ?? null,
      create: async ({ data }: { data: Omit<Reemb, "id"> }) => {
        const r = { id: `r${reembolsos.length + 1}`, ...data };
        reembolsos.push(r);
        return r;
      },
    },
  };
  return { tx: tx as never, pedido, reembolsos };
}

test("estados encerrados sem atendimento", () => {
  expect(renovacaoEncerradaSemAtendimento("recusada")).toBe(true);
  expect(renovacaoEncerradaSemAtendimento("cancelado")).toBe(true);
  for (const s of ["aguardando_pagamento", "pendente", "renovada", "chamada_marcada"]) expect(renovacaoEncerradaSemAtendimento(s)).toBe(false);
});

test("pagamento tardio após cancelamento do documento (recusada) → reembolso integral", async () => {
  const { tx, reembolsos, pedido } = txFalso("recusada");
  expect(await confirmarPagamentoRenovacao("pg1", tx)).toBe("reembolsado");
  expect(reembolsos.length).toBe(1);
  expect(reembolsos[0].valorCentavos).toBe(15000);
  expect(pedido.status).toBe("recusada");
});

test("webhook repetido não reembolsa duas vezes", async () => {
  const { tx, reembolsos } = txFalso("recusada");
  await confirmarPagamentoRenovacao("pg1", tx);
  await confirmarPagamentoRenovacao("pg1", tx);
  expect(reembolsos.length).toBe(1);
});

test("pedido recusado já reembolsado na recusa não ganha segundo reembolso", async () => {
  const { tx, reembolsos } = txFalso("recusada", "confirmado", [{ id: "r0", pagamentoId: "pg1", status: "processado", valorCentavos: 15000 }]);
  expect(await confirmarPagamentoRenovacao("pg1", tx)).toBe("reembolsado");
  expect(reembolsos.length).toBe(1);
});

test("pedido já pago e processado (pendente/renovada) não é reembolsado", async () => {
  for (const s of ["pendente", "renovada", "chamada_marcada"]) {
    const { tx, reembolsos } = txFalso(s);
    expect(await confirmarPagamentoRenovacao("pg1", tx)).toBe("ja_processado");
    expect(reembolsos.length).toBe(0);
  }
});

test("caminho normal: aguardando_pagamento → pendente, sem reembolso", async () => {
  const { tx, reembolsos, pedido } = txFalso("aguardando_pagamento");
  expect(await confirmarPagamentoRenovacao("pg1", tx)).toBe("pendente");
  expect(pedido.status).toBe("pendente");
  expect(reembolsos.length).toBe(0);
});

test("cancelamento expira o checkout aberto (erros ignorados)", () => {
  const rota = readFileSync("src/app/api/medico/documentos/[id]/cancelar/route.ts", "utf8");
  const gw = readFileSync("src/lib/server/gateway-pagamento.ts", "utf8");
  expect(rota).toContain("await expirarCheckoutsAbertos(");
  expect(rota).toMatch(/status === "pendente" \? p\.pagamento\.stripeCheckoutSessionId/);
  expect(gw).toMatch(/checkout\.sessions\.expire\([\s\S]{0,120}\} catch \{\s*return false/);
});
