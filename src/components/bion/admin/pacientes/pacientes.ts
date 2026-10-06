/**
 * Regras PURAS da tela de Pacientes do admin (testadas em pacientes.teste.ts).
 * Datas no fuso da clínica (America/Sao_Paulo); o "agora" entra como parâmetro.
 * A edição envia só o que mudou (mesma regra da tela antiga, AdminPacientes).
 */
import type { Consulta, Documento, PacienteRegistro, TicketSuporte } from "@/lib/bion-tipos";
import { idadeDeNascimento } from "@/lib/idade";
import type { Estado } from "../rotulos";
import { normalizar } from "../agendamentos/agenda";

/** Domínio dos e-mails substitutos da anonimização (src/lib/server/lgpd.ts). */
export const DOMINIO_EMAIL_ANON = "anon.bion.app";

export type SituacaoPaciente = "ativo" | "inativo" | "anonimizado";
export type FiltroSituacao = SituacaoPaciente | "todos";
export const FILTROS_SITUACAO: { id: FiltroSituacao; rotulo: string }[] = [
  { id: "ativo", rotulo: "Ativos" },
  { id: "inativo", rotulo: "Inativos" },
  { id: "anonimizado", rotulo: "Anonimizados" },
  { id: "todos", rotulo: "Todos" },
];

export function estaAnonimizado(p: { email: string }): boolean {
  return String(p.email ?? "").toLowerCase().endsWith(`@${DOMINIO_EMAIL_ANON}`);
}

export function situacaoDe(p: PacienteRegistro): SituacaoPaciente {
  if (estaAnonimizado(p)) return "anonimizado";
  return p.status === "ativo" ? "ativo" : "inativo";
}

export function estadoPaciente(s: SituacaoPaciente): Estado {
  if (s === "ativo") return { rotulo: "Conta ativa", tom: "ok" };
  if (s === "anonimizado") return { rotulo: "Anonimizado (LGPD)", tom: "neutro" };
  return { rotulo: "Conta inativa", tom: "atencao" };
}

export function contarSituacoes(pacientes: PacienteRegistro[]): Record<FiltroSituacao, number> {
  const out: Record<FiltroSituacao, number> = { ativo: 0, inativo: 0, anonimizado: 0, todos: pacientes.length };
  for (const p of pacientes) out[situacaoDe(p)]++;
  return out;
}

const soDigitos = (t: string) => t.replace(/\D/g, "");

/** Busca por nome (sem acento), e-mail ou CPF (com ou sem pontuação). */
export function filtrarPacientes(pacientes: PacienteRegistro[], busca: string, situacao: FiltroSituacao): PacienteRegistro[] {
  const termo = normalizar(busca);
  const digitos = soDigitos(busca);
  return pacientes
    .filter((p) => situacao === "todos" || situacaoDe(p) === situacao)
    .filter((p) => {
      if (!termo) return true;
      if (normalizar(`${p.nome} ${p.email}`).includes(termo)) return true;
      return digitos.length >= 3 && soDigitos(p.cpf).includes(digitos);
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
}

/** Idade exibida: pela data de nascimento (hoje em SP); sem data, o campo gravado. */
export function idadeExibida(p: { idade: number; dataNascimento?: string | null }, agora: number = Date.now()): number {
  return (p.dataNascimento ? idadeDeNascimento(p.dataNascimento, new Date(agora)) : null) ?? p.idade;
}

/** CPF com máscara visual "000.000.000-00" (só formatação; o valor gravado não muda). */
export function formatarCpf(cpf: string): string {
  const d = soDigitos(cpf);
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Consultas do paciente (por id), da mais recente para a mais antiga. */
export function consultasDoPaciente(consultas: Consulta[], pacienteId: string): Consulta[] {
  return consultas.filter((c) => c.pacienteId === pacienteId).sort((a, b) => b.ts - a.ts);
}

/** Última consulta realizada (concluída, já passada) e a próxima em aberto (não cancelada). */
export function ultimaEProxima(consultas: Consulta[], pacienteId: string, agora: number): { ultima: Consulta | null; proxima: Consulta | null } {
  let ultima: Consulta | null = null;
  let proxima: Consulta | null = null;
  for (const c of consultas) {
    if (c.pacienteId !== pacienteId) continue;
    if (c.status === "concluida" && c.ts <= agora && (!ultima || c.ts > ultima.ts)) ultima = c;
    if (c.ts >= agora && c.status !== "cancelada" && c.status !== "concluida" && (!proxima || c.ts < proxima.ts)) proxima = c;
  }
  return { ultima, proxima };
}

/**
 * Documentos e chamados chegam só com o NOME do paciente. Casamos por nome
 * e avisamos quando há homônimo no cadastro (podem ser de outra pessoa).
 */
export function porNome<T>(itens: T[], nomeDe: (t: T) => string, paciente: PacienteRegistro, todos: PacienteRegistro[]): { lista: T[]; homonimo: boolean } {
  const nome = normalizar(paciente.nome);
  const homonimo = todos.filter((p) => normalizar(p.nome) === nome).length > 1;
  return { lista: itens.filter((t) => normalizar(nomeDe(t)) === nome), homonimo };
}

export function documentosDoPaciente(documentos: Documento[], p: PacienteRegistro, todos: PacienteRegistro[]) {
  return porNome(documentos, (d) => d.paciente, p, todos);
}

export function chamadosDoPaciente(tickets: TicketSuporte[], p: PacienteRegistro, todos: PacienteRegistro[]) {
  return porNome(
    tickets.filter((t) => t.perfil === "paciente"),
    (t) => t.usuario,
    p,
    todos,
  );
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */

export type FormPaciente = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  idade: number;
  /** "AAAA-MM-DD" ou "" (sem data). */
  dataNascimento: string;
  genero: string;
  convenio: string;
  status: "ativo" | "inativo";
};

export const FORM_PACIENTE_VAZIO: FormPaciente = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  idade: 30,
  dataNascimento: "",
  genero: "Feminino",
  convenio: "Particular",
  status: "ativo",
};

export function formDoPaciente(p: PacienteRegistro): FormPaciente {
  return {
    nome: p.nome,
    email: p.email,
    telefone: p.telefone,
    cpf: p.cpf,
    idade: p.idade,
    dataNascimento: p.dataNascimento ?? "",
    genero: p.genero,
    convenio: p.convenio,
    status: p.status,
  };
}

/** Campos que o admin altera na edição (o e-mail/login não muda por aqui). */
export const CAMPOS_EDITAVEIS = ["nome", "telefone", "cpf", "idade", "dataNascimento", "genero", "convenio", "status"] as const;
type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

/** Validação mínima no cliente (o servidor valida CPF, telefone e data e responde 400/409 com o campo). */
export function validarFormPaciente(f: FormPaciente, cadastro: boolean): Partial<Record<keyof FormPaciente, string>> {
  const e: Partial<Record<keyof FormPaciente, string>> = {};
  if (!f.nome.trim()) e.nome = "Informe o nome.";
  if (cadastro && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Informe um e-mail válido (vira o login).";
  if (!f.dataNascimento && (!Number.isFinite(f.idade) || f.idade < 0 || f.idade > 130)) e.idade = "Idade entre 0 e 130.";
  return e;
}

/** Corpo do POST /api/pacientes. */
export function corpoCadastroPaciente(f: FormPaciente): Record<string, unknown> {
  return {
    nome: f.nome.trim(),
    email: f.email.trim(),
    telefone: f.telefone.trim(),
    cpf: f.cpf.trim(),
    idade: f.idade,
    ...(f.dataNascimento ? { dataNascimento: f.dataNascimento } : {}),
    genero: f.genero,
    convenio: f.convenio,
    status: f.status,
  };
}

function valorDoCampo(campo: CampoEditavel, f: FormPaciente): unknown {
  if (campo === "dataNascimento") return f.dataNascimento || null;
  if (campo === "nome") return f.nome.trim();
  return f[campo];
}
function valorOriginal(campo: CampoEditavel, p: PacienteRegistro): unknown {
  if (campo === "dataNascimento") return p.dataNascimento ?? null;
  return p[campo];
}

/** PATCH só com o que mudou (data vazia => null limpa a data). null = nada mudou. */
export function corpoEdicaoPaciente(antes: PacienteRegistro, f: FormPaciente): Record<string, unknown> | null {
  const corpo: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    const novo = valorDoCampo(campo, f);
    if (novo !== valorOriginal(campo, antes)) corpo[campo] = novo;
  }
  // Com data de nascimento, a idade é derivada no servidor: não reenviar a idade do formulário.
  if (f.dataNascimento && "idade" in corpo && !("dataNascimento" in corpo)) delete corpo.idade;
  return Object.keys(corpo).length ? corpo : null;
}

/** "Desfazer": os valores de antes, só nos campos alterados. */
export function corpoDesfazerPaciente(antes: PacienteRegistro, corpo: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(corpo)) {
    out[k] = valorOriginal(k as CampoEditavel, antes);
  }
  // Mexer na data muda a idade derivada no servidor: devolver também a idade de antes.
  if ("dataNascimento" in corpo && !("idade" in out)) out.idade = antes.idade;
  return out;
}

const ROTULO: Record<string, string> = {
  nome: "nome",
  telefone: "telefone",
  cpf: "CPF",
  idade: "idade",
  dataNascimento: "data de nascimento",
  genero: "gênero",
  convenio: "convênio",
  status: "situação da conta",
};
export function camposAlteradosPaciente(corpo: Record<string, unknown>): string {
  const n = Object.keys(corpo).map((k) => ROTULO[k] ?? k);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}

/** Erro do servidor em português, guardando o campo (400/409 trazem `campo`). */
export function explicarErroPaciente(status: number, erro: string | null | undefined): string {
  const msg = String(erro ?? "").trim();
  if (status === 0) return "Sem conexão com o servidor. Nada foi alterado; tente de novo.";
  if (status === 401 || status === 403) return "Sem permissão. Entre de novo com uma conta de administrador.";
  if (status === 404) return msg || "Paciente não encontrado. Atualize a tela.";
  if (msg) return msg;
  return `O servidor respondeu ${status}. Nada foi alterado.`;
}
