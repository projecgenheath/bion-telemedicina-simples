/** Subtítulo da tela Mensagens no caminho do médico.
 *
 *  O #161 (Admin) define `subtituloMensagens` em Mensagens.tsx com o ramo
 *  do admin. Este módulo só cobre o médico, para não encostar nesse ramo.
 *
 *  Se o merge com o #161 (ea4b313) conflitar em `subtituloMensagens`, a
 *  resolução é manter os dois ramos:
 *
 *    function subtituloMensagens(role: string): string {
 *      if (role === "admin") return "Fale com médicos e pacientes pelo suporte BION.";
 *      return subtituloMensagensMedico(role) ?? "Fale diretamente com seu médico especialista entre as consultas.";
 *    }
 */
export const SUBTITULO_MENSAGENS_MEDICO =
  "Fale com seus pacientes entre as consultas.";

export const SUBTITULO_MENSAGENS_PADRAO =
  "Fale diretamente com seu médico especialista entre as consultas.";

/** Devolve o subtítulo do médico, ou undefined para os demais papéis. */
export function subtituloMensagensMedico(role: string): string | undefined {
  if (role === "medico") return SUBTITULO_MENSAGENS_MEDICO;
  return undefined;
}
