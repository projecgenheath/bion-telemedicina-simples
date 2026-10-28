import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const COOKIE_SESSAO = "bion_sessao";

const PUBLICOS: readonly string[] = [
  "/api/auth/login",
  "/api/auth/registro",
  "/api/auth/sessao",
  "/api/auth/logout",
  "/api/pagamentos/webhook",
  "/api/pagamentos/stripe/webhook", // protegido pela assinatura do Stripe (STRIPE_WEBHOOK_SECRET)
  "/api/cron/fechar-repasses", // protegido pelo Bearer CRON_SECRET na própria rota
  "/api/cron/toque", // idem (pg_cron + pg_net a cada minuto)
  "/api/cron/espera-medico", // idem (pg_cron a cada minuto)
  "/api/cron/descarte-retencao", // idem (cron da Vercel, 03:00 em SP)
  "/api/cron/lgpd-pendencias", // idem (cron da Vercel, 04:00 em SP; pendências LGPD de Auth/Storage/desban)
  "/api/publico", // perfil público compartilhável /p/[id] — dados já públicos de médicos ativos
];

function ehPublico(pathname: string): boolean {
  if (pathname === "/api" || pathname === "/api/") return true;
  return PUBLICOS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: { headers: req.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let temSessaoSupabase = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: req.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    temSessaoSupabase = !!data.user;
  }

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") && !ehPublico(pathname)) {
    const legado = req.cookies.get(COOKIE_SESSAO)?.value;
    if (!temSessaoSupabase && !legado) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
