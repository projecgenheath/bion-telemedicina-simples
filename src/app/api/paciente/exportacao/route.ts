import { NextResponse } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha } from "@/lib/server/http";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";
import { montarExportacaoPaciente } from "@/lib/server/exportacao";

/**
 * B13 (auditoria da área do paciente) — Exportação dos dados do PRÓPRIO
 * paciente (LGPD art. 18, II e V: acesso e portabilidade).
 *
 * GET autenticado: só o paciente da sessão (exigirPapel("PACIENTE")); o
 * usuarioId vem SEMPRE da sessão, nunca de parâmetro. Devolve um JSON
 * para download com o dossiê que o `carregarDados` já reúne no escopo
 * do paciente (ver lib/server/exportacao.ts) e registra a exportação na
 * auditoria. Teto por usuário contra exportações em massa repetidas.
 */
const LIMITE_EXPORTACOES_POR_HORA = 10;

export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const teto = await limitarAsync(`exportacao:${usuario.id}`, LIMITE_EXPORTACOES_POR_HORA, 3_600_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
    const dossie = await montarExportacaoPaciente(usuario);
    return NextResponse.json(dossie, {
      headers: {
        "Content-Disposition": 'attachment; filename="meus-dados-bion.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return falha(erro);
  }
}
