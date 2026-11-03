/**
 * Canal efêmero entre a lista de pacientes e a conversa (item 33,
 * fidelização): ao tocar em "Propor retorno", a lista guarda aqui o texto
 * do modelo e a ConversaPaciente o consome UMA vez ao abrir.
 *
 * Só memória (Map no módulo) — nada vai para o servidor nem para o
 * aparelho de forma persistente, e NADA é enviado por este canal: o texto
 * apenas PREENCHE o campo da conversa; quem envia é o médico, depois de
 * revisar, no botão de enviar de sempre. Se a conversa não abrir (ou abrir
 * para outro paciente), o rascunho de outro paciente nunca é aplicado —
 * a chave é a `chave` do paciente (pacienteId ou "nome:<nome>").
 */
const pendentes = new Map<string, string>();

/** Guarda o rascunho de retorno para a conversa daquele paciente. */
export function definirRascunhoRetorno(chavePaciente: string, texto: string): void {
  pendentes.set(chavePaciente, texto);
}

/** Lê e APAGA o rascunho daquele paciente (consumo único); null se não há. */
export function consumirRascunhoRetorno(chavePaciente: string): string | null {
  const texto = pendentes.get(chavePaciente);
  if (texto === undefined) return null;
  pendentes.delete(chavePaciente);
  return texto;
}
