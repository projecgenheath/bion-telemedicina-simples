/**
 * A1 (auditoria 2026-09) — validação do PATCH /api/perfil (perfil do próprio
 * paciente). Validadores pequenos, sem dependência extra (zod não é
 * dependência direta do projeto).
 *
 * Regras:
 * - Só campos da whitelist são aceitos; chaves desconhecidas são IGNORADAS
 *   (não chegam ao banco nem ao log de auditoria).
 * - Tipo errado / formato inválido / tamanho excedido → erro (400 na rota).
 * - Listas clínicas (alergias, medicamentos, comorbidades) precisam ser
 *   string[]; são normalizadas (trim, sem vazios, sem duplicatas, limites).
 *
 * Arquivo puro (sem "server-only") para poder ser testado com
 * `bun scripts/teste_validar_perfil.ts`.
 */

export type PerfilPacienteUpdate = {
  cpf?: string;
  telefone?: string;
  convenio?: string;
  idade?: number;
  genero?: string;
  alergias?: string;
  medicamentos?: string;
  comorbidades?: string;
  tipoSanguineo?: string;
  peso?: string | null;
  altura?: string | null;
  profissao?: string;
  estadoCivil?: string;
};

export type PatchPerfilValidado = {
  /** Novo nome do usuário (tabela User), se enviado. */
  nome?: string;
  /** Campos da tabela PerfilPaciente. */
  perfil: PerfilPacienteUpdate;
  /** Nomes dos campos aceitos (para o log de auditoria). */
  campos: string[];
};

export type ResultadoValidacao<T> = { ok: true; valor: T } | { ok: false; erro: string; campo?: string };

const LIMITES = {
  nomeMin: 3,
  nomeMax: 120,
  telefoneMax: 25,
  convenioMax: 80,
  generoMax: 40,
  profissaoMax: 80,
  estadoCivilMax: 40,
  medidaMax: 20,
  itemListaMax: 120,
  itensListaMax: 50,
  idadeMax: 130,
} as const;

export const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// Caracteres de controle ASCII (todos os campos são de linha única).
const RE_CONTROLE = /[\u0000-\u001F\u007F]/g;

function falhaCampo(campo: string, erro: string): { ok: false; erro: string; campo: string } {
  return { ok: false, erro, campo };
}

function texto(
  v: unknown,
  campo: string,
  rotulo: string,
  max: number,
): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo(campo, `${rotulo} deve ser um texto.`);
  const s = v.replace(RE_CONTROLE, "").replace(/\s+/g, " ").trim();
  if (s.length > max) return falhaCampo(campo, `${rotulo} deve ter no máximo ${max} caracteres.`);
  return { ok: true, valor: s };
}

/** CPF: aceita com ou sem máscara; "" limpa o campo. Grava no formato 000.000.000-00. */
export function validarCpf(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("cpf", "CPF deve ser um texto.");
  const bruto = v.trim();
  if (bruto === "") return { ok: true, valor: "" };
  if (!/^[\d.\-\s]+$/.test(bruto)) return falhaCampo("cpf", "CPF inválido.");
  const d = bruto.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return falhaCampo("cpf", "CPF inválido.");
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (dv(9) !== Number(d[9]) || dv(10) !== Number(d[10])) return falhaCampo("cpf", "CPF inválido.");
  return { ok: true, valor: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` };
}

/** Telefone: só dígitos, espaços, + ( ) - . ; 10 a 13 dígitos (DDD + número, opcional +55). "" limpa. */
export function validarTelefone(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("telefone", "Telefone deve ser um texto.");
  const s = v.trim();
  if (s === "") return { ok: true, valor: "" };
  if (s.length > LIMITES.telefoneMax || !/^[\d\s()+\-.]+$/.test(s)) {
    return falhaCampo("telefone", "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.");
  }
  const digitos = s.replace(/\D/g, "").length;
  if (digitos < 10 || digitos > 13) {
    return falhaCampo("telefone", "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.");
  }
  return { ok: true, valor: s };
}

function validarLista(v: unknown, campo: string, rotulo: string): ResultadoValidacao<string> {
  if (!Array.isArray(v)) return falhaCampo(campo, `${rotulo} deve ser uma lista de textos.`);
  if (v.length > LIMITES.itensListaMax * 2) {
    return falhaCampo(campo, `${rotulo}: no máximo ${LIMITES.itensListaMax} itens.`);
  }
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return falhaCampo(campo, `${rotulo} deve ser uma lista de textos.`);
    const s = item.replace(RE_CONTROLE, "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (s.length > LIMITES.itemListaMax) {
      return falhaCampo(campo, `${rotulo}: cada item deve ter no máximo ${LIMITES.itemListaMax} caracteres.`);
    }
    const chave = s.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(s);
  }
  if (itens.length > LIMITES.itensListaMax) {
    return falhaCampo(campo, `${rotulo}: no máximo ${LIMITES.itensListaMax} itens.`);
  }
  return { ok: true, valor: JSON.stringify(itens) };
}

/** Peso/altura: texto curto ou número; null/"" limpa. (Formato canônico é tema do achado M3.) */
function validarMedida(v: unknown, campo: string, rotulo: string): ResultadoValidacao<string | null> {
  if (v === null) return { ok: true, valor: null };
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return falhaCampo(campo, `${rotulo} inválido.`);
    return { ok: true, valor: String(v) };
  }
  const t = texto(v, campo, rotulo, LIMITES.medidaMax);
  if (!t.ok) return t;
  return { ok: true, valor: t.valor === "" ? null : t.valor };
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valida o corpo do PATCH /api/perfil. `foto` NÃO é tratada aqui (ver
 * validarFotoPerfil — achado A2).
 */
export function validarPatchPerfil(corpo: unknown): ResultadoValidacao<PatchPerfilValidado> {
  if (!ehObjetoSimples(corpo)) return { ok: false, erro: "Corpo da requisição inválido." };

  const perfil: PerfilPacienteUpdate = {};
  const campos: string[] = [];
  let nome: string | undefined;

  if (corpo.nome !== undefined) {
    const t = texto(corpo.nome, "nome", "Nome", LIMITES.nomeMax);
    if (!t.ok) return t;
    if (t.valor.length < LIMITES.nomeMin) return falhaCampo("nome", "Informe seu nome completo.");
    nome = t.valor;
    campos.push("nome");
  }

  if (corpo.cpf !== undefined) {
    const r = validarCpf(corpo.cpf);
    if (!r.ok) return r;
    perfil.cpf = r.valor;
    campos.push("cpf");
  }

  if (corpo.telefone !== undefined) {
    const r = validarTelefone(corpo.telefone);
    if (!r.ok) return r;
    perfil.telefone = r.valor;
    campos.push("telefone");
  }

  if (corpo.convenio !== undefined) {
    const t = texto(corpo.convenio, "convenio", "Convênio", LIMITES.convenioMax);
    if (!t.ok) return t;
    perfil.convenio = t.valor || "Particular";
    campos.push("convenio");
  }

  if (corpo.idade !== undefined) {
    const v = corpo.idade;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > LIMITES.idadeMax) {
      return falhaCampo("idade", `Idade deve ser um número inteiro entre 0 e ${LIMITES.idadeMax}.`);
    }
    perfil.idade = v;
    campos.push("idade");
  }

  if (corpo.genero !== undefined) {
    const t = texto(corpo.genero, "genero", "Sexo/gênero", LIMITES.generoMax);
    if (!t.ok) return t;
    perfil.genero = t.valor;
    campos.push("genero");
  }

  for (const [campo, rotulo] of [
    ["alergias", "Alergias"],
    ["medicamentos", "Medicamentos"],
    ["comorbidades", "Comorbidades"],
  ] as const) {
    if (corpo[campo] === undefined) continue;
    const r = validarLista(corpo[campo], campo, rotulo);
    if (!r.ok) return r;
    perfil[campo] = r.valor;
    campos.push(campo);
  }

  if (corpo.tipoSanguineo !== undefined) {
    if (typeof corpo.tipoSanguineo !== "string") {
      return falhaCampo("tipoSanguineo", "Tipo sanguíneo inválido.");
    }
    const ts = corpo.tipoSanguineo.replace(/\s+/g, "").toUpperCase();
    if (ts !== "" && !(TIPOS_SANGUINEOS as readonly string[]).includes(ts)) {
      return falhaCampo("tipoSanguineo", `Tipo sanguíneo inválido. Use: ${TIPOS_SANGUINEOS.join(", ")}.`);
    }
    perfil.tipoSanguineo = ts;
    campos.push("tipoSanguineo");
  }

  for (const [campo, rotulo] of [
    ["peso", "Peso"],
    ["altura", "Altura"],
  ] as const) {
    if (corpo[campo] === undefined) continue;
    const r = validarMedida(corpo[campo], campo, rotulo);
    if (!r.ok) return r;
    perfil[campo] = r.valor;
    campos.push(campo);
  }

  if (corpo.profissao !== undefined) {
    const t = texto(corpo.profissao, "profissao", "Profissão", LIMITES.profissaoMax);
    if (!t.ok) return t;
    perfil.profissao = t.valor;
    campos.push("profissao");
  }

  if (corpo.estadoCivil !== undefined) {
    const t = texto(corpo.estadoCivil, "estadoCivil", "Estado civil", LIMITES.estadoCivilMax);
    if (!t.ok) return t;
    perfil.estadoCivil = t.valor;
    campos.push("estadoCivil");
  }

  return { ok: true, valor: { ...(nome !== undefined ? { nome } : {}), perfil, campos } };
}
