import type { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { linkOnboardingMedico, respostaErroConnect } from "@/lib/server/stripe-connect-medico";

/**
 * POST /api/medico/stripe/conta/link — link de onboarding do Stripe para o
 * PRÓPRIO médico (cria a conta antes, se faltar). Link de uso único e curto:
 * o front redireciona na hora.
 */
export async function POST(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
    return ok(await linkOnboardingMedico({ id: medico.id, email: medico.email }, base));
  } catch (e) {
    return respostaErroConnect(e) ?? falha(e);
  }
}
