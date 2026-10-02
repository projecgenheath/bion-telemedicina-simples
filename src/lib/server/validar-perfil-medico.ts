/**
 * Validação do PATCH /api/medico/perfil — dados pessoais do PRÓPRIO médico
 * (data de nascimento, sexo, telefone e CNPJ).
 *
 * Regras:
 * - Corpo precisa ser um objeto; chave fora da whitelist → ERRO (400 com
 *   `campo`), diferente do paciente, que ignora chaves desconhecidas.
 * - dataNascimento: "YYYY-MM-DD" válida; idade entre 18 e 100 anos (hoje em
 *   America/Sao_Paulo, helpers de src/lib/idade.ts); null/"" limpa.
 * - genero: uma de GENEROS_MEDICO; null/"" limpa.
 * - telefone: validarTelefone (mesma regra do paciente); null/"" limpa.
 * - cnpj: numérico OU alfanumérico (Receita Federal, a partir de jul/2026);
 *   com ou sem máscara; grava os 14 caracteres normalizados (maiúsculos);
 *   DV oficial (ASCII − 48, módulo 11); 14 caracteres iguais rejeitados;
 *   null/"" limpa.
 *
 * Arquivo puro (sem "server-only") para ser testado com
 * `bun scripts/teste_validar_perfil_medico.ts`.
 */

import { idadeDeNascimento, isoParaDataNascimento } from "@/lib/idade";
import { validarTelefone, type ResultadoValidacao } from "@/lib/server/validar-perfil";
import {
  GENEROS_MEDICO,
  IDADE_MAXIMA_MEDICO,
  IDADE_MINIMA_MEDICO,
  cnpjValido,
  ehGeneroMedico,
  normalizarCnpj,
  type GeneroMedico,
} from "@/components/bion/medico/dados-pessoais";

export const CAMPOS_DADOS_PESSOAIS_MEDICO = ["dataNascimento", "genero", "telefone", "cnpj"] as const;
export type CampoDadosPessoaisMedico = (typeof CAMPOS_DADOS_PESSOAIS_MEDICO)[number];

/** Dados prontos para `db.perfilMedico.update({ data })`. */
export type PerfilMedicoDadosPessoaisUpdate = {
  dataNascimento?: Date | null;
  genero?: GeneroMedico | null;
  telefone?: string;
  cnpj?: string;
};

export type PatchPerfilMedicoValidado = {
  dados: PerfilMedicoDadosPessoaisUpdate;
  /** Nomes dos campos aceitos (auditoria — nunca os valores). */
  campos: CampoDadosPessoaisMedico[];
};

function falhaCampo(campo: string, erro: string): { ok: false; erro: string; campo: string } {
  return { ok: false, erro, campo };
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validarDataNascimentoMedico(v: unknown, agora: Date = new Date()): ResultadoValidacao<Date | null> {
  if (v === null || v === "") return { ok: true, valor: null };
  const invalida = falhaCampo("dataNascimento", "Data de nascimento inválida. Use AAAA-MM-DD.");
  if (typeof v !== "string") return invalida;
  const iso = v.trim();
  const data = isoParaDataNascimento(iso);
  if (!data) return invalida;
  const idade = idadeDeNascimento(iso, agora);
  if (idade === null) return falhaCampo("dataNascimento", "A data de nascimento não pode estar no futuro.");
  if (idade < IDADE_MINIMA_MEDICO || idade > IDADE_MAXIMA_MEDICO) {
    return falhaCampo(
      "dataNascimento",
      `Data de nascimento inválida: a idade deve estar entre ${IDADE_MINIMA_MEDICO} e ${IDADE_MAXIMA_MEDICO} anos.`,
    );
  }
  return { ok: true, valor: data };
}

export function validarGeneroMedico(v: unknown): ResultadoValidacao<GeneroMedico | null> {
  if (v === null || v === "") return { ok: true, valor: null };
  if (typeof v === "string" && ehGeneroMedico(v.trim())) return { ok: true, valor: v.trim() as GeneroMedico };
  return falhaCampo("genero", `Sexo inválido. Use: ${GENEROS_MEDICO.join(", ")}.`);
}

/**
 * CNPJ numérico ou alfanumérico: aceita máscara (pontos, barra, hífen,
 * espaços) e letras minúsculas; devolve os 14 caracteres normalizados
 * (ex.: "12ABC34501DE35"); "" limpa.
 */
export function validarCnpj(v: unknown): ResultadoValidacao<string> {
  if (v === null) return { ok: true, valor: "" };
  if (typeof v !== "string") return falhaCampo("cnpj", "CNPJ deve ser um texto.");
  const bruto = v.trim();
  if (bruto === "") return { ok: true, valor: "" };
  if (bruto.length > 24 || !/^[0-9A-Za-z.\-/\s]+$/.test(bruto)) return falhaCampo("cnpj", "CNPJ inválido.");
  const c = normalizarCnpj(bruto);
  if (!cnpjValido(c)) return falhaCampo("cnpj", "CNPJ inválido.");
  return { ok: true, valor: c };
}

export function validarPatchPerfilMedico(
  corpo: unknown,
  agora: Date = new Date(),
): ResultadoValidacao<PatchPerfilMedicoValidado> {
  if (!ehObjetoSimples(corpo)) return { ok: false, erro: "Corpo da requisição inválido." };
  for (const k of Object.keys(corpo)) {
    if (!(CAMPOS_DADOS_PESSOAIS_MEDICO as readonly string[]).includes(k)) {
      return falhaCampo(k, `Campo não editável: ${k}.`);
    }
  }

  const dados: PerfilMedicoDadosPessoaisUpdate = {};
  const campos: CampoDadosPessoaisMedico[] = [];

  if (corpo.dataNascimento !== undefined) {
    const r = validarDataNascimentoMedico(corpo.dataNascimento, agora);
    if (!r.ok) return r;
    dados.dataNascimento = r.valor;
    campos.push("dataNascimento");
  }
  if (corpo.genero !== undefined) {
    const r = validarGeneroMedico(corpo.genero);
    if (!r.ok) return r;
    dados.genero = r.valor;
    campos.push("genero");
  }
  if (corpo.telefone !== undefined) {
    const r = validarTelefone(corpo.telefone === null ? "" : corpo.telefone);
    if (!r.ok) return r;
    dados.telefone = r.valor;
    campos.push("telefone");
  }
  if (corpo.cnpj !== undefined) {
    const r = validarCnpj(corpo.cnpj);
    if (!r.ok) return r;
    dados.cnpj = r.valor;
    campos.push("cnpj");
  }

  if (!campos.length) return { ok: false, erro: "Nenhum campo válido para atualizar." };
  return { ok: true, valor: { dados, campos } };
}
