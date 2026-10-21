import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { registrarMarketing, ultimoMarketing } from "@/lib/server/aceite-termos";
import { marketingAtivo, VERSAO_MARKETING_OPTIN } from "@/lib/aceite-termos";

/**
 * Opt-in de marketing do paciente (opcional, separado dos termos).
 * GET: estado atual (último registro). POST { aceito: boolean }: grava nova
 * linha em Consentimento (aceite ou revogação) + AuditLog só com id.
 * Paciente sempre pela sessão.
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const u = await ultimoMarketing(usuario.id);
    return ok({ ativo: marketingAtivo(u), em: u?.createdAt.toISOString() ?? null, versao: VERSAO_MARKETING_OPTIN });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json().catch(() => null)) as { aceito?: unknown } | null;
    if (!body || typeof body.aceito !== "boolean") {
      return Response.json({ erro: "Informe aceito: true ou false." }, { status: 400 });
    }
    const atual = marketingAtivo(await ultimoMarketing(usuario.id));
    if (atual === body.aceito) {
      return ok({ ativo: atual, em: null, versao: VERSAO_MARKETING_OPTIN });
    }
    const linha = await registrarMarketing(usuario, "PACIENTE", body.aceito);
    return ok({ ativo: body.aceito, em: linha.createdAt.toISOString(), versao: VERSAO_MARKETING_OPTIN });
  } catch (erro) {
    return falha(erro);
  }
}
