import "server-only";
import { after } from "next/server";
import { enviarPushParaUsuario } from "@/lib/server/web-push";
import type { NotifPayload } from "@/lib/server/dados";

/* ------------------------------------------------------------------ */
/* Push assíncrono das notificações do MÉDICO (item 12 da auditoria    */
/* de melhorias). Até aqui, `enviarPushParaUsuario` só era chamado     */
/* pelo toque da chamada (toque.ts); as notificações que o servidor    */
/* já cria (nova marcação, cancelamento, remarcação, mensagem,         */
/* avaliação) só chegavam pelo Realtime/bootstrap — com o app fechado, */
/* o médico não ficava sabendo de nada.                                */
/*                                                                     */
/* Regras (as mesmas do toque):                                        */
/*  - efeito colateral NÃO bloqueante: roda em `after()` (depois da    */
/*    resposta) e qualquer falha é engolida — push NUNCA derruba a     */
/*    operação principal;                                              */
/*  - o payload é GENÉRICO: título sem nome nem dado pessoal e corpo   */
/*    fixo, porque a notificação aparece na tela de bloqueio do        */
/*    aparelho (decisão já tomada para o toque: nada de nome de        */
/*    paciente fora do app). Quem chama garante um título seguro —     */
/*    os títulos de agenda/avaliação das rotas já são genéricos; o     */
/*    de mensagem, que traz o nome do remetente, é substituído na      */
/*    rota por "Nova mensagem";                                        */
/*  - tipo próprio ("notificacao") no payload: o service worker        */
/*    (public/sw.js) renderiza título/corpo/url dele, sem tocar no     */
/*    comportamento do toque ("chamada_tocando").                      */
/* ------------------------------------------------------------------ */

export const TIPO_PUSH_NOTIFICACAO = "notificacao";
/** Corpo fixo e genérico: o detalhe (com nomes) só aparece dentro do app. */
export const CORPO_PUSH_NOTIFICACAO = "Abra o BION para ver os detalhes.";
/** 1 h: notificação de agenda/mensagem não precisa acordar o aparelho um dia depois. */
const TTL_PUSH_NOTIFICACAO_S = 3_600;

/** Payload renderizado pelo sw.js para o tipo "notificacao". */
export function payloadPushNotificacao(titulo: string, url: string): Record<string, unknown> {
  return { tipo: TIPO_PUSH_NOTIFICACAO, titulo, corpo: CORPO_PUSH_NOTIFICACAO, url };
}

/** Destino no app do médico por tipo de notificação (a Notificacao não carrega o id da entidade). */
export function urlPushMedico(tipo: string): string {
  return tipo === "mensagem" ? "/medico?painel=pacientes" : "/medico";
}

/**
 * Agenda o Web Push de UMA notificação para UM usuário. Não bloqueia nem
 * lança: fora de contexto de requisição (testes/scripts) o `after` falha e
 * o push é simplesmente ignorado.
 */
export function agendarPushNotificacao(usuarioId: string, titulo: string, url: string): void {
  try {
    after(async () => {
      await enviarPushParaUsuario(usuarioId, payloadPushNotificacao(titulo, url), {
        ttl: TTL_PUSH_NOTIFICACAO_S,
      }).catch(() => null);
    });
  } catch {
    /* sem contexto de requisição: nada a fazer */
  }
}

/**
 * Dispara o push de todas as notificações da lista endereçadas ao
 * destinatário (as de papel amplo, sem usuarioId, não têm aparelho alvo e
 * são ignoradas). Usado pelas rotas que já compõem `NotifPayload[]` para
 * `aplicarSideEffects` — o push espelha a MESMA lista, sem recomposições.
 */
export function agendarPushNotificacoes(
  eventos: readonly NotifPayload[],
  destinatarioId: string,
): void {
  for (const n of eventos) {
    if (n.usuarioId === destinatarioId) {
      agendarPushNotificacao(destinatarioId, n.titulo, urlPushMedico(n.tipo));
    }
  }
}
