import { test, expect, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

beforeEach(() => {
  // Sem Supabase configurado: só o cookie legado conta como sessão.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});

const post = (path: string) => new NextRequest(`https://app.test${path}`, { method: "POST" });

test("webhook do Stripe Connect passa sem sessão (a rota valida a assinatura)", async () => {
  const r = await middleware(post("/api/stripe/webhook-connect"));
  expect(r.status).not.toBe(401);
});

test("webhook do Stripe da plataforma continua público", async () => {
  const r = await middleware(post("/api/pagamentos/stripe/webhook"));
  expect(r.status).not.toBe(401);
});

test("outras rotas /api/stripe continuam exigindo sessão", async () => {
  const r = await middleware(post("/api/stripe/outra"));
  expect(r.status).toBe(401);
});

test("prefixo parecido não vira público", async () => {
  const r = await middleware(post("/api/stripe/webhook-connect-falso"));
  expect(r.status).toBe(401);
});

test("rota de admin sem sessão continua 401", async () => {
  const r = await middleware(post("/api/admin/reembolsos"));
  expect(r.status).toBe(401);
});
