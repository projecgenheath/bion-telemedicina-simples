import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { limitarAsync, obterIp, resposta429 } from "@/lib/server/rate-limit";
import { conferirCodigoVerificacao, VerificacaoIndisponivelError } from "@/lib/server/verificacao-documento";
import { crmNumeroUf } from "@/lib/medico-exibicao";

/** Página e API de verificação nunca entram em buscador (também em next.config). */
const SEM_INDEXAR = { "X-Robots-Tag": "noindex, nofollow" } as const;
/** Teto por IP: uma farmácia confere poucas vias por minuto; 20/min barra varredura. */
export const LIMITE_VERIFICAR_IP_POR_MIN = 20;

function json(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: SEM_INDEXAR });
}

/**
 * Verificação PÚBLICA de documento clínico (item 26 da auditoria de
 * melhorias médicas) — sustenta a página /verificar/[codigo] impressa nas
 * vias em PDF.
 *
 * O código é `<documentoId>-<HMAC truncado>`: a assinatura é conferida
 * ANTES de qualquer leitura no banco, então código forjado/adulterado nem
 * chega ao Prisma. A resposta expõe SOMENTE o que uma farmácia ou
 * empregador precisa para conferir a via: válido ou não, o tipo do
 * documento, a data de emissão e o médico emissor (nome + CRM). NENHUM
 * dado clínico (medicamento, conteúdo, CID) e NENHUM dado do paciente.
 *
 * Não é assinatura ICP-Brasil — é prova de emissão/integridade do
 * registro na plataforma, e a página diz isso com todas as letras.
 */
const ROTULO_TIPO: Record<string, string> = {
  receita: "Receita médica",
  atestado: "Atestado médico",
  exame: "Solicitação de exames",
  exame_solicitado: "Solicitação de exames",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  try {
    // Rota anônima: rate-limit por IP (mesmo padrão de /api/publico/medico).
    const teto = await limitarAsync(`publico-verificar:ip:${obterIp(req)}`, LIMITE_VERIFICAR_IP_POR_MIN, 60_000);
    if (!teto.permitido) {
      const r = resposta429(teto.restanteSeg);
      r.headers.set("X-Robots-Tag", SEM_INDEXAR["X-Robots-Tag"]);
      return r;
    }

    const { codigo } = await params;
    if (!codigo || codigo.length > 128) {
      return json({ valido: false }, 400);
    }

    const documentoId = conferirCodigoVerificacao(codigo);
    if (!documentoId) {
      // Assinatura não bate: não confirma nem nega a existência do id.
      return json({ valido: false }, 404);
    }

    const doc = await db.documento.findUnique({
      where: { id: documentoId },
      select: {
        tipo: true,
        createdAt: true,
        status: true,
        canceladoEm: true,
        medico: { select: { nome: true, perfilMedico: { select: { crm: true } } } },
      },
    });
    if (!doc) {
      return json({ valido: false }, 404);
    }

    const cancelado = doc.status === "cancelado";
    return json({
      // Cancelado: a emissão é autêntica, mas o documento NÃO vale mais.
      valido: !cancelado,
      cancelado,
      canceladoEm: cancelado && doc.canceladoEm ? doc.canceladoEm.toISOString() : undefined,
      tipo: ROTULO_TIPO[doc.tipo] ?? "Documento clínico",
      emitidoEm: doc.createdAt.toISOString(),
      medico: doc.medico.nome,
      crm: doc.medico.perfilMedico?.crm ? crmNumeroUf(doc.medico.perfilMedico.crm) : undefined,
    });
  } catch (e) {
    if (e instanceof VerificacaoIndisponivelError) {
      // Falha fechada: sem o segredo neste ambiente não confirmamos nada.
      return json({ valido: false, indisponivel: true }, 503);
    }
    return json({ valido: false }, 500);
  }
}
