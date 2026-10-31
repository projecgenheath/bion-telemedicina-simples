import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { limitarAsync, obterIp, resposta429 } from "@/lib/server/rate-limit";
import { conferirCodigoVerificacao } from "@/lib/server/verificacao-documento";

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
    const teto = await limitarAsync(`publico-verificar:ip:${obterIp(req)}`, 60, 60_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);

    const { codigo } = await params;
    if (!codigo || codigo.length > 128) {
      return NextResponse.json({ valido: false }, { status: 400 });
    }

    const documentoId = conferirCodigoVerificacao(codigo);
    if (!documentoId) {
      // Assinatura não bate: não confirma nem nega a existência do id.
      return NextResponse.json({ valido: false }, { status: 404 });
    }

    const doc = await db.documento.findUnique({
      where: { id: documentoId },
      select: {
        tipo: true,
        createdAt: true,
        medico: { select: { nome: true, perfilMedico: { select: { crm: true } } } },
      },
    });
    if (!doc) {
      return NextResponse.json({ valido: false }, { status: 404 });
    }

    return NextResponse.json({
      valido: true,
      tipo: ROTULO_TIPO[doc.tipo] ?? "Documento clínico",
      emitidoEm: doc.createdAt.toISOString(),
      medico: doc.medico.nome,
      crm: doc.medico.perfilMedico?.crm || undefined,
    });
  } catch {
    return NextResponse.json({ valido: false }, { status: 500 });
  }
}
