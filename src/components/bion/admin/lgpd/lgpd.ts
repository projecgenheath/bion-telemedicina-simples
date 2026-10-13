/**
 * Regras puras de Privacidade & LGPD do admin (Torre BION). Nada de React.
 * Mesmas regras do PrivacidadeAdmin (que fica sem uso, não apagado):
 * lista SEMPRE por id do paciente, confirmação pelos 6 últimos caracteres
 * do id, cofre só com motivo (5–300) — e datas sempre no fuso da clínica.
 * Testes: lgpd.teste.ts (também com TZ=UTC e TZ=Asia/Tokyo).
 */
import { FUSO_CLINICA, type AuditLog, type Consentimento } from "@/lib/bion-tipos";
import { formatarDataNascimento } from "@/lib/idade";

/** Linha da lista LGPD vinda do servidor — uma por PACIENTE (id), nunca por nome. */
export type PacienteLgpd = {
  id: string;
  nome: string;
  emailMascarado: string;
  cpfMascarado: string;
  cadastradoEm: string;
  status: string;
  anonimizado: boolean;
  consultas: number;
  documentos: number;
  avaliacoes: number;
  arquivos: number;
};
export type RespostaLgpd = { pacientes?: PacienteLgpd[]; total?: number; limite?: number };

/** Resultado da busca no cofre de identificação (somente admin, auditado). */
export type ResultadoCofre = {
  pacienteId: string;
  pseudonimo: string | null;
  status: string | null;
  cadastradoEm: string | null;
  guardadoNoCofreEm: string;
  identificacao: { nome: string; cpf: string; dataNascimento: string | null } | null;
  erroDecifrar: boolean;
  historico: {
    contagem: Record<"consultas" | "documentos" | "exames" | "anamneses" | "medicoes" | "arquivos", number>;
    consultas: { id: string; data: string; especialidade: string; medico: string; status: string }[];
    documentos: { id: string; tipo: string; titulo: string; data: string }[];
    exames: { id: string; titulo: string; data: string }[];
  };
};

export type TipoAcaoLgpd = "anonimizar" | "excluir";

/** Trecho do id que o admin precisa digitar para confirmar (evita clicar na pessoa errada). */
export const codigoConfirmacao = (id: string) => id.slice(-6);
export const codigoConfere = (digitado: string, id: string) => digitado.trim() !== "" && digitado.trim() === codigoConfirmacao(id);

const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_CLINICA, day: "2-digit", month: "2-digit", year: "numeric" });
/** "DD/MM/AAAA" no fuso da clínica (a tela antiga usava o fuso do navegador). */
export function dataLgpd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fmtDia.format(d);
}

/** Nascimento do cofre ("YYYY-MM-DD", dia de calendário, sem fuso). Texto livre antigo sai como veio. */
export function nascimentoCofre(v: string | null): string {
  if (!v) return "—";
  return formatarDataNascimento(v) || v;
}

/** Situação da conta na lista LGPD (texto + tom; nunca só cor). */
export function estadoContaLgpd(p: Pick<PacienteLgpd, "anonimizado" | "status">): { rotulo: string; tom: "ok" | "neutro" | "critico" | "atencao" } {
  if (p.anonimizado) return { rotulo: "Anonimizado", tom: "neutro" };
  if (p.status === "ativo") return { rotulo: "Ativo", tom: "ok" };
  if (p.status === "inativo" || p.status === "arquivado") return { rotulo: "Inativo", tom: "atencao" };
  return { rotulo: p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : "—", tom: "neutro" };
}

export const TITULO_ACAO: Record<TipoAcaoLgpd, string> = { anonimizar: "Anonimizar dados", excluir: "Anonimizar e arquivar" };

/** Mesmo texto de explicação da tela antiga (o que acontece e o que fica preservado). */
export function explicacaoAcao(tipo: TipoAcaoLgpd): string {
  return (
    "Nome, e-mail, CPF, data de nascimento, telefone e demais dados cadastrais serão substituídos por um pseudônimo ou apagados " +
    "(nome, CPF e data de nascimento ficam guardados cifrados no cofre de identificação; a idade permanece no prontuário); o login é " +
    "removido (inclusive no Supabase Auth), os arquivos pessoais são apagados do Storage e o nome sai dos consentimentos e da auditoria. " +
    "O prontuário (consultas, anamnese, exames, documentos clínicos e receitas) é preservado por 20 anos (Lei 13.787/2018), apenas pseudonimizado." +
    (tipo === "excluir" ? " A conta é arquivada sem acesso." : "") +
    " Esta ação não pode ser desfeita e a conta não poderá ser reativada. O registro ficará salvo na auditoria."
  );
}

/** Mesmo toast de sucesso da tela antiga. */
export function sucessoAcao(tipo: TipoAcaoLgpd): string {
  return tipo === "anonimizar"
    ? "Cadastro e login anonimizados; prontuário preservado. Auditoria registrada."
    : "Dados anonimizados e conta arquivada; prontuário preservado. Auditoria registrada.";
}

/* ------------------------------------------------------------------ */
/* Cofre                                                               */
/* ------------------------------------------------------------------ */

export type CriterioCofre = "cpf" | "nome";
export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 300;
const soDigitos = (s: string) => s.replace(/\D/g, "");
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Valida a busca antes de chamar o servidor (as mesmas regras dele, para
 * não gastar uma consulta): CPF com 11 dígitos ou nome com 3+ letras e
 * motivo entre 5 e 300 caracteres.
 */
export function validarBuscaCofre(criterio: CriterioCofre, termo: string, motivo: string): { ok: boolean; erros: { termo?: string; motivo?: string } } {
  const erros: { termo?: string; motivo?: string } = {};
  const t = termo.trim();
  if (criterio === "cpf") {
    if (soDigitos(t).length !== 11) erros.termo = "O CPF precisa ter 11 dígitos.";
  } else if (t.length < 3) erros.termo = "Digite o nome completo, exatamente como no cadastro.";
  const m = motivo.trim().length;
  if (m < MOTIVO_MIN) erros.motivo = "Informe o motivo (ex.: nº do processo ou do ofício).";
  else if (m > MOTIVO_MAX) erros.motivo = `Use no máximo ${MOTIVO_MAX} caracteres.`;
  return { ok: !erros.termo && !erros.motivo, erros };
}

/** Aviso: o motivo vai para a auditoria — não deve repetir o CPF ou o nome pesquisado. */
export function motivoRepeteTermo(criterio: CriterioCofre, termo: string, motivo: string): boolean {
  if (criterio === "cpf") {
    const cpf = soDigitos(termo);
    return cpf.length >= 6 && soDigitos(motivo).includes(cpf);
  }
  const nome = semAcento(termo);
  return nome.length >= 3 && semAcento(motivo).includes(nome);
}

export const corpoBuscaCofre = (criterio: CriterioCofre, termo: string, motivo: string) => ({ [criterio]: termo.trim(), motivo: motivo.trim() });

/* ------------------------------------------------------------------ */
/* Registro LGPD (auditoria)                                           */
/* ------------------------------------------------------------------ */

const ACAO_LGPD = /LGPD|ANONIMIZ|COFRE|CONSENTIMENTO/;
/** Eventos de LGPD já carregados na auditoria (anonimizações, cofre, consentimentos), mais recentes primeiro. */
export function eventosLgpd(logs: AuditLog[], limite = 8): AuditLog[] {
  return logs
    .filter((l) => ACAO_LGPD.test(l.acao) || l.categoria === "consentimento")
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limite);
}

/* ------------------------------------------------------------------ */
/* Consentimentos (bootstrap do admin)                                 */
/* ------------------------------------------------------------------ */

/** Filtra por paciente, quem recebeu o acesso ou finalidade (sem acento); mantém a ordem do servidor. */
export function filtrarConsentimentos(lista: Consentimento[], termo: string, situacao: "todos" | "aceitos" | "revogados" = "todos"): Consentimento[] {
  const t = semAcento(termo);
  return lista.filter(
    (c) =>
      (situacao === "todos" || (situacao === "aceitos" ? c.aceito : !c.aceito)) &&
      (!t || semAcento(`${c.paciente} ${c.quem} ${c.finalidade}`).includes(t)),
  );
}
