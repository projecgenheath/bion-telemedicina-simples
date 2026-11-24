// Fonte única de verdade das rotas do BION (Fase 3).
// Cada "view" legada virou uma URL real do App Router.

export type Role = "paciente" | "medico" | "admin";

export type View =
  | "landing"
  | "login"
  | "dashboard"
  | "agendar"
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
  | "llm-monitor"
  | "ajuda"
  | "privacidade"
  | "admin-pacientes"
  | "admin-medicos"
  | "admin-agendamentos"
  | "admin-repasses"
  | "travas"
  | "medico-pacientes"
  | "paciente-app";

export const VIEW_TO_PATH: Record<View, string> = {
  landing: "/",
  login: "/entrar",
  dashboard: "/painel",
  agendar: "/agendar",
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
  "llm-monitor": "/llm-monitor",
  ajuda: "/ajuda",
  privacidade: "/privacidade",
  "admin-pacientes": "/admin-pacientes",
  "admin-medicos": "/admin-medicos",
  "admin-agendamentos": "/admin-agendamentos",
  "admin-repasses": "/admin-repasses",
  travas: "/travas",
  "medico-pacientes": "/medico-pacientes",
  "paciente-app": "/paciente",
};

export const PATH_TO_VIEW: Record<string, View> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([v, p]) => [p, v as View]),
) as Record<string, View>;

export function urlDa(v: View): string {
  return VIEW_TO_PATH[v];
}

export function viewDoPath(p: string): View {
  const limpo = (p || "/").split("?")[0].replace(/\/+$/, "") || "/";
  return PATH_TO_VIEW[limpo] ?? "dashboard";
}

/* ------------------------------------------------------------------ */
/* Guardas de papel (usadas no layout autenticado)                     */
/* ------------------------------------------------------------------ */

/** Exclusivas do administrador (qualquer outro papel é redirecionado ao painel). */
export const SO_ADMIN: View[] = [
  "usuarios",
  "admin-pacientes",
  "admin-medicos",
  "admin-agendamentos",
  "admin-repasses",
  "auditoria",
  "llm-monitor",
  "relatorios",
  "travas",
];

/** Exclusivas do médico. */
export const SO_MEDICO: View[] = ["medico-pacientes", "medico-perfil", "avaliacoes"];

/** Exclusivas do paciente (histórico clínico é a linha do tempo do PRÓPRIO paciente). */
export const SO_PACIENTE: View[] = [
  "agendar",
  "paciente-perfil",
  "historico",
  "paciente-app",
];

/** Clínicas compartilhadas paciente+médico; o administrador não tem negócio nelas.
 * "bion-ia": o chat geral da IA é só de paciente e médico (LGPD; a API responde 403 ao admin). */
export const SO_CLINICA: View[] = ["consulta", "consultas", "receitas", "prontuario", "bion-ia"];

/* ------------------------------------------------------------------ */
/* Guarda de papel do layout autenticado (path + redirecionamento)     */
/* ------------------------------------------------------------------ */

/** Pathname sem query string e sem barra no final. */
export function pathLimpo(p: string): string {
  return (p || "/").split("?")[0].replace(/\/+$/, "") || "/";
}

/**
 * Rotas em tela cheia que o paciente pode manter (e que dispensam o
 * AppShell para qualquer papel). O retorno do pagamento NÃO entra
 * aqui: se o médico abrir essas URLs, ele continua com a mesma casca
 * de antes.
 */
export function ehRotaTelaCheia(path: string): boolean {
  const p = pathLimpo(path);
  return (
    p === "/paciente" ||
    p === "/consulta" ||
    p === "/suporte" ||
    p === "/privacidade" ||
    p === "/ajuda" ||
    p.startsWith("/consulta/")
  );
}

/** Telas de volta do Stripe Checkout. Só leem o status; não cobram. */
export function ehRotaRetornoPagamento(path: string): boolean {
  const p = pathLimpo(path);
  return p === "/pagamento/sucesso" || p === "/pagamento/cancelado";
}

/** Rotas em que o paciente autenticado pode permanecer. */
export function pacientePodeVer(path: string): boolean {
  return ehRotaTelaCheia(path) || ehRotaRetornoPagamento(path);
}

/**
 * Destino da guarda de papel do layout autenticado compartilhado.
 * `null` = permanece na rota atual.
 *
 * A única mudança em relação à lógica anterior (inline no layout) é
 * que o paciente em `/pagamento/sucesso` ou `/pagamento/cancelado`
 * agora permanece, para a tela de status aparecer. Os destinos do
 * médico e do admin não mudam, inclusive nessas duas URLs.
 */
export function destinoGuardaPapel(role: Role, path: string): string | null {
  const p = pathLimpo(path);
  const view = viewDoPath(p);

  if (role === "paciente" && !pacientePodeVer(p)) return "/paciente";
  if (SO_ADMIN.includes(view) && role !== "admin") return "/painel";
  if (SO_MEDICO.includes(view) && role !== "medico") return "/painel";
  if (SO_PACIENTE.includes(view) && role !== "paciente") return "/painel";
  if (SO_CLINICA.includes(view) && role === "admin") return "/painel";
  return null;
}
