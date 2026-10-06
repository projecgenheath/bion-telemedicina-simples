/**
 * Regras PURAS da tela de Médicos do admin (testadas em medicos.teste.ts).
 * Datas no fuso da clínica (America/Sao_Paulo); o "agora" entra como parâmetro.
 * Validações espelham src/app/api/medicos/route.ts e src/app/api/medicos/[id]/route.ts
 * (o servidor continua sendo a regra final).
 */
import type { Avaliacao, AuditLog, Consulta, Medico } from "@/lib/bion-tipos";
import type { Estado } from "../rotulos";
import { normalizar } from "../agendamentos/agenda";

/** O wire manda o status cru do perfil; "arquivado" vem do DELETE (arquivar). */
export type StatusMedico = Medico["status"] | "arquivado";
export type AbaMedicos = "ativos" | "validacao" | "suspensos" | "arquivados";
export const ABAS_MEDICOS: { id: AbaMedicos; rotulo: string }[] = [
  { id: "ativos", rotulo: "Ativos" },
  { id: "validacao", rotulo: "Em validação" },
  { id: "suspensos", rotulo: "Suspensos" },
  { id: "arquivados", rotulo: "Arquivados" },
];

export const VALOR_MIN = 1;
export const VALOR_MAX = 5000;
export const TAM_MAX_TEXTO = 2000;
/** Sem teleconsulta entre 23:00 e 00:00 (São Paulo); a consulta dura 30 min, então 22:31+ também encosta. */
export const HORA_VEDADA = 23;
export const DURACAO_CONSULTA_MIN = 30;

const D30 = 30 * 86_400_000;

export function statusDe(m: { status: string }): StatusMedico {
  const s = m.status;
  return s === "ativo" || s === "pendente" || s === "suspenso" || s === "arquivado" ? s : "pendente";
}

export function abaDoStatus(s: StatusMedico): AbaMedicos {
  if (s === "ativo") return "ativos";
  if (s === "suspenso") return "suspensos";
  if (s === "arquivado") return "arquivados";
  return "validacao";
}

export function lerAba(v: string | null | undefined): AbaMedicos | null {
  return ABAS_MEDICOS.some((a) => a.id === v) ? (v as AbaMedicos) : null;
}

export function estadoMedicoAdmin(s: StatusMedico): Estado {
  if (s === "ativo") return { rotulo: "Ativo", tom: "ok" };
  if (s === "suspenso") return { rotulo: "Suspenso", tom: "critico" };
  if (s === "arquivado") return { rotulo: "Arquivado", tom: "neutro" };
  return { rotulo: "Em validação", tom: "atencao" };
}

export function contarPorAba(medicos: Medico[]): Record<AbaMedicos, number> {
  const out: Record<AbaMedicos, number> = { ativos: 0, validacao: 0, suspensos: 0, arquivados: 0 };
  for (const m of medicos) out[abaDoStatus(statusDe(m))]++;
  return out;
}

export type FiltrosMedicos = { aba: AbaMedicos; busca: string; especialidade: string };

/** Filtra pela aba, busca (nome, CRM, especialidade, sem acento) e especialidade; ordena por nome. */
export function filtrarMedicos(medicos: Medico[], f: FiltrosMedicos): Medico[] {
  const termo = normalizar(f.busca);
  return medicos
    .filter((m) => abaDoStatus(statusDe(m)) === f.aba)
    .filter((m) => !f.especialidade || m.especialidade === f.especialidade)
    .filter((m) => !termo || normalizar(`${m.nome} ${m.crm} ${m.especialidade} ${m.subespecialidades.join(" ")}`).includes(termo))
    .sort((a, b) => semTitulo(a.nome).localeCompare(semTitulo(b.nome), "pt-BR") || a.id.localeCompare(b.id));
}

/** "Dra. Ana Lima" → "Ana Lima" (para ordenar pelo nome, não pelo título). */
export function semTitulo(nome: string): string {
  return nome.replace(/^(dr|dra|prof|profa)\.?\s+/i, "").trim();
}

export function especialidadesDe(medicos: Medico[]): string[] {
  return [...new Set(medicos.map((m) => m.especialidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Iniciais para o crachá sem foto: "Dra. Ana Lima" → "AL". */
export function iniciais(nome: string): string {
  const partes = semTitulo(nome)
    .split(/\s+/)
    .filter((p) => p.length > 1 || /[A-ZÀ-Ú]/.test(p));
  if (!partes.length) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/** Consultas do médico (por id) nos últimos 30 dias que não foram canceladas. */
export function consultas30d(consultas: Consulta[], medicoId: string, agora: number): number {
  return consultas.filter((c) => c.medicoId === medicoId && c.status !== "cancelada" && c.ts <= agora && c.ts > agora - D30).length;
}

/** Próximas consultas do médico (por id), da mais cedo para a mais tarde; canceladas fora. */
export function proximasDoMedico(consultas: Consulta[], medicoId: string, agora: number, limite = 20): Consulta[] {
  return consultas
    .filter((c) => c.medicoId === medicoId && c.ts >= agora && c.status !== "cancelada" && c.status !== "concluida")
    .sort((a, b) => a.ts - b.ts)
    .slice(0, limite);
}

/** Atendimentos já realizados (concluídos) do médico, do mais recente ao mais antigo. */
export function realizadasDoMedico(consultas: Consulta[], medicoId: string): Consulta[] {
  return consultas.filter((c) => c.medicoId === medicoId && c.status === "concluida").sort((a, b) => b.ts - a.ts);
}

/**
 * Avaliações: o wire só traz o NOME do médico. Casamos por nome e avisamos
 * quando há homônimo no diretório (as avaliações podem ser de outra pessoa).
 * A nota média e o total do crachá vêm do perfil (calculados pelo servidor, por id).
 */
export function avaliacoesDoMedico(avaliacoes: Avaliacao[], medico: Medico, todos: Medico[]): { lista: Avaliacao[]; homonimo: boolean } {
  const nome = normalizar(medico.nome);
  const homonimo = todos.filter((m) => normalizar(m.nome) === nome).length > 1;
  return { lista: avaliacoes.filter((a) => normalizar(a.medico) === nome).sort((a, b) => b.ts - a.ts), homonimo };
}

/** Eventos da auditoria desta entidade (por id), do mais recente ao mais antigo. */
export function eventosDaEntidade(logs: AuditLog[], entidade: string, id: string, limite = 50): AuditLog[] {
  return logs
    .filter((l) => l.entidadeId === id && (!l.entidade || l.entidade.toLowerCase() === entidade))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limite);
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */

export type FormMedico = {
  nome: string;
  email: string;
  crm: string;
  especialidade: string;
  subespecialidades: string;
  valor: string;
  formacao: string;
  experiencia: string;
  idiomas: string;
  bio: string;
  horarios: string[];
  /** Só no cadastro: o servidor aceita "pendente" ou "ativo" ao criar. */
  status: "pendente" | "ativo";
};

export const FORM_VAZIO: FormMedico = {
  nome: "",
  email: "",
  crm: "",
  especialidade: "",
  subespecialidades: "",
  valor: "150",
  formacao: "",
  experiencia: "",
  idiomas: "Português",
  bio: "",
  horarios: ["09:00", "10:00", "14:00", "15:00"],
  status: "pendente",
};

export function formDoMedico(m: Medico): FormMedico {
  return {
    nome: m.nome,
    email: "",
    crm: m.crm,
    especialidade: m.especialidade,
    subespecialidades: m.subespecialidades.join(", "),
    valor: String(m.valor),
    formacao: m.formacao,
    experiencia: m.experiencia,
    idiomas: m.idiomas.join(", "),
    bio: m.bio,
    horarios: [...m.horariosDisponiveis],
    status: statusDe(m) === "ativo" ? "ativo" : "pendente",
  };
}

export function listaDeTexto(t: string): string[] {
  return [...new Set(t.split(",").map((s) => s.trim()).filter(Boolean))];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ordena, tira repetidos e descarta o que não é HH:MM. */
export function normalizarHorarios(h: string[]): string[] {
  return [...new Set(h.map((x) => x.trim()).filter((x) => HHMM.test(x)))].sort();
}

/** Horário da grade que encosta na janela vedada (23:00–00:00) considerando a duração da consulta. */
export function horarioVedado(h: string): boolean {
  if (!HHMM.test(h)) return false;
  const [hh, mm] = h.split(":").map(Number);
  const inicio = hh * 60 + mm;
  return inicio + DURACAO_CONSULTA_MIN > HORA_VEDADA * 60;
}

export type ErrosForm = Partial<Record<keyof FormMedico, string>>;

/** Validação do formulário (cadastro ou edição). Devolve só os campos com erro. */
export function validarFormMedico(f: FormMedico, cadastro: boolean): ErrosForm {
  const e: ErrosForm = {};
  if (!f.nome.trim()) e.nome = "Informe o nome.";
  if (!f.crm.trim()) e.crm = "Informe o CRM.";
  if (!f.especialidade.trim()) e.especialidade = "Informe a especialidade.";
  if (cadastro && f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "E-mail inválido.";
  const v = Number(f.valor.replace(",", "."));
  if (!Number.isFinite(v) || v < VALOR_MIN || v > VALOR_MAX) e.valor = `O valor deve ficar entre R$ ${VALOR_MIN} e R$ ${VALOR_MAX}.`;
  for (const k of ["bio", "formacao", "experiencia"] as const) {
    if (f[k].length > TAM_MAX_TEXTO) e[k] = `No máximo ${TAM_MAX_TEXTO} caracteres.`;
  }
  const vedados = f.horarios.filter(horarioVedado);
  if (vedados.length) e.horarios = `Sem consultas entre 23:00 e 00:00: tire ${vedados.join(", ")}.`;
  else if (!f.horarios.length) e.horarios = "Deixe pelo menos um horário na grade.";
  return e;
}

/** Corpo do POST /api/medicos (cadastro). E-mail é opcional: sem ele, o servidor gera um login. */
export function corpoCadastro(f: FormMedico): Record<string, unknown> {
  return {
    nome: f.nome.trim(),
    ...(f.email.trim() ? { email: f.email.trim() } : {}),
    crm: f.crm.trim(),
    especialidade: f.especialidade.trim(),
    subespecialidades: listaDeTexto(f.subespecialidades),
    valor: Number(f.valor.replace(",", ".")),
    formacao: f.formacao.trim(),
    experiencia: f.experiencia.trim(),
    idiomas: listaDeTexto(f.idiomas),
    bio: f.bio.trim(),
    horariosDisponiveis: normalizarHorarios(f.horarios),
    status: f.status,
  };
}

const iguais = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * PATCH { acao: "atualizar", ...só o que mudou }. Status NÃO vai aqui (o
 * servidor ignora): aprovar/suspender/arquivar são ações próprias.
 * Devolve null quando nada mudou.
 */
export function corpoEdicaoMedico(antes: Medico, f: FormMedico): Record<string, unknown> | null {
  const novo: Record<string, unknown> = {
    nome: f.nome.trim(),
    crm: f.crm.trim(),
    especialidade: f.especialidade.trim(),
    subespecialidades: listaDeTexto(f.subespecialidades),
    valor: Number(f.valor.replace(",", ".")),
    formacao: f.formacao.trim(),
    experiencia: f.experiencia.trim(),
    idiomas: listaDeTexto(f.idiomas),
    bio: f.bio.trim(),
    horariosDisponiveis: normalizarHorarios(f.horarios),
  };
  const velho: Record<string, unknown> = {
    nome: antes.nome,
    crm: antes.crm,
    especialidade: antes.especialidade,
    subespecialidades: antes.subespecialidades,
    valor: antes.valor,
    formacao: antes.formacao,
    experiencia: antes.experiencia,
    idiomas: antes.idiomas,
    bio: antes.bio,
    horariosDisponiveis: antes.horariosDisponiveis,
  };
  const corpo: Record<string, unknown> = {};
  for (const k of Object.keys(novo)) if (!iguais(novo[k], velho[k])) corpo[k] = novo[k];
  return Object.keys(corpo).length ? { acao: "atualizar", ...corpo } : null;
}

/** "Desfazer" da edição: os valores de antes, só nos campos que o corpo mudou. */
export function corpoDesfazerMedico(antes: Medico, corpo: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { acao: "atualizar" };
  for (const k of Object.keys(corpo)) {
    if (k === "acao") continue;
    out[k] = (antes as unknown as Record<string, unknown>)[k];
  }
  return out;
}

const ROTULO_CAMPO: Record<string, string> = {
  nome: "nome",
  crm: "CRM",
  especialidade: "especialidade",
  subespecialidades: "subespecialidades",
  valor: "valor",
  formacao: "formação",
  experiencia: "experiência",
  idiomas: "idiomas",
  bio: "bio",
  horariosDisponiveis: "horários",
};

/** "valor e horários" — para o aviso depois de salvar. */
export function camposAlterados(corpo: Record<string, unknown>): string {
  const n = Object.keys(corpo)
    .filter((k) => k !== "acao")
    .map((k) => ROTULO_CAMPO[k] ?? k);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}

/** Ações disponíveis para o estado atual (o servidor aceita aprovar/suspender em qualquer estado). */
export function acoesDoStatus(s: StatusMedico): { aprovar: boolean; reativar: boolean; suspender: boolean; arquivar: boolean } {
  return {
    aprovar: s === "pendente",
    reativar: s === "suspenso",
    suspender: s === "ativo" || s === "pendente",
    arquivar: s !== "arquivado",
  };
}

/** Confirmação digitada: o nome exato (sem diferenciar acento, caixa e espaços extras). */
export function confirmacaoConfere(digitado: string, esperado: string): boolean {
  const a = normalizar(digitado).replace(/\s+/g, " ");
  return a.length > 0 && a === normalizar(esperado).replace(/\s+/g, " ");
}

/** Mensagem de erro em português a partir do status e do texto do servidor. */
export function explicarErroMedico(status: number, erro: string | null | undefined): string {
  const msg = String(erro ?? "").trim();
  if (status === 0) return "Sem conexão com o servidor. Nada foi alterado; tente de novo.";
  if (status === 401 || status === 403) return "Sem permissão. Entre de novo com uma conta de administrador.";
  if (status === 404) return msg || "Médico não encontrado. Atualize a tela.";
  if (msg) return msg;
  return `O servidor respondeu ${status}. Nada foi alterado.`;
}
