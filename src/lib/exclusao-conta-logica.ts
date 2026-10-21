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
/** Status de reembolso ainda em aberto (aprovado = ainda não pago ao paciente). */
export const STATUS_REEMBOLSO_ABERTO = ["em_analise", "solicitado", "aprovado"] as const;
/** Status de remarcação com multa ainda em aberto. */
export const STATUS_REMARCACAO_ABERTA = ["pendente"] as const;

export type PendenciasExclusao = {
  consultasAtivas: number;
  reembolsosAbertos: number;
  remarcacoesAbertas: number;
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
  return m;
}
