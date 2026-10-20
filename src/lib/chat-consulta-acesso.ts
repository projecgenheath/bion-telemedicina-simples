/**
 * Quem lê o chat guardado da teleconsulta (ChatConsulta). Decisão do
 * Alisson (20/10/2026): a conversa é só do médico e do paciente da consulta.
 * O admin nunca recebe o conteúdo (mesma regra de privacidade da consulta:
 * vê agenda, status, pagamento e contagens, nunca o conteúdo clínico).
 *
 * Função pura; toda rota que um dia ler ChatConsulta deve passar por aqui.
 */
export function podeLerChatConsulta(
  usuario: { id: string; role: string },
  consulta: { pacienteId: string; medicoId: string },
): boolean {
  if (usuario.role === "ADMIN") return false;
  if (usuario.role === "PACIENTE") return usuario.id === consulta.pacienteId;
  if (usuario.role === "MEDICO") return usuario.id === consulta.medicoId;
  return false;
}
