import crypto from "node:crypto";

/**
 * Prazos de retenção definidos pelo Jurídico (20/10/2026):
 * - chamados e trechos livres da auditoria: nome do paciente vira código após 6 meses;
 * - monitor de IA (AuditLog acao LLM_TURNO): apagado após 6 meses (Marco Civil);
 * - auditoria: apagada após 5 anos (prescrição do CDC).
 */
export const MESES_PSEUDONIMIZAR = 6;
export const MESES_MONITOR_IA = 6;
export const ANOS_AUDITORIA = 5;
export const ACAO_MONITOR_IA = "LLM_TURNO";
export const PREFIXO_CODIGO = "PAC-";

/** Subtrai meses de calendário em UTC, prendendo o dia no fim do mês (31/08 − 6 meses = 28/02 ou 29/02). */
export function subtrairMeses(agora: Date, meses: number): Date {
  const d = new Date(agora.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

export function cortesRetencao(agora: Date) {
  return {
    pseudonimizar: subtrairMeses(agora, MESES_PSEUDONIMIZAR),
    monitorIa: subtrairMeses(agora, MESES_MONITOR_IA),
    auditoria: subtrairMeses(agora, ANOS_AUDITORIA * 12),
  };
}

/**
 * Código estável do paciente: "PAC-" + 8 hex do SHA-256 do id, sem salt.
 * É PSEUDONIMIZAÇÃO (LGPD art. 13, §4º), não anonimização: quem tem a base
 * de ids consegue recalcular o código e reidentificar o paciente.
 */
export function codigoPaciente(id: string): string {
  return PREFIXO_CODIGO + crypto.createHash("sha256").update(id).digest("hex").slice(0, 8).toUpperCase();
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Troca o nome do paciente pelo código no texto (sem diferenciar maiúsculas,
 * com e sem acento). Nomes com menos de 3 letras não são trocados, para não
 * apagar pedaços de palavras. Idempotente: rodar de novo não muda nada.
 */
export function pseudonimizarTexto(texto: string, nome: string, codigo: string): string {
  const n = nome.trim().replace(/\s+/g, " ");
  if (n.length < 3 || !texto) return texto;
  const variantes = Array.from(new Set([n, semAcento(n)]));
  let r = texto;
  for (const v of variantes) {
    const padrao = escapar(v).replace(/ /g, "\\s+");
    r = r.replace(new RegExp(`(?<![\\p{L}\\p{N}])${padrao}(?![\\p{L}\\p{N}])`, "giu"), codigo);
  }
  return r;
}

export function jaPseudonimizado(valor: string | null | undefined): boolean {
  return !!valor && valor.startsWith(PREFIXO_CODIGO);
}

/**
 * Descarte da auditoria após 5 anos: SÓ estas categorias (allowlist).
 * Confirmada pelo Jurídico em 20/10/2026: autenticacao, suporte e sistema.
 * Para ajustar, mude só esta lista (e os testes em retencao-logica.teste.ts).
 */
export const CATEGORIAS_DESCARTE_AUDITORIA = ["autenticacao", "suporte", "sistema"] as const;

/**
 * Nunca apagados pelo cron, mesmo que estejam numa categoria da allowlist.
 * Eles têm prazos próprios (6 anos fiscal / 20 anos prontuário), ainda não implementados.
 */
export const PREFIXOS_ACAO_PROTEGIDOS = ["CONSENTIMENTO_", "REPASSE_", "PRONTUARIO_", "DOCUMENTO_", "ARQUIVO_"] as const;
export const ACOES_PROTEGIDAS = ["EXCLUSAO_CONTA_SOLICITADA_PENDENTE", "EXCLUSAO_CONTA_FALHOU", "documento", "prontuario"] as const;
export const ENTIDADES_PROTEGIDAS = [
  "prontuario", "documento", "arquivo", "consentimento", "repasse", "Repasse",
  "pagamento", "reembolso", "evolucao", "consulta",
] as const;

type RegistroAuditoria = { acao: string; categoria: string; entidade?: string | null };

/** Regra pura (usada nos testes e como segunda checagem antes de apagar). */
export function auditoriaDescartavel(r: RegistroAuditoria): boolean {
  if (!(CATEGORIAS_DESCARTE_AUDITORIA as readonly string[]).includes(r.categoria)) return false;
  const acao = r.acao.toUpperCase();
  if (PREFIXOS_ACAO_PROTEGIDOS.some((p) => acao.startsWith(p))) return false;
  if (ACOES_PROTEGIDAS.some((a) => a.toUpperCase() === acao)) return false;
  if (r.entidade && ENTIDADES_PROTEGIDAS.some((e) => e.toLowerCase() === r.entidade!.toLowerCase())) return false;
  return true;
}

/** Filtro Prisma equivalente a auditoriaDescartavel, para registros anteriores ao corte. */
export function filtroDescarteAuditoria(corte: Date) {
  return {
    createdAt: { lt: corte },
    categoria: { in: [...CATEGORIAS_DESCARTE_AUDITORIA] },
    acao: { notIn: [...ACOES_PROTEGIDAS] },
    AND: [
      ...PREFIXOS_ACAO_PROTEGIDOS.map((p) => ({ NOT: { acao: { startsWith: p, mode: "insensitive" as const } } })),
      ...ACOES_PROTEGIDAS.map((a) => ({ NOT: { acao: { equals: a, mode: "insensitive" as const } } })),
      { OR: [{ entidade: null }, { entidade: { notIn: ENTIDADES_PROTEGIDAS.flatMap((e) => [e, e.toLowerCase(), e[0].toUpperCase() + e.slice(1)]) } }] },
    ],
  };
}

/** Simulação é o padrão: só apaga/altera com RETENCAO_DESCARTE_ATIVO=1 e sem ?dryRun=1. */
export function modoSimulacao(envAtivo: string | undefined, dryRunParam: string | null): boolean {
  if (dryRunParam === "1" || dryRunParam === "true") return true;
  return envAtivo?.trim() !== "1";
}

export const ORCAMENTO_MS = 240_000;
