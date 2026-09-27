import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * P1 — barreira leve nas rotas /api/*:
 * exige cookie de sessão presente, EXCETO allowlist pública.
 * A validação completa (expiração, status do usuário, papel) continua
 * em exigirSessao/exigirPapel em cada handler — o middleware só evita
 * que uma rota nova sem auth fique 100% aberta por omissão.
 */
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  if (ehPublico(pathname)) {
    return NextResponse.next();
  }
  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  if (!token) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
