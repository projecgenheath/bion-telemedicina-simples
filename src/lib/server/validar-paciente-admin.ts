/**
 * Validação do cadastro/edição de paciente PELA ADMINISTRAÇÃO
 * (POST /api/pacientes e PATCH /api/pacientes/[id]).
 *
 * Reaproveita os MESMOS validadores do perfil do próprio paciente
 * (src/lib/server/validar-perfil.ts — PR #8): CPF com dígitos verificadores,
 * telefone brasileiro com DDD e data de nascimento "YYYY-MM-DD" (dia de
 * calendário, não futura, idade ≤ IDADE_MAXIMA em America/Sao_Paulo).
 *
 * Regras:
 * - Só campos da whitelist; chaves desconhecidas (id, desde, email no PATCH…)
 *   são IGNORADAS e não aparecem na auditoria.
 * - Com data de nascimento, a idade gravada é a CALCULADA (vence um `idade`
 *   enviado junto) — mesmo comportamento do PATCH /api/perfil.
 * - Edição (PATCH): CPF/telefone enviados IGUAIS ao valor já gravado não são
 *   revalidados nem regravados. Assim um cadastro legado com CPF/telefone fora
 *   do padrão continua editável (ex.: só trocar o status); qualquer valor
 *   NOVO passa pela validação completa.
 * - O admin pode corrigir o CPF (a trava "CPF não pode ser alterado" do #8
 *   vale só para o próprio paciente); a unicidade é checada na rota.
 *
 * Arquivo puro (sem "server-only") para poder ser testado com
 * `bun scripts/teste_validar_paciente_admin.ts`.
 */

import {
  validarCpf,
  validarDataNascimento,
  validarTelefone,
  type ResultadoValidacao,
} from "@/lib/server/validar-perfil";

export const STATUS_PACIENTE = ["ativo", "inativo"] as const;

const LIMITES = {
  nomeMin: 3,
  nomeMax: 120,
  generoMax: 40,
  convenioMax: 80,
  idadeMax: 130,
} as const;

/** Dados aceitos, já normalizados, prontos para o Prisma. */
export type DadosPacienteAdmin = {
  nome?: string;
  status?: (typeof STATUS_PACIENTE)[number];
  cpf?: string;
  telefone?: string;
  idade?: number;
  /** Dia de calendário (Date à meia-noite UTC → coluna DATE); null limpa. */
  dataNascimento?: Date | null;
  genero?: string;
  convenio?: string;
};

export type PacienteAdminValidado = {
  dados: DadosPacienteAdmin;
  /** Nomes dos campos aceitos (para o log de auditoria). */
  campos: string[];
};

/** Valores já gravados (só na edição). */
export type PacienteAdminAtual = { cpf: string; telefone: string };

const RE_CONTROLE = /[\u0000-\u001F\u007F]/g;

function falhaCampo(campo: string, erro: string): { ok: false; erro: string; campo: string } {
  return { ok: false, erro, campo };
}

function texto(v: unknown, campo: string, rotulo: string, max: number): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo(campo, `${rotulo} deve ser um texto.`);
  const s = v.replace(RE_CONTROLE, "").replace(/\s+/g, " ").trim();
  if (s.length > max) return falhaCampo(campo, `${rotulo} deve ter no máximo ${max} caracteres.`);
  return { ok: true, valor: s };
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valida o corpo do POST (cadastro: `atual` ausente) ou do PATCH (edição:
 * `atual` = CPF/telefone gravados). Nome e e-mail obrigatórios do cadastro
 * continuam checados na rota (mensagens e e-mail já existentes do #1).
 */
export function validarPacienteAdmin(
  corpo: unknown,
  opts: { atual?: PacienteAdminAtual; agora?: Date } = {},
): ResultadoValidacao<PacienteAdminValidado> {
  if (!ehObjetoSimples(corpo)) return { ok: false, erro: "Corpo da requisição inválido." };
  const { atual, agora = new Date() } = opts;
  const dados: DadosPacienteAdmin = {};
  const campos: string[] = [];

  if (corpo.nome !== undefined) {
    const t = texto(corpo.nome, "nome", "Nome", LIMITES.nomeMax);
    if (!t.ok) return t;
    if (t.valor.length < LIMITES.nomeMin) return falhaCampo("nome", "Informe o nome completo do paciente.");
    dados.nome = t.valor;
    campos.push("nome");
  }

  if (corpo.status !== undefined) {
    if (typeof corpo.status !== "string" || !(STATUS_PACIENTE as readonly string[]).includes(corpo.status)) {
      return falhaCampo("status", `Status inválido. Use: ${STATUS_PACIENTE.join(" ou ")}.`);
    }
    dados.status = corpo.status as DadosPacienteAdmin["status"];
    campos.push("status");
  }

  // CPF: igual ao gravado (edição) => sem alteração; senão validação completa.
  if (corpo.cpf !== undefined && !(atual && corpo.cpf === atual.cpf)) {
    const r = validarCpf(corpo.cpf);
    if (!r.ok) return r;
    if (!(atual && r.valor === atual.cpf)) {
      dados.cpf = r.valor;
      campos.push("cpf");
    }
  }

  if (corpo.telefone !== undefined && !(atual && corpo.telefone === atual.telefone)) {
    const r = validarTelefone(corpo.telefone);
    if (!r.ok) return r;
    if (!(atual && r.valor === atual.telefone)) {
      dados.telefone = r.valor;
      campos.push("telefone");
    }
  }

  if (corpo.idade !== undefined) {
    const v = corpo.idade;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > LIMITES.idadeMax) {
      return falhaCampo("idade", `Idade deve ser um número inteiro entre 0 e ${LIMITES.idadeMax}.`);
    }
    dados.idade = v;
    campos.push("idade");
  }

  // Data de nascimento "YYYY-MM-DD" (null/"" limpa). Informada => idade calculada.
  if (corpo.dataNascimento !== undefined) {
    const r = validarDataNascimento(corpo.dataNascimento, agora);
    if (!r.ok) return r;
    dados.dataNascimento = r.valor ? r.valor.data : null;
    if (r.valor) {
      dados.idade = r.valor.idade;
      if (!campos.includes("idade")) campos.push("idade");
    }
    campos.push("dataNascimento");
  }

  if (corpo.genero !== undefined) {
    const t = texto(corpo.genero, "genero", "Gênero", LIMITES.generoMax);
    if (!t.ok) return t;
    dados.genero = t.valor;
    campos.push("genero");
  }

  if (corpo.convenio !== undefined) {
    const t = texto(corpo.convenio, "convenio", "Convênio", LIMITES.convenioMax);
    if (!t.ok) return t;
    dados.convenio = t.valor || "Particular";
    campos.push("convenio");
  }

  return { ok: true, valor: { dados, campos } };
}

/**
 * Erro de unicidade do Prisma (P2002) → qual campo colidiu. O índice único
 * parcial de CPF (migração 20260930_perfil_paciente_cpf_unico.sql, #8) chega
 * como `PerfilPaciente_cpf_digitos_key`; o e-mail como `User_email_key` ou
 * `["email"]`. null = não é P2002.
 */
export function campoDuplicadoPrisma(erro: unknown): "cpf" | "email" | "outro" | null {
  if (!ehObjetoSimples(erro) || erro.code !== "P2002") return null;
  const meta = ehObjetoSimples(erro.meta) ? erro.meta : {};
  const alvo = [JSON.stringify(meta.target ?? ""), String(erro.message ?? "")].join(" ").toLowerCase();
  if (alvo.includes("cpf")) return "cpf";
  if (alvo.includes("email")) return "email";
  return "outro";
}

/** Mensagens de conflito para o admin (o texto do #8 é voltado ao paciente). */
export const ERRO_CPF_DUPLICADO_ADMIN = "Este CPF já está cadastrado para outro paciente.";
export const ERRO_EMAIL_DUPLICADO_ADMIN = "Já existe uma conta com este e-mail.";
