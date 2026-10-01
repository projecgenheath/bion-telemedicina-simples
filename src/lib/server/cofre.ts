import "server-only";
import crypto from "crypto";

/**
 * Cofre de identificação (LGPD art. 16, I + Lei 13.787/2018).
 *
 * Na anonimização, a identificação mínima do paciente (nome, CPF e data de
 * nascimento, se existir) é guardada CIFRADA numa tabela separada
 * (`IdentificacaoCofre`) para que o prontuário preservado possa ser
 * reidentificado por obrigação legal (ordem judicial, pedido do titular,
 * CFM) — só pelo servidor, só por ADMIN, sempre com motivo e auditoria.
 *
 * Chave: `BION_COFRE_CHAVE` (32 bytes em hex [64 chars] ou base64), somente
 * no servidor. Dela derivam (HKDF-SHA256) duas chaves independentes:
 *   - AES-256-GCM para os dados (IV aleatório de 12 bytes; AAD = userId,
 *     o que impede mover um registro cifrado para outro paciente);
 *   - HMAC-SHA256 para os hashes de busca exata (CPF e nome normalizados).
 * PERDER A CHAVE = PERDER A IDENTIFICAÇÃO (não há recuperação).
 */

export type IdentificacaoClara = {
  nome: string;
  cpf: string;
  dataNascimento: string | null;
};

const VERSAO = "v1";

function erro503(msg: string): Error & { status?: number } {
  const e = new Error(msg) as Error & { status?: number };
  e.status = 503;
  return e;
}

function chaveMestra(): Buffer {
  const bruto = process.env.BION_COFRE_CHAVE?.trim();
  if (!bruto) {
    throw erro503(
      "Cofre de identificação não configurado (BION_COFRE_CHAVE ausente no servidor). Nada foi alterado.",
    );
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(bruto) ? Buffer.from(bruto, "hex") : Buffer.from(bruto, "base64");
  if (buf.length !== 32) {
    throw erro503(
      "BION_COFRE_CHAVE inválida: use 32 bytes aleatórios em hex (64 caracteres) ou base64. Nada foi alterado.",
    );
  }
  return buf;
}

function derivar(info: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", chaveMestra(), Buffer.alloc(0), `bion-cofre:${info}`, 32));
}

/** Lança 503 se a chave estiver ausente/inválida (checagem antecipada). */
export function exigirChaveCofre(): void {
  chaveMestra();
}

export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/** Sem acento, minúsculo, espaços colapsados. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hmac(tipo: "cpf" | "nome", valor: string): string {
  return crypto.createHmac("sha256", derivar("hmac")).update(`${tipo}:${valor}`).digest("hex");
}

/** Hash de busca do CPF (null se não tiver 11 dígitos). */
export function hashCpf(cpf: string): string | null {
  const n = normalizarCpf(cpf);
  return n.length === 11 ? hmac("cpf", n) : null;
}

/** Hash de busca do nome (null se vazio). */
export function hashNome(nome: string): string | null {
  const n = normalizarNome(nome);
  return n ? hmac("nome", n) : null;
}

export function cifrarIdentificacao(userId: string, dados: IdentificacaoClara): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivar("aes"), iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ct = Buffer.concat([cipher.update(JSON.stringify(dados), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSAO, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decifrarIdentificacao(userId: string, cifrado: string): IdentificacaoClara {
  const [versao, ivB64, tagB64, ctB64] = cifrado.split(":");
  if (versao !== VERSAO || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Registro do cofre em formato desconhecido.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivar("aes"), Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const claro = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return JSON.parse(claro.toString("utf8")) as IdentificacaoClara;
}

/**
 * Data de nascimento, se existir. O schema não tem esse campo; procura de
 * forma tolerante uma chave "*nascimento*" (string) no JSON da anamnese.
 */
export function extrairDataNascimento(coletas: string[]): string | null {
  const buscar = (v: unknown, prof: number): string | null => {
    if (!v || typeof v !== "object" || prof > 6) return null;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/nascimento/i.test(k) && typeof val === "string" && val.trim()) return val.trim().slice(0, 40);
      const r = buscar(val, prof + 1);
      if (r) return r;
    }
    return null;
  };
  for (const c of coletas) {
    try {
      const r = buscar(JSON.parse(c || "{}"), 0);
      if (r) return r;
    } catch {
      /* JSON inválido: ignora */
    }
  }
  return null;
}
