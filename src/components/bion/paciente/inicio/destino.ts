/**
 * Navegação do paciente (redesign, etapa 1): qual item do menu lateral
 * (computador) e da barra de baixo (celular) fica ativo em cada tela.
 * Módulo puro — testado em destino.teste.ts.
 */

/** Destinos do menu lateral (computador). */
export type DestinoPaciente =
  | "inicio"
  | "mensagens"
  | "saude"
  | "exames"
  | "documentos"
  | "agendar"
  | "perfil"
  | "ajuda";

/** Itens da barra de baixo (celular): Início, Saúde, "+" Agendar, Exames, Documentos. */
export type DestinoBarra = "inicio" | "saude" | "agendar" | "exames" | "documentos";

export type EstadoTela = {
  /** 0 = Perfil, 1 = Início/Saúde/Exames, 2 = Documentos e mensagens. */
  painel: number;
  /** Seção da coluna central: 0 = Início, 1 = Saúde, 2 = Exames. */
  secao: number;
  /** Conversa com a BION IA (agendar/perguntar) aberta. */
  chatAberto?: boolean;
  /** Agenda própria do paciente aberta (etapa 2, rodada 2). */
  agendaAberta?: boolean;
  /** Na tela de Documentos, o paciente está em Mensagens (veio pelo menu ou abriu uma conversa). */
  emMensagens?: boolean;
  /** Página fora do app (Suporte, Termos e privacidade, Ajuda). */
  pagina?: "ajuda" | null;
};

/** Item ativo do menu lateral: a camada de cima manda (chat > página > painel > seção). */
export function destinoAtivoPaciente(e: EstadoTela): DestinoPaciente {
  if (e.chatAberto || e.agendaAberta) return "agendar";
  if (e.pagina === "ajuda") return "ajuda";
  if (e.painel === 0) return "perfil";
  if (e.painel === 2) return e.emMensagens ? "mensagens" : "documentos";
  if (e.secao === 1) return "saude";
  if (e.secao === 2) return "exames";
  return "inicio";
}

/**
 * Item ativo da barra de baixo. Mensagens moram dentro de Documentos no
 * celular (mesma tela), então ficam com Documentos aceso. Perfil e Ajuda
 * não têm item na barra (o perfil abre pelo avatar do topo): nada aceso.
 * Com a BION IA aberta a barra some (como as outras janelas). Com a agenda
 * própria aberta a barra fica, com o "+" aceso (etapa 2, rodada 2).
 */
export function destinoBarraPaciente(d: DestinoPaciente): DestinoBarra | null {
  if (d === "inicio" || d === "saude" || d === "agendar" || d === "exames" || d === "documentos") return d;
  if (d === "mensagens") return "documentos";
  return null;
}
