import { NextResponse, type NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ehChaveLiveBloqueada, linkOnboardingMedico, sincronizarContaMedico } from "@/lib/server/stripe-connect-medico";

/**
 * GET /api/medico/stripe/conta/retorno — return_url/refresh_url do Account
 * Link. return: relê a conta no Stripe, grava o status e volta ao perfil do
 * médico. refresh=1 (link expirado): gera um link novo SÓ se a conta já
 * existe (nunca cria; sem conta → stripe=sem_conta). Chave live → stripe=indisponivel.
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
      // Refresh NUNCA cria conta (criação só no POST): sem conta volta ao perfil.
      const link = await linkOnboardingMedico({ id: medico.id, email: medico.email }, base, {}, { criar: false });
      return link ? NextResponse.redirect(link.url, 303) : voltar("sem_conta");
    }
    const s = await sincronizarContaMedico(medico.id);
    return voltar(s.pronta ? "ok" : "pendente");
  } catch (e) {
    if (ehChaveLiveBloqueada(e)) return voltar("indisponivel");
    console.error("[stripe-conta-retorno]", e instanceof Error ? e.message : e);
    return voltar("erro");
  }
}
