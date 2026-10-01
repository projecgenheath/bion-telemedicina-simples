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

import {
  FAIXA_ALTURA_CM,
  FAIXA_PESO_KG,
  lerAlturaCm,
  lerPesoKg,
  medidaCanonica,
} from "@/lib/medidas-paciente";

import { IDADE_MAXIMA, idadeDeNascimento, isoParaDataNascimento } from "@/lib/idade";

// M3: leitura/normalização de peso e altura (isomórfica — também usada na UI).
export {
  alturaCanonica,
  calcularImc,
  formatarAltura,
  formatarPeso,
  lerAlturaCm,
  lerPesoKg,
  medidaCanonica,
  pesoCanonico,
} from "@/lib/medidas-paciente";

export type PerfilPacienteUpdate = {
  cpf?: string;
  telefone?: string;
  convenio?: string;
  idade?: number;
  /** M4: dia de calendário (Date à meia-noite UTC → coluna DATE); null limpa. */
  dataNascimento?: Date | null;
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

/**
 * M4 — CPF travado: depois que o perfil tem um CPF VÁLIDO, o próprio paciente
 * não pode trocá-lo nem apagá-lo (correção só via suporte/admin). Perfil sem
 * CPF ou com valor legado inválido pode definir. `cpfNovo` já validado.
 */
export function cpfPodeSerAlterado(cpfAtual: string | null | undefined, cpfNovo: string): boolean {
  const atual = validarCpf(cpfAtual ?? "");
  if (!atual.ok || atual.valor === "") return true;
  return atual.valor === cpfNovo;
}

/**
 * Telefone (M4): número brasileiro com DDD. Aceita máscara, espaços e +55;
 * exige DDD válido (11–99) e 10 dígitos (fixo, começa com 2–5) ou 11 dígitos
 * (celular, começa com 9). Grava normalizado: "(11) 91234-5678" /
 * "(11) 3123-4567". "" limpa. Números estrangeiros não são aceitos.
 */
export function validarTelefone(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("telefone", "Telefone deve ser um texto.");
  const s = v.trim();
  if (s === "") return { ok: true, valor: "" };
  const invalido = () => falhaCampo("telefone", "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.");
  if (s.length > LIMITES.telefoneMax || !/^[\d\s()+\-.]+$/.test(s)) return invalido();
  let d = s.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  else if ((d.length === 11 || d.length === 12) && d.startsWith("0")) d = d.slice(1); // 0 + DDD + número
  if (d.length !== 10 && d.length !== 11) return invalido();
  if (!/^[1-9][1-9]/.test(d)) return invalido();
  const numero = d.slice(2);
  if (d.length === 11 ? numero[0] !== "9" : !/^[2-5]/.test(numero)) return invalido();
  const corte = numero.length - 4;
  return { ok: true, valor: `(${d.slice(0, 2)}) ${numero.slice(0, corte)}-${numero.slice(corte)}` };
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

/**
 * M3 — Peso/altura: leitura tolerante ("62", "62 kg", "62,5"; "168", "168 cm",
 * "1,68", "1,68 m") e gravação no formato CANÔNICO (kg / cm, ponto decimal,
 * sem unidade — ver src/lib/medidas-paciente.ts). null/"" limpa.
 */
function validarMedida(v: unknown, campo: "peso" | "altura"): ResultadoValidacao<string | null> {
  if (v === null) return { ok: true, valor: null };
  if (typeof v === "string") {
    if (v.length > LIMITES.medidaMax) return falhaCampo(campo, campo === "peso" ? "Peso inválido." : "Altura inválida.");
    if (v.trim() === "") return { ok: true, valor: null };
  } else if (typeof v !== "number") {
    return falhaCampo(campo, campo === "peso" ? "Peso deve ser um número." : "Altura deve ser um número.");
  }
  if (campo === "peso") {
    const kg = lerPesoKg(v);
    if (kg === null) {
      return falhaCampo(
        "peso",
        `Peso inválido. Informe em kg, entre ${FAIXA_PESO_KG.min} e ${FAIXA_PESO_KG.max} (ex.: 62 ou 62,5).`,
      );
    }
    return { ok: true, valor: medidaCanonica(kg) };
  }
  const cm = lerAlturaCm(v);
  if (cm === null) {
    return falhaCampo(
      "altura",
      `Altura inválida. Informe em cm (ex.: 168) ou em metros (ex.: 1,68), entre ${FAIXA_ALTURA_CM.min} e ${FAIXA_ALTURA_CM.max} cm.`,
    );
  }
  return { ok: true, valor: medidaCanonica(cm) };
}

/**
 * M4 — data de nascimento: "YYYY-MM-DD" válida no calendário, não futura e
 * com idade ≤ IDADE_MAXIMA (hoje em America/Sao_Paulo). null/"" → limpar.
 */
export function validarDataNascimento(
  v: unknown,
  agora: Date = new Date(),
): ResultadoValidacao<{ data: Date; idade: number } | null> {
  if (v === null || v === "") return { ok: true, valor: null };
  if (typeof v !== "string") return falhaCampo("dataNascimento", "Data de nascimento inválida. Use AAAA-MM-DD.");
  const data = isoParaDataNascimento(v);
  if (!data) return falhaCampo("dataNascimento", "Data de nascimento inválida. Use AAAA-MM-DD.");
  const idade = idadeDeNascimento(v.trim(), agora);
  if (idade === null) return falhaCampo("dataNascimento", "A data de nascimento não pode estar no futuro.");
  if (idade > IDADE_MAXIMA) {
    return falhaCampo("dataNascimento", `Data de nascimento inválida (idade acima de ${IDADE_MAXIMA} anos).`);
  }
  return { ok: true, valor: { data, idade } };
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valida o corpo do PATCH /api/perfil. `foto` NÃO é tratada aqui (ver
 * validarFotoPerfil — achado A2).
 */
export function validarPatchPerfil(
  corpo: unknown,
  agora: Date = new Date(),
): ResultadoValidacao<PatchPerfilValidado> {
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

  // M4: data de nascimento "YYYY-MM-DD" (null/"" limpa). Quando informada,
  // a idade gravada passa a ser a calculada (America/Sao_Paulo) — vence um
  // `idade` enviado junto.
  if (corpo.dataNascimento !== undefined) {
    const r = validarDataNascimento(corpo.dataNascimento, agora);
    if (!r.ok) return r;
    perfil.dataNascimento = r.valor ? r.valor.data : null;
    if (r.valor) {
      perfil.idade = r.valor.idade;
      if (!campos.includes("idade")) campos.push("idade");
    }
    campos.push("dataNascimento");
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

  for (const campo of ["peso", "altura"] as const) {
    if (corpo[campo] === undefined) continue;
    const r = validarMedida(corpo[campo], campo);
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

/* ------------------------------------------------------------------ */
/* A2 — foto de perfil (data URL gravada em PerfilPaciente.foto)        */
/* ------------------------------------------------------------------ */

/** ~150 KB binários. O cliente envia JPEG 256×256 (tipicamente 10–40 KB). */
export const FOTO_MAX_CHARS = 200_000;

const RE_FOTO = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function assinaturaConfere(mime: string, bytes: Uint8Array): boolean {
  const comeca = (...b: number[]) => b.every((x, i) => bytes[i] === x);
  if (mime === "jpeg") return comeca(0xff, 0xd8, 0xff);
  if (mime === "png") return comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mime === "webp") {
    // "RIFF" .... "WEBP"
    return comeca(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

/**
 * Foto: `null` ou "" remove; caso contrário exige data URL base64 de
 * JPEG/PNG/WebP, até FOTO_MAX_CHARS, com assinatura binária coerente com o
 * MIME declarado (impede gravar texto/HTML/URL externa no campo).
 */
export function validarFotoPerfil(v: unknown): ResultadoValidacao<string | null> {
  if (v === null || v === "") return { ok: true, valor: null };
  if (typeof v !== "string") return falhaCampo("foto", "Foto inválida.");
  if (v.length > FOTO_MAX_CHARS) {
    return falhaCampo("foto", "Foto muito grande. Envie uma imagem menor (máx. ~150 KB).");
  }
  const m = RE_FOTO.exec(v);
  if (!m) return falhaCampo("foto", "Foto inválida. Use JPG, PNG ou WebP.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length < 12 || !assinaturaConfere(m[1], bytes)) {
    return falhaCampo("foto", "Foto inválida. Use JPG, PNG ou WebP.");
  }
  return { ok: true, valor: v };
}
