import { NextRequest } from "next/server";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Registro de eventos de auditoria VINDOS DO CLIENTE — apenas eventos leves
 * de interface (exportações de PDF/CSV, interações de tela). Hardening:
 *
 *  - ALLOWLIST: só `acao` presentes no mapa abaixo são aceitos (403 caso contrário).
 *    Eventos críticos/privilegiados são gerados exclusivamente pelo servidor
 *    (rotas de mutação), que decide acao, categoria, severidade e detalhes.
 *  - A identidade SEMPRE vem da sessão; categoria e severidade são forçadas
 *    pelo servidor (o cliente não as escolhe).
 *  - detalhes são limitados a 300 caracteres.
 */
const EVENTOS_CLIENTE: Record<string, { categoria: string; severidade: "info" | "warning" }> = {
  DOCUMENTO_VISUALIZADO: { categoria: "documento", severidade: "info" },
  DOCUMENTO_PDF_BAIXADO: { categoria: "documento", severidade: "info" },
  PRONTUARIO_PDF_EXPORTADO: { categoria: "prontuario", severidade: "warning" },
  RELATORIO_CSV_EXPORTADO: { categoria: "admin", severidade: "info" },
  RELATORIO_PDF_EXPORTADO: { categoria: "admin", severidade: "info" },
  AUDITORIA_CSV_EXPORTADA: { categoria: "admin", severidade: "info" },
  AUDITORIA_PDF_EXPORTADA: { categoria: "admin", severidade: "info" },
  CONSULTA_INICIADA: { categoria: "consulta", severidade: "info" },
  CONSULTA_TELA_PAROU: { categoria: "consulta", severidade: "info" },
  CONSULTA_TELA_COMPARTILHADA: { categoria: "consulta", severidade: "info" },
  IA_CONSULTA_REALIZADA: { categoria: "sistema", severidade: "info" },
};

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { acao?: string; detalhes?: string };

    const permitido = body.acao ? EVENTOS_CLIENTE[body.acao] : undefined;
    if (!permitido) {
      return Response.json(
        { erro: "Evento de auditoria não permitido via cliente." },
        { status: 403 },
      );
    }

    await registrarAudit(usuario, {
      acao: body.acao!,
      categoria: permitido.categoria,
      severidade: permitido.severidade,
      detalhes: body.detalhes?.slice(0, 300),
    });

    // Reaproveita a resposta fresca para o cliente atualizar a trilha (se admin)
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
