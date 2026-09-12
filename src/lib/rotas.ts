// Fonte única de verdade das rotas do BION (Fase 3).
// Cada "view" legada virou uma URL real do App Router.

export type Role = "paciente" | "medico" | "admin";

export type View =
  | "landing"
  | "login"
  | "dashboard"
  | "agendar"
  | "sala-espera"
  | "consulta"
  | "medico-perfil"
  | "paciente-perfil"
  | "historico"
  | "mensagens"
  | "lembretes"
  | "notificacoes"
  | "consultas"
  | "usuarios"
  | "receitas"
  | "prontuario"
  | "relatorios"
  | "suporte"
  | "bion-ia"
  | "avaliacoes"
  | "auditoria"
  | "ajuda"
  | "privacidade"
  | "admin-pacientes"
  | "admin-medicos"
  | "admin-agendamentos"
  | "medico-pacientes";

export const VIEW_TO_PATH: Record<View, string> = {
  landing: "/",
  login: "/entrar",
  dashboard: "/painel",
  agendar: "/agendar",
  "sala-espera": "/sala-espera",
  consulta: "/consulta",
  "medico-perfil": "/medico-perfil",
  "paciente-perfil": "/perfil",
  historico: "/historico",
  mensagens: "/mensagens",
  lembretes: "/lembretes",
  notificacoes: "/notificacoes",
  consultas: "/consultas",
  usuarios: "/usuarios",
  receitas: "/receitas",
  prontuario: "/prontuario",
  relatorios: "/relatorios",
  suporte: "/suporte",
  "bion-ia": "/bion-ia",
  avaliacoes: "/avaliacoes",
  auditoria: "/auditoria",
  ajuda: "/ajuda",
  privacidade: "/privacidade",
  "admin-pacientes": "/admin-pacientes",
  "admin-medicos": "/admin-medicos",
  "admin-agendamentos": "/admin-agendamentos",
  "medico-pacientes": "/medico-pacientes",
};

export const PATH_TO_VIEW: Record<string, View> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([v, p]) => [p, v as View]),
) as Record<string, View>;

export function urlDa(v: View): string {
  return VIEW_TO_PATH[v];
}

export function viewDoPath(p: string): View {
  return PATH_TO_VIEW[p] ?? "dashboard";
}

// Views restritas por papel (usadas na guarda do layout autenticado)
export const SO_ADMIN: View[] = [
  "usuarios",
  "admin-pacientes",
  "admin-medicos",
  "admin-agendamentos",
  "auditoria",
];
export const SO_MEDICO: View[] = ["medico-pacientes"];
