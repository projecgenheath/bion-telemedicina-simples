import { NextResponse, type NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { linkOnboardingMedico, sincronizarContaMedico } from "@/lib/server/stripe-connect-medico";

/**
 * GET /api/medico/stripe/conta/retorno — return_url/refresh_url do Account
 * Link. return: relê a conta no Stripe, grava o status e volta ao perfil do
 * médico. refresh=1 (link expirado): gera um link novo e redireciona.
 * Sem sessão de médico: vai para o login.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const voltar = (estado: string) => NextResponse.redirect(new URL(`/painel?painel=perfil&stripe=${estado}`, base), 303);
  let medico;
  try {
    medico = await exigirPapel("MEDICO");
  } catch {
    return NextResponse.redirect(new URL("/entrar", base), 303);
  }
  try {
    if (req.nextUrl.searchParams.get("refresh") === "1") {
      const link = await linkOnboardingMedico({ id: medico.id, email: medico.email }, base);
      return NextResponse.redirect(link.url, 303);
    }
    const s = await sincronizarContaMedico(medico.id);
    return voltar(s.pronta ? "ok" : "pendente");
  } catch (e) {
    console.error("[stripe-conta-retorno]", e instanceof Error ? e.message : e);
    return voltar("erro");
  }
}
