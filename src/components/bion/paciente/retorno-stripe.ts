/**
 * Textos da tela de retorno do Stripe (StatusPagamentoStripe).
 *
 * Correção do giro infinito: sem `consultaId` e sem `tipo` na URL (link
 * truncado, navegação direta), a tela caía no ramo "Confirmando pagamento…"
 * para sempre — o polling nem começava e nenhum erro aparecia. Agora esse
 * caso tem estado próprio, com orientação e caminho de saída.
 */
export type VoltaStripe = "sucesso" | "cancelado";

export function textoRetornoStripe(args: {
  consultaId: string;
  tipo: string | null;
  volta: VoltaStripe;
  /** O servidor já confirmou o pagamento desta consulta. */
  pago: boolean;
  /** O polling estourou o tempo sem confirmação. */
  esgotou: boolean;
}): { titulo: string; texto: string } {
  const { consultaId, tipo, volta, pago, esgotou } = args;

  // Sem NENHUM parâmetro não há o que acompanhar: erro claro, não loading eterno.
  if (!consultaId && !tipo) {
    return {
      titulo: "Não conseguimos acompanhar esse pagamento",
      texto:
        "O link de retorno chegou sem as informações da cobrança, então não dá para confirmar o status por aqui. Veja em Minhas consultas: se o pagamento foi aprovado, a consulta aparece como confirmada lá. Se o valor saiu do seu cartão e nada mudar em alguns minutos, fale com o suporte (Perfil → Suporte).",
    };
  }

  // Renovação de receita e multa de remarcação não têm consulta para acompanhar.
  if (!consultaId && tipo) {
    return volta === "cancelado"
      ? {
          titulo: "Pagamento não concluído",
          texto: "Nada foi cobrado. Você pode tentar de novo pelo app.",
        }
      : {
          titulo: "Pagamento enviado",
          texto:
            tipo === "renovacao"
              ? "Assim que o pagamento for confirmado, o pedido de renovação vai para o médico. Você recebe um aviso."
              : "Assim que o pagamento for confirmado, a nova data é aplicada. Você recebe um aviso.",
        };
  }

  if (pago) {
    return {
      titulo: "Pagamento confirmado",
      texto: "Sua consulta está confirmada. Se quiser, faça a triagem com a BION IA até 5 minutos antes do horário.",
    };
  }
  if (volta === "cancelado") {
    return {
      titulo: "Pagamento não concluído",
      texto: "Nada foi cobrado. A consulta continua aguardando pagamento.",
    };
  }
  if (esgotou) {
    return {
      titulo: "Ainda aguardando a confirmação",
      texto: "O banco ainda não confirmou. Você recebe um aviso assim que o pagamento for aprovado.",
    };
  }
  return {
    titulo: "Confirmando pagamento…",
    texto: "Estamos esperando a confirmação do pagamento. Isso costuma levar alguns segundos.",
  };
}
