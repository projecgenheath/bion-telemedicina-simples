import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { garantirContaMedico, respostaErroConnect, statusContaMedico } from "@/lib/server/stripe-connect-medico";
import { stripeConnectAtivo, tipoContaConnect } from "@/lib/server/stripe";

/**
 * Conta Stripe (Connect) do PRÓPRIO médico. O médicoId vem só da sessão.
 * GET: status gravado (sem ir ao Stripe). POST: cria a conta se ainda não
 * existir (idempotente: nunca cria uma segunda). O id da conta não sai daqui
 * inteiro (só `temConta`).
 */
function wire(s: Awaited<ReturnType<typeof statusContaMedico>>) {
  return {
    temConta: !!s.conta,
    chargesEnabled: s.chargesEnabled,
    payoutsEnabled: s.payoutsEnabled,
    detailsSubmitted: s.detailsSubmitted,
    pronta: s.pronta,
    atualizadoEm: s.atualizadoEm,
    motivoBloqueio: s.motivoBloqueio,
    pendencias: s.pendencias,
    connectAtivo: stripeConnectAtivo(),
    tipoConta: tipoContaConnect(),
  };
}

export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    return ok(wire(await statusContaMedico(medico.id)));
  } catch (e) {
    return falha(e);
  }
}

export async function POST() {
  try {
    const medico = await exigirPapel("MEDICO");
    const r = await garantirContaMedico({ id: medico.id, email: medico.email });
    return ok({ ...wire(r.status), criada: r.criada });
  } catch (e) {
    return respostaErroConnect(e) ?? falha(e);
  }
}
