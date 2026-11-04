/**
 * Intenção de abertura do chat da BION IA (paciente) — regras puras.
 *
 * "laudo": o paciente tocou em "Enviar novo laudo" (seção Exames
 * laboratoriais). O chat abre direto no contexto de envio — mensagem
 * contextual e ação de escolher o arquivo — em vez da saudação genérica
 * com "agendar consulta" em destaque (o paciente clicava numa coisa e
 * caía noutra, tendo que caçar o chip certo).
 * "geral": qualquer outra abertura (agendar, perguntar) — comportamento
 * histórico, intocado.
 */
export type IntencaoChat = "geral" | "laudo";

/** Mensagem contextual que abre a conversa no modo laudo. */
export const TEXTO_ENVIO_LAUDO =
  "Envie o PDF ou a foto do seu laudo. Eu confiro se o nome no documento é o seu e os resultados aparecem em Exames laboratoriais.";

/** Saudação genérica do modo geral (texto histórico do chat). */
export function textoSaudacaoGeral(primeiroNome: string): string {
  return `Olá, ${primeiroNome}! Sou a **BION IA**. Posso agendar consulta, ler um laudo (PDF ou foto) e tirar dúvidas de saúde. A **triagem** é opcional e fica no card da consulta, não neste chat. Como posso ajudar?`;
}

/** Texto da primeira mensagem da assistente, conforme a intenção. */
export function textoAberturaChat(intencao: IntencaoChat | undefined, primeiroNome: string): string {
  return intencao === "laudo" ? TEXTO_ENVIO_LAUDO : textoSaudacaoGeral(primeiroNome);
}

/** A conversa já começa com a mensagem contextual de envio de laudo? */
export function primeiraEhContextoLaudo(mensagens: readonly { texto: string }[]): boolean {
  return mensagens[0]?.texto === TEXTO_ENVIO_LAUDO;
}

/**
 * Cartão fixo de envio no topo da conversa: modo laudo com histórico que
 * NÃO começou pela mensagem contextual (ex.: conversa aberta antes pelo
 * caminho geral e reaberta por "Enviar novo laudo"). Se a conversa já
 * abre com a mensagem contextual, o cartão duplicaria o mesmo texto —
 * nesse caso quem aparece é o botão de ação (mostrarAcaoLaudo).
 */
export function mostrarCartaoLaudo(
  intencao: IntencaoChat | undefined,
  mensagens: readonly { texto: string }[],
): boolean {
  return intencao === "laudo" && mensagens.length > 0 && !primeiraEhContextoLaudo(mensagens);
}

/**
 * Botão "Escolher arquivo do laudo" sob a mensagem contextual, enquanto
 * a conversa tem só ela (depois da primeira interação, o fluxo segue
 * pelo botão de anexar da barra de entrada, como hoje).
 */
export function mostrarAcaoLaudo(
  intencao: IntencaoChat | undefined,
  mensagens: readonly { texto: string }[],
): boolean {
  return intencao === "laudo" && mensagens.length === 1 && primeiraEhContextoLaudo(mensagens);
}

/* ------------------------------------------------------------------ */
/* F1 (auditoria de errinhos): o wizard de NOVO agendamento sequestrava */
/* qualquer mensagem com "consulta/marcar/horário" — inclusive gestão   */
/* da consulta que a pessoa JÁ tem ("quero remarcar minha consulta",    */
/* "como cancelo?", "minha consulta é que horas?"), que caía na         */
/* escolha de especialidade e a pergunta nunca era respondida.          */
/* ------------------------------------------------------------------ */

/**
 * Contexto de GESTÃO da consulta existente: remarcar, cancelar, saber
 * dia/hora ou preço da consulta. Essas mensagens NÃO abrem o wizard —
 * vão para a IA, que responde com o caminho real no app (card da
 * consulta → Remarcar/Cancelar; ver promptPaciente).
 */
export function ehGestaoConsulta(texto: string): boolean {
  const t = texto.toLowerCase();
  return /remarcar|remarca|desmarcar|cancel|minha consulta|minhas consultas|que horas|a que horas|quando (é|eh|sera|será) |quanto custa|quanto (é|eh) a consulta|preço da consulta|valor da consulta|consulta (já )?(marcada|agendada)/.test(
    t,
  );
}

/**
 * A mensagem deve abrir o wizard de NOVO agendamento? Só com vocabulário
 * de agendamento E sem contexto de gestão (a gestão tem precedência:
 * "quero remarcar" contém "marcar", mas é gestão).
 */
export function deveAbrirWizardAgendamento(texto: string): boolean {
  if (ehGestaoConsulta(texto)) return false;
  return /agend|marcar|marcacao|marcação|consulta|disponibilidade|horario|horário/.test(texto.toLowerCase());
}
