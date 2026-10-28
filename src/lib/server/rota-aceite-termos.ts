import type { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { origemPermitida } from "@/lib/server/origem";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";
import { aceiteVigentePendente, gravarAceiteAtualizacao } from "@/lib/server/aceite-termos";
import {
  ERRO_ACEITE_TERMOS,
  ERRO_ACEITE_TERMOS_ATUALIZACAO,
  ERRO_TERMOS_PERFIL_INDEFINIDO,
  VERSAO_PRIVACIDADE,
  VERSAO_TERMOS_POR_PERFIL,
  validarAceiteTermos,
  type PerfilAceite,
} from "@/lib/aceite-termos";

/** Teto de tentativas de aceite por usuário (anti-abuso). */
export const LIMITE_ACEITE_POR_HORA = 10;

/**
 * Handlers genéricos do re-aceite (termos do perfil + privacidade vigentes).
 * Usuário sempre pela sessão, papel = perfil. Versão lida de
 * VERSAO_TERMOS_POR_PERFIL[perfil]. Hoje ligado só para MEDICO
 * (src/app/api/medico/aceite-termos); o paciente pode reusar depois.
 */
export function criarRotaAceiteTermos(perfil: PerfilAceite) {
  async function GET() {
    try {
      const usuario = await exigirPapel(perfil);
      const versaoTermos = VERSAO_TERMOS_POR_PERFIL[perfil];
      if (!versaoTermos) return Response.json({ erro: ERRO_TERMOS_PERFIL_INDEFINIDO }, { status: 503 });
      return ok({ pendente: await aceiteVigentePendente(usuario.id, perfil), versaoTermos, versaoPrivacidade: VERSAO_PRIVACIDADE });
    } catch (erro) {
      return falha(erro);
    }
  }

  async function POST(req: NextRequest) {
    try {
      if (!origemPermitida(req)) {
        return Response.json({ erro: "Origem não permitida." }, { status: 403 });
      }
      const usuario = await exigirPapel(perfil);
      const teto = await limitarAsync(`aceite-termos:${perfil.toLowerCase()}:${usuario.id}`, LIMITE_ACEITE_POR_HORA, 3_600_000);
      if (!teto.permitido) return resposta429(teto.restanteSeg);
      const body = await req.json().catch(() => null);
      const aceite = validarAceiteTermos(perfil, body);
      if (!aceite.ok) {
        const erro = aceite.erro === ERRO_ACEITE_TERMOS ? ERRO_ACEITE_TERMOS_ATUALIZACAO : aceite.erro;
        return Response.json({ erro, campo: "aceiteTermos" }, { status: 400 });
      }
      // Marketing não é oferecido no re-aceite: só termos + privacidade.
      await gravarAceiteAtualizacao(usuario, perfil, { ...aceite.valor, marketing: false });
      return ok({ pendente: false, versaoTermos: aceite.valor.versaoTermos, versaoPrivacidade: aceite.valor.versaoPrivacidade });
    } catch (erro) {
      return falha(erro);
    }
  }

  return { GET, POST };
}
