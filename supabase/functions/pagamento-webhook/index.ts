import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bion-signature",
};

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Method not allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  const secret = Deno.env.get("BION_PAGAMENTO_WEBHOOK_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ erro: "Webhook não configurado" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const corpo = await req.text();
  const assinatura = req.headers.get("x-bion-signature")?.trim().toLowerCase() ?? "";
  const esperada = await hmacHex(secret, corpo);
  if (assinatura.length !== esperada.length || assinatura !== esperada) {
    return new Response(JSON.stringify({ erro: "Assinatura inválida" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const api = Deno.env.get("BION_API_URL")?.replace(/\/$/, "");
  if (api) {
    const r = await fetch(`${api}/api/pagamentos/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bion-signature": assinatura,
      },
      body: corpo,
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, aviso: "Defina BION_API_URL para processar no app." }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
