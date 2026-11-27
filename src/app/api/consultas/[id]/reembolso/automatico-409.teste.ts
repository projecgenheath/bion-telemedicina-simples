/**
 * Seção 3.1 do contrato de 21/11: POST /api/consultas/[id]/reembolso com
 * reembolso automático aberto (Consulta.reembolsoAutomaticoEm) → 409 com
 * motivo "reembolso_automatico" e automatico { processadoEm, previstoPara }.
 * A checagem vem antes da de desfecho (falha técnica também é barrada).
 * Sem o campo, o comportamento legado não muda. GET devolve automatico.
 * Rodar: bun --conditions=react-server test ./src/app/api/consultas/[id]/reembolso/automatico-409.teste.ts
 */
import { beforeEach, expect, mock, test } from "bun:test";

const DATA = new Date("2026-11-19T14:00:00-03:00");
const VENCIMENTO = new Date("2026-11-26T14:00:00-03:00");

type ConsultaStub = {
  pacienteId: string;
  dataInicio: Date;
  status: string;
  pago: boolean;
  reembolsoAutomaticoEm: Date | null;
  eventos: { tipo: string; motivo: string; em: Date; dataAnterior: Date }[];
  pagamento: { id: string; status: string; valor: number; reembolsos?: unknown[] } | null;
};
let consultaAtual: ConsultaStub | null = null;
let reembolsoEncontrado: { processadoEm?: Date | null; id?: string } | null = null;

mock.module("@/lib/db", () => ({
  db: {
    consulta: { findUnique: async () => consultaAtual },
    reembolso: { findFirst: async () => reembolsoEncontrado },
  },
}));
mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "pac1", nome: "Paciente", role: "PACIENTE" }),
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/rate-limit", () => ({
  limitarAsync: async () => ({ permitido: true, restanteSeg: 0 }),
  resposta429: () => new Response(null, { status: 429 }),
}));

const { GET, POST } = await import("./route");

const consulta = (o: Partial<ConsultaStub> = {}): ConsultaStub => ({
  pacienteId: "pac1",
  dataInicio: DATA,
  status: "aguardando_reagendamento",
  pago: true,
  reembolsoAutomaticoEm: null,
  eventos: [],
  pagamento: { id: "pg1", status: "confirmado", valor: 150, reembolsos: [] },
  ...o,
});
const evento = (tipo: string) => ({ tipo, motivo: tipo, em: DATA, dataAnterior: DATA });
const pedir = () =>
  POST(
    new Request("http://x/api/consultas/c1/reembolso", {
      method: "POST",
      body: JSON.stringify({ justificativa: "Tive um imprevisto no trabalho" }),
    }) as never,
    { params: Promise.resolve({ id: "c1" }) },
  );
const ver = () => GET(new Request("http://x/api/consultas/c1/reembolso") as never, { params: Promise.resolve({ id: "c1" }) });

beforeEach(() => {
  consultaAtual = null;
  reembolsoEncontrado = null;
});

test("automático aberto + falha técnica: 409 automático ANTES da checagem de desfecho", async () => {
  consultaAtual = consulta({ reembolsoAutomaticoEm: VENCIMENTO, eventos: [evento("falha_tecnica")] });
  const r = await pedir();
  expect(r.status).toBe(409);
  const corpo = await r.json();
  expect(corpo.motivo).toBe("reembolso_automatico");
  expect(corpo.erro).toBe("O reembolso desta consulta é automático — você não precisa pedir. Ele é processado no mesmo cartão.");
  expect(corpo.automatico).toEqual({ processadoEm: null, previstoPara: VENCIMENTO.toISOString() });
});

test("automático aberto + falta do paciente: 409 automático, não o texto de pedido existente", async () => {
  consultaAtual = consulta({ status: "falta_paciente", reembolsoAutomaticoEm: VENCIMENTO, eventos: [evento("falta_paciente")] });
  const r = await pedir();
  expect(r.status).toBe(409);
  const corpo = await r.json();
  expect(corpo.motivo).toBe("reembolso_automatico");
  expect(corpo.automatico.previstoPara).toBe(VENCIMENTO.toISOString());
});

test("automático já processado: processadoEm preenchido", async () => {
  const quando = new Date("2026-11-26T14:05:00-03:00");
  consultaAtual = consulta({ reembolsoAutomaticoEm: VENCIMENTO, eventos: [evento("falha_tecnica")] });
  reembolsoEncontrado = { processadoEm: quando };
  const corpo = await (await pedir()).json();
  expect(corpo.automatico).toEqual({ processadoEm: quando.toISOString(), previstoPara: VENCIMENTO.toISOString() });
});

test("sem automático e sem falta: texto legado, sem motivo novo", async () => {
  consultaAtual = consulta({ status: "confirmada" });
  const r = await pedir();
  expect(r.status).toBe(409);
  const corpo = await r.json();
  expect(corpo.erro).toBe("O reembolso pelo app é só para consultas marcadas como falta.");
  expect(corpo.motivo).toBeUndefined();
  expect(corpo.automatico).toBeUndefined();
});

test("sem automático, falta + pedido existente: texto legado de pedido existente", async () => {
  // Data recente: o prazo de 7 dias do pedido manual ainda está aberto.
  const recente = new Date(Date.now() - 86_400_000);
  consultaAtual = consulta({
    status: "falta_paciente",
    dataInicio: recente,
    eventos: [{ tipo: "falta_paciente", motivo: "falta_paciente", em: recente, dataAnterior: recente }],
  });
  reembolsoEncontrado = { id: "r1" };
  const r = await pedir();
  expect(r.status).toBe(409);
  const corpo = await r.json();
  expect(corpo.erro).toBe("Já existe um pedido de reembolso para esta consulta.");
  expect(corpo.motivo).toBeUndefined();
});

test("GET: automatico { ativo, prazo } nos dois estados", async () => {
  consultaAtual = consulta({ reembolsoAutomaticoEm: VENCIMENTO, eventos: [evento("falta_paciente")] });
  let corpo = await (await ver()).json();
  expect(corpo.automatico).toEqual({ ativo: true, prazo: VENCIMENTO.toISOString() });
  consultaAtual = consulta({ eventos: [evento("falta_paciente")] });
  corpo = await (await ver()).json();
  expect(corpo.automatico).toEqual({ ativo: false, prazo: "" });
});
