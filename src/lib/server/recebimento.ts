/**
 * Recebimento do médico (fase 2, parte 3 — repasse diário): validação,
 * normalização e máscara da chave PIX ("DadosRecebimentoMedico").
 *
 * Espelha as CHECKs da migração 20261003_repasse_diario.sql
 * (DadosRecebimentoMedico_regras_check):
 * - pixTipo: cpf | cnpj | email | telefone | aleatoria;
 * - pixChave: 1–140 caracteres;
 * - titularTipo: pf (titularDocumento = CPF, 11 dígitos) ou pj
 *   (titularDocumento = CNPJ, 12 [0-9A-Z] + 2 dígitos);
 * - titularNome: 1–120 caracteres;
 * - chave do tipo cpf → titular pf com o MESMO CPF; cnpj → titular pj com o
 *   MESMO CNPJ.
 * Regras do servidor (o banco não sabe conferir):
 * - DVs do CPF e do CNPJ (numérico e alfanumérico);
 * - titular pj só com o CNPJ cadastrado no PerfilMedico (e o médico precisa
 *   ter CNPJ cadastrado);
 * - chave normalizada: CPF/CNPJ só caracteres, e-mail minúsculo, celular em
 *   E.164 (+55DD9XXXXXXXX), aleatória em UUID minúsculo com hífens.
 *
 * Privacidade: a chave e o documento completos só vão ao banco. Para a tela
 * e para a auditoria use as máscaras daqui (mascararChavePix /
 * mascararDocumento) — nunca o valor completo.
 *
 * Arquivo puro (sem "server-only"): o formulário do médico reaproveita as
 * constantes e máscaras, e `bun scripts/teste_recebimento.ts` testa tudo.
 */

import type { ResultadoValidacao } from "@/lib/server/validar-perfil";
import { cnpjValido, normalizarCnpj } from "@/components/bion/medico/dados-pessoais";

export const PIX_TIPOS = ["cpf", "cnpj", "email", "telefone", "aleatoria"] as const;
export type PixTipo = (typeof PIX_TIPOS)[number];

export const TITULAR_TIPOS = ["pf", "pj"] as const;
export type TitularTipo = (typeof TITULAR_TIPOS)[number];

export const ROTULO_PIX_TIPO: Record<PixTipo, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Celular",
  aleatoria: "Chave aleatória",
};

export const ROTULO_TITULAR_TIPO: Record<TitularTipo, string> = {
  pf: "Pessoa física (CPF)",
  pj: "Pessoa jurídica (CNPJ)",
};

/** Limites (CHECK do banco: chave 1–140, nome 1–120; e-mail PIX ≤ 77). */
export const PIX_CHAVE_MAX = 140;
export const PIX_EMAIL_MAX = 77;
export const TITULAR_NOME_MIN = 2;
export const TITULAR_NOME_MAX = 120;

/** Campos aceitos no PUT /api/medico/recebimento (chave fora daqui → 400). */
export const CAMPOS_RECEBIMENTO = ["pixTipo", "pixChave", "titularTipo", "titularNome", "titularDocumento"] as const;
export type CampoRecebimento = (typeof CAMPOS_RECEBIMENTO)[number];

/** Dados prontos para `db.dadosRecebimentoMedico.upsert` (já normalizados). */
export type DadosRecebimentoValidados = {
  pixTipo: PixTipo;
  pixChave: string;
  titularTipo: TitularTipo;
  titularNome: string;
  titularDocumento: string;
};

/** Formato devolvido por GET/PUT /api/medico/recebimento (só máscaras). */
export type RecebimentoWire = {
  pixTipo: PixTipo;
  chaveMascarada: string;
  titularTipo: TitularTipo;
  titularNome: string;
  documentoMascarado: string;
  /** ISO 8601. */
  atualizadoEm: string;
};

export function ehPixTipo(v: unknown): v is PixTipo {
  return typeof v === "string" && (PIX_TIPOS as readonly string[]).includes(v);
}
export function ehTitularTipo(v: unknown): v is TitularTipo {
  return typeof v === "string" && (TITULAR_TIPOS as readonly string[]).includes(v);
}

function falhaCampo(campo: CampoRecebimento | string, erro: string): { ok: false; erro: string; campo: string } {
  return { ok: false, erro, campo };
}

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Controle C0/C1, DEL, zero-width e marcas bidi (não entram em nome nem chave).
const RE_INVISIVEIS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/* ------------------------------------------------------------------ CPF */

/** CPF só com dígitos e DVs corretos (11 iguais rejeitados). */
export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Aceita "123.456.789-09", "123 456 789 09" ou "12345678909"; devolve 11 dígitos. */
export function normalizarCpfRecebimento(v: unknown, campo: CampoRecebimento): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo(campo, "CPF deve ser um texto.");
  const bruto = v.replace(RE_INVISIVEIS, "").trim();
  if (!bruto) return falhaCampo(campo, "Informe o CPF.");
  if (bruto.length > 20 || !/^[\d.\-\s]+$/.test(bruto)) return falhaCampo(campo, "CPF inválido.");
  const d = bruto.replace(/\D/g, "");
  if (!cpfValido(d)) return falhaCampo(campo, "CPF inválido. Confira os 11 dígitos.");
  return { ok: true, valor: d };
}

/* ----------------------------------------------------------------- CNPJ */

/** CNPJ numérico ou alfanumérico, com ou sem máscara; devolve os 14 caracteres. */
export function normalizarCnpjRecebimento(v: unknown, campo: CampoRecebimento): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo(campo, "CNPJ deve ser um texto.");
  const bruto = v.replace(RE_INVISIVEIS, "").trim();
  if (!bruto) return falhaCampo(campo, "Informe o CNPJ.");
  if (bruto.length > 24 || !/^[0-9A-Za-z.\-/\s]+$/.test(bruto)) return falhaCampo(campo, "CNPJ inválido.");
  const c = normalizarCnpj(bruto);
  if (!cnpjValido(c)) return falhaCampo(campo, "CNPJ inválido. Confira os 14 caracteres.");
  return { ok: true, valor: c };
}

/* --------------------------------------------------------------- e-mail */

// Parte local com os caracteres usuais; domínio com rótulos [a-z0-9-] e TLD ≥ 2 letras.
const RE_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizarEmailPix(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("pixChave", "E-mail deve ser um texto.");
  const s = v.replace(RE_INVISIVEIS, "").trim().toLowerCase();
  if (!s) return falhaCampo("pixChave", "Informe o e-mail da chave PIX.");
  if (s.length > PIX_EMAIL_MAX) return falhaCampo("pixChave", `E-mail deve ter no máximo ${PIX_EMAIL_MAX} caracteres.`);
  const [local] = s.split("@");
  if (!RE_EMAIL.test(s) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return falhaCampo("pixChave", "E-mail inválido.");
  }
  return { ok: true, valor: s };
}

/* ------------------------------------------------------------- telefone */

/**
 * Celular brasileiro em E.164: "+55" + DDD + 9 + 8 dígitos. Aceita
 * "(11) 91234-5678", "11912345678", "+55 11 91234-5678", "011912345678".
 * Fixo não é aceito (chave PIX de telefone é de celular).
 */
export function normalizarTelefonePix(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("pixChave", "Celular deve ser um texto.");
  const s = v.replace(RE_INVISIVEIS, "").trim();
  const invalido = () => falhaCampo("pixChave", "Celular inválido. Use DDD + número, ex.: (11) 91234-5678.");
  if (!s) return falhaCampo("pixChave", "Informe o celular da chave PIX.");
  if (s.length > 25 || !/^[\d\s()+\-.]+$/.test(s)) return invalido();
  // "+" só no início
  if (s.indexOf("+") > 0 || (s.match(/\+/g)?.length ?? 0) > 1) return invalido();
  let d = s.replace(/\D/g, "");
  if (s.startsWith("+")) {
    if (!d.startsWith("55")) return falhaCampo("pixChave", "Use um celular do Brasil (+55).");
    d = d.slice(2);
  } else if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  else if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 11) return invalido();
  if (!/^[1-9][1-9]9/.test(d)) return invalido();
  return { ok: true, valor: `+55${d}` };
}

/* ------------------------------------------------------------ aleatória */

/** Chave aleatória (EVP) = UUID; aceita maiúsculas e sem hífens; devolve minúsculo com hífens. */
export function normalizarChaveAleatoria(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("pixChave", "Chave aleatória deve ser um texto.");
  const s = v.replace(RE_INVISIVEIS, "").trim().toLowerCase();
  if (!s) return falhaCampo("pixChave", "Informe a chave aleatória.");
  const h = s.replace(/-/g, "");
  const formatoOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) || /^[0-9a-f]{32}$/.test(s);
  // RFC 4122/9562: versão 1–8 e variante 10xx; rejeita o UUID "nulo".
  if (!formatoOk || !/^[1-8]$/.test(h[12]) || !/^[89ab]$/.test(h[16]) || /^0+$/.test(h)) {
    return falhaCampo("pixChave", "Chave aleatória inválida. Copie a chave completa do app do seu banco (formato 8-4-4-4-12).");
  }
  return { ok: true, valor: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` };
}

/* ------------------------------------------------------------------ nome */

export function normalizarTitularNome(v: unknown): ResultadoValidacao<string> {
  if (typeof v !== "string") return falhaCampo("titularNome", "Nome do titular deve ser um texto.");
  const s = v.replace(RE_INVISIVEIS, "").replace(/\s+/g, " ").trim();
  if (!s) return falhaCampo("titularNome", "Informe o nome do titular da conta.");
  if (s.length < TITULAR_NOME_MIN || !/\p{L}/u.test(s)) return falhaCampo("titularNome", "Nome do titular inválido.");
  if (s.length > TITULAR_NOME_MAX) {
    return falhaCampo("titularNome", `Nome do titular deve ter no máximo ${TITULAR_NOME_MAX} caracteres.`);
  }
  return { ok: true, valor: s };
}

/* ---------------------------------------------------------- validação */

export function normalizarChavePix(tipo: PixTipo, v: unknown): ResultadoValidacao<string> {
  switch (tipo) {
    case "cpf":
      return normalizarCpfRecebimento(v, "pixChave");
    case "cnpj":
      return normalizarCnpjRecebimento(v, "pixChave");
    case "email":
      return normalizarEmailPix(v);
    case "telefone":
      return normalizarTelefonePix(v);
    case "aleatoria":
      return normalizarChaveAleatoria(v);
  }
}

/**
 * Valida o corpo do PUT /api/medico/recebimento.
 * `cnpjPerfil`: PerfilMedico.cnpj do PRÓPRIO médico ("" = sem CNPJ).
 * Todos os campos são obrigatórios; chave desconhecida → erro com `campo`.
 */
export function validarRecebimento(
  corpo: unknown,
  ctx: { cnpjPerfil: string | null | undefined },
): ResultadoValidacao<DadosRecebimentoValidados> {
  if (!ehObjetoSimples(corpo)) return { ok: false, erro: "Corpo da requisição inválido." };
  for (const k of Object.keys(corpo)) {
    if (!(CAMPOS_RECEBIMENTO as readonly string[]).includes(k)) return falhaCampo(k, `Campo não aceito: ${k}.`);
  }

  if (!ehPixTipo(corpo.pixTipo)) {
    return falhaCampo("pixTipo", "Tipo de chave PIX inválido. Use: CPF, CNPJ, e-mail, celular ou chave aleatória.");
  }
  const pixTipo = corpo.pixTipo;
  if (!ehTitularTipo(corpo.titularTipo)) {
    return falhaCampo("titularTipo", "Informe se a conta é de pessoa física (CPF) ou jurídica (CNPJ).");
  }
  const titularTipo = corpo.titularTipo;

  const chave = normalizarChavePix(pixTipo, corpo.pixChave);
  if (!chave.ok) return chave;
  if (chave.valor.length > PIX_CHAVE_MAX) return falhaCampo("pixChave", "Chave PIX muito longa.");

  const nome = normalizarTitularNome(corpo.titularNome);
  if (!nome.ok) return nome;

  let documento: string;
  if (titularTipo === "pf") {
    const r = normalizarCpfRecebimento(corpo.titularDocumento, "titularDocumento");
    if (!r.ok) return r;
    documento = r.valor;
  } else {
    const cnpjPerfil = normalizarCnpj(ctx.cnpjPerfil ?? "");
    if (!cnpjPerfil || !cnpjValido(cnpjPerfil)) {
      return falhaCampo(
        "titularTipo",
        "Para receber em conta de pessoa jurídica, cadastre antes o CNPJ em Dados pessoais.",
      );
    }
    const r = normalizarCnpjRecebimento(corpo.titularDocumento, "titularDocumento");
    if (!r.ok) return r;
    if (r.valor !== cnpjPerfil) {
      return falhaCampo("titularDocumento", "O CNPJ do titular precisa ser o mesmo CNPJ cadastrado no seu perfil.");
    }
    documento = r.valor;
  }

  if (pixTipo === "cpf") {
    if (titularTipo !== "pf") {
      return falhaCampo("titularTipo", "Chave do tipo CPF é de pessoa física: escolha titular pessoa física.");
    }
    if (chave.valor !== documento) {
      return falhaCampo("pixChave", "A chave CPF precisa ser o mesmo CPF do titular.");
    }
  }
  if (pixTipo === "cnpj") {
    if (titularTipo !== "pj") {
      return falhaCampo("titularTipo", "Chave do tipo CNPJ é de pessoa jurídica: escolha titular pessoa jurídica.");
    }
    if (chave.valor !== documento) {
      return falhaCampo("pixChave", "A chave CNPJ precisa ser o mesmo CNPJ do titular.");
    }
  }

  return {
    ok: true,
    valor: { pixTipo, pixChave: chave.valor, titularTipo, titularNome: nome.valor, titularDocumento: documento },
  };
}

/* -------------------------------------------------------------- máscaras */

/** CPF "12345678909" → "***.456.789-**". */
export function mascararCpf(d: string): string {
  if (!/^\d{11}$/.test(d)) return "***.***.***-**";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** CNPJ "12345678000195" → "**.345.678/0001-**" (vale para o alfanumérico). */
export function mascararCnpj(c: string): string {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c)) return "**.***.***/****-**";
  return `**.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-**`;
}

/** "alisson@gmail.com" → "a***@gmail.com". */
export function mascararEmail(e: string): string {
  const i = e.lastIndexOf("@");
  if (i < 1) return "***";
  return `${e[0]}***${e.slice(i)}`;
}

/** "+5511912345678" → "+55 ** *****-5678". */
export function mascararTelefone(t: string): string {
  const d = t.replace(/\D/g, "");
  if (d.length < 4) return "+55 ** *****-****";
  return `+55 ** *****-${d.slice(-4)}`;
}

/** UUID → 4 primeiros + "…" + 4 últimos: "1f0c…9a7b". */
export function mascararAleatoria(u: string): string {
  const h = u.replace(/-/g, "");
  if (h.length < 12) return "****";
  return `${h.slice(0, 4)}…${h.slice(-4)}`;
}

export function mascararChavePix(tipo: string, chave: string): string {
  switch (tipo) {
    case "cpf":
      return mascararCpf(chave);
    case "cnpj":
      return mascararCnpj(chave);
    case "email":
      return mascararEmail(chave);
    case "telefone":
      return mascararTelefone(chave);
    case "aleatoria":
      return mascararAleatoria(chave);
    default:
      return "***";
  }
}

export function mascararDocumento(titularTipo: string, documento: string): string {
  return titularTipo === "pj" ? mascararCnpj(documento) : mascararCpf(documento);
}

/** Resumo mascarado para auditoria/telas: "CPF ***.456.789-**". */
export function resumoChaveMascarada(d: { pixTipo: string; pixChave: string }): string {
  const rotulo = ehPixTipo(d.pixTipo) ? ROTULO_PIX_TIPO[d.pixTipo] : "Chave";
  return `${rotulo} ${mascararChavePix(d.pixTipo, d.pixChave)}`;
}

/** Linha do banco → wire (só máscaras; nunca a chave nem o documento completos). */
export function recebimentoWire(r: {
  pixTipo: string;
  pixChave: string;
  titularTipo: string;
  titularNome: string;
  titularDocumento: string;
  atualizadoEm: Date;
}): RecebimentoWire {
  return {
    pixTipo: ehPixTipo(r.pixTipo) ? r.pixTipo : "aleatoria",
    chaveMascarada: mascararChavePix(r.pixTipo, r.pixChave),
    titularTipo: ehTitularTipo(r.titularTipo) ? r.titularTipo : "pf",
    titularNome: r.titularNome,
    documentoMascarado: mascararDocumento(r.titularTipo, r.titularDocumento),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}

/** Os dados validados são iguais à linha atual? (PUT sem mudança não grava nem audita.) */
export function recebimentoIgual(
  a: DadosRecebimentoValidados,
  b: { pixTipo: string; pixChave: string; titularTipo: string; titularNome: string; titularDocumento: string } | null,
): boolean {
  return (
    !!b &&
    a.pixTipo === b.pixTipo &&
    a.pixChave === b.pixChave &&
    a.titularTipo === b.titularTipo &&
    a.titularNome === b.titularNome &&
    a.titularDocumento === b.titularDocumento
  );
}
