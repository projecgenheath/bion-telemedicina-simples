import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { retidoNaPlataforma } from "@/lib/server/retido-plataforma";
import { AVISO_GERAL_RECEBIMENTO, TOTAIS_ZERO } from "@/lib/recebimento-modelo";

/**
 * GET /api/medico/repasses — SOMENTE LEITURA.
 *
 * Modelo NOVO (decisão do Alisson de 21/11/2026, contrato-api-pagamento-2111.md):
 * o médicoId vem só da sessão (`exigirPapel("MEDICO")`), nunca de query/corpo.
 * `retido` traz o valor pago que fica na conta da plataforma até a consulta
 * terminar; `transferencias`, `reembolsos` e `totais` completam o contrato.
 * A transferência de 90% menos a taxa do cartão após o desfecho "realizada"
 * é parte do Admin. Ver src/lib/server/retido-plataforma.ts.
 *
 * Privacidade: sem CPF/contato/chave do item/reembolsoId. Os itens trazem
 * só tipo, data e valores (sem nome de paciente).
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");

    // Modelo novo: valor pago que fica na plataforma até a consulta terminar.
    const retido = await retidoNaPlataforma(medico.id);

    return ok({
      /**
       * Modelo novo (contrato-api-pagamento-2111.md, seção 2). Os campos do
       * modelo anterior (saldo, prévia, repasses PIX, cobrança direta) saem
       * da resposta. `transferencias` e `reembolsos` vêm vazios até o Admin
       * criar a tabela TransferenciaMedico e ligar a cobrança na plataforma.
       */
      modelo: "plataforma" as const,
      retido,
      transferencias: [],
      reembolsos: [],
      totais: TOTAIS_ZERO,
      aviso: AVISO_GERAL_RECEBIMENTO,
    });
  } catch (erro) {
    return falha(erro);
  }
}
