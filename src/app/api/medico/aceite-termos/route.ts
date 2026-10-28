import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { origemPermitida } from "@/lib/server/origem";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";
import { aceiteVigentePendente, gravarAceiteAtualizacao } from "@/lib/server/aceite-termos";
import { ERRO_ACEITE_TERMOS, ERRO_ACEITE_TERMOS_ATUALIZACAO, VERSAO_PRIVACIDADE, VERSAO_TERMOS_MEDICO, validarAceiteTermos } from "@/lib/aceite-termos";

/** Teto de tentativas de aceite por médico (anti-abuso). */
const LIMITE_ACEITE_MEDICO_POR_HORA = 10;

/**
 * Aceite dos Termos de Uso do médico e da Política de Privacidade para contas
 * já existentes (criadas pelo admin ou antes dos termos). Médico sempre pela
 * sessão — nunca por id no corpo.
 * GET: { pendente, versaoTermos, versaoPrivacidade }.
 * POST aceiteTermosPayload("MEDICO"): grava as linhas que faltam em Consentimento.
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    return ok({
      pendente: await aceiteVigentePendente(medico.id, "MEDICO"),
      versaoTermos: VERSAO_TERMOS_MEDICO,
      versaoPrivacidade: VERSAO_PRIVACIDADE,
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!origemPermitida(req)) {
      return Response.json({ erro: "Origem não permitida." }, { status: 403 });
    }
    const medico = await exigirPapel("MEDICO");
    const teto = await limitarAsync(`aceite-termos:medico:${medico.id}`, LIMITE_ACEITE_MEDICO_POR_HORA, 3_600_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
    const body = await req.json().catch(() => null);
    const aceite = validarAceiteTermos("MEDICO", body);
    if (!aceite.ok) {
      const erro = aceite.erro === ERRO_ACEITE_TERMOS ? ERRO_ACEITE_TERMOS_ATUALIZACAO : aceite.erro;
      return Response.json({ erro, campo: "aceiteTermos" }, { status: 400 });
    }
    // Marketing não é oferecido aqui: só termos + privacidade.
    await gravarAceiteAtualizacao(medico, "MEDICO", { ...aceite.valor, marketing: false });
    return ok({ pendente: false, versaoTermos: aceite.valor.versaoTermos, versaoPrivacidade: aceite.valor.versaoPrivacidade });
  } catch (erro) {
    return falha(erro);
  }
}
