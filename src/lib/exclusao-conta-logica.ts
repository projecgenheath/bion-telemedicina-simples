/**
 * Regras da exclusão da conta PELO PRÓPRIO PACIENTE (LGPD art. 18, VI).
 * A exclusão é a mesma anonimização da administração (lib/server/lgpd.ts):
 * dados pessoais anonimizados, prontuário guardado sem nome (Lei 13.787/2018).
 *
 * Antes, nada pode estar em aberto: consulta ativa (qualquer status que não
 * seja cancelada/concluída, de qualquer data), reembolso ainda não resolvido
 * ou multa de remarcação pendente. Funções puras, testadas em
 * exclusao-conta-logica.teste.ts.
 */
export const PALAVRA_CONFIRMACAO_EXCLUSAO = "EXCLUIR";

/** Status de consulta que encerram o ciclo (não bloqueiam a exclusão). */
export const STATUS_CONSULTA_ENCERRADA = ["cancelada", "concluida"] as const;
/**
 * Status de reembolso ainda em aberto: aprovado = ainda não pago; falhou = o
 * dinheiro continua devido ao paciente (o admin precisa do contato para pagar).
 */
export const STATUS_REEMBOLSO_ABERTO = ["em_analise", "solicitado", "aprovado", "falhou"] as const;
/** Pedido de renovação de receita em aberto (o médico ainda pode emitir receita). */
export const STATUS_RENOVACAO_ABERTA = ["aguardando_pagamento", "pendente"] as const;
/** Pagamento ainda pendente (inclui o da renovação por mensagem, sem consulta). */
export const STATUS_PAGAMENTO_PENDENTE = ["pendente"] as const;
/** Prazo (dias) para a BION concluir um pedido registrado com pendências (LGPD art. 19, II). */
export const PRAZO_CONCLUSAO_PEDIDO_DIAS = 15;
/** Status de remarcação com multa ainda em aberto. */
export const STATUS_REMARCACAO_ABERTA = ["pendente"] as const;

export type PendenciasExclusao = {
  consultasAtivas: number;
  reembolsosAbertos: number;
  remarcacoesAbertas: number;
  renovacoesAbertas: number;
  pagamentosPendentesSemConsulta: number;
};

export function confirmacaoExclusaoValida(texto: unknown): boolean {
  return typeof texto === "string" && texto.trim() === PALAVRA_CONFIRMACAO_EXCLUSAO;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Lista de motivos que impedem a exclusão (vazia = pode excluir). */
export function motivosBloqueioExclusao(p: PendenciasExclusao): string[] {
  const m: string[] = [];
  if (p.consultasAtivas > 0)
    m.push(`${plural(p.consultasAtivas, "consulta ativa", "consultas ativas")}: cancele ou aguarde a conclusão.`);
  if (p.reembolsosAbertos > 0)
    m.push(`${plural(p.reembolsosAbertos, "reembolso em andamento", "reembolsos em andamento")}: aguarde a conclusão.`);
  if (p.remarcacoesAbertas > 0)
    m.push(`${plural(p.remarcacoesAbertas, "remarcação com multa pendente", "remarcações com multa pendentes")}: pague ou aguarde expirar.`);
  if (p.renovacoesAbertas > 0)
    m.push(`${plural(p.renovacoesAbertas, "pedido de renovação de receita em aberto", "pedidos de renovação de receita em aberto")}: aguarde a resposta do médico ou cancele.`);
  if (p.pagamentosPendentesSemConsulta > 0)
    m.push(`${plural(p.pagamentosPendentesSemConsulta, "pagamento pendente", "pagamentos pendentes")}: conclua ou aguarde expirar.`);
  return m;
}

/** Texto mostrado quando o pedido fica registrado com pendências. */
export const MENSAGEM_PEDIDO_REGISTRADO =
  `Seu pedido de exclusão foi registrado. Assim que as pendências acima forem resolvidas, a BION conclui a exclusão em até ${PRAZO_CONCLUSAO_PEDIDO_DIAS} dias.`;
