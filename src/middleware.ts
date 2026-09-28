import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const COOKIE_SESSAO = "bion_sessao";

const PUBLICOS: readonly string[] = [
  "/api/auth/login",
  "/api/auth/registro",
  "/api/auth/sessao",
  "/api/auth/logout",
  "/api/pagamentos/webhook",
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
