/**
 * Rótulos legíveis e tom visual para cada estado que o admin enxerga.
 * Nunca mostrar o valor cru do banco (ex.: "pendente_anamnese").
 * Os rótulos são do ADMIN (mais precisos que os do paciente/médico).
 */
import type { ApptStatus, AuditSeveridade } from "@/lib/bion-tipos";

export type Tom = "neutro" | "ok" | "atencao" | "critico" | "dinheiro" | "sinal";
export type Estado = { rotulo: string; tom: Tom };

/** Fallback: "aguardando_algo" → "Aguardando algo". */
export function humanizar(valor: string | null | undefined): string {
  const t = String(valor ?? "").replace(/[_-]+/g, " ").trim();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function buscar<T extends string>(mapa: Record<T, Estado>, valor: string | null | undefined): Estado {
  const e = (mapa as Record<string, Estado>)[String(valor ?? "")];
  return e ?? { rotulo: humanizar(valor), tom: "neutro" };
}

const CONSULTA: Record<ApptStatus, Estado> = {
  confirmada: { rotulo: "Confirmada", tom: "ok" },
  pendente_anamnese: { rotulo: "Triagem pendente", tom: "sinal" },
  em_espera: { rotulo: "Aguardando pagamento", tom: "atencao" },
  concluida: { rotulo: "Concluída", tom: "neutro" },
  cancelada: { rotulo: "Cancelada", tom: "critico" },
  aguardando_reagendamento: { rotulo: "Aguardando reagendamento", tom: "atencao" },
};
export const estadoConsulta = (s: string | null | undefined) => buscar(CONSULTA, s);

const MEDICO: Record<"ativo" | "pendente" | "suspenso", Estado> = {
  ativo: { rotulo: "Ativo", tom: "ok" },
  pendente: { rotulo: "Em validação", tom: "atencao" },
  suspenso: { rotulo: "Suspenso", tom: "critico" },
};
export const estadoMedico = (s: string | null | undefined) => buscar(MEDICO, s);

const CHAMADO: Record<"aberto" | "em_andamento" | "resolvido", Estado> = {
  aberto: { rotulo: "Aberto", tom: "atencao" },
  em_andamento: { rotulo: "Em atendimento", tom: "sinal" },
  resolvido: { rotulo: "Resolvido", tom: "ok" },
};
export const estadoChamado = (s: string | null | undefined) => buscar(CHAMADO, s);

/** Repasse diário ao médico (status no banco: fechado | pago). */
const REPASSE: Record<"previa" | "fechado" | "pago", Estado> = {
  previa: { rotulo: "Prévia de hoje", tom: "neutro" },
  fechado: { rotulo: "A pagar", tom: "dinheiro" },
  pago: { rotulo: "Pago", tom: "ok" },
};
export const estadoRepasse = (s: string | null | undefined) => buscar(REPASSE, s);

const REEMBOLSO: Record<"em_analise" | "aprovado" | "negado" | "processado" | "falhou", Estado> = {
  em_analise: { rotulo: "Em análise", tom: "atencao" },
  aprovado: { rotulo: "Aprovado", tom: "sinal" },
  negado: { rotulo: "Negado", tom: "neutro" },
  processado: { rotulo: "Devolvido", tom: "ok" },
  falhou: { rotulo: "Falhou", tom: "critico" },
};
export const estadoReembolso = (s: string | null | undefined) => buscar(REEMBOLSO, s);

const SEVERIDADE: Record<AuditSeveridade, Estado> = {
  info: { rotulo: "Informativo", tom: "neutro" },
  warning: { rotulo: "Atenção", tom: "atencao" },
  critical: { rotulo: "Crítico", tom: "critico" },
};
export const estadoSeveridade = (s: string | null | undefined) => buscar(SEVERIDADE, s);

/** Avisos dos dados de recebimento (PIX) vindos de /api/admin/repasses. */
export function avisosRecebimento(r: { chaveTrocadaRecente?: boolean; cnpjDivergente?: boolean } | null | undefined): Estado[] {
  if (!r) return [{ rotulo: "Sem chave PIX", tom: "critico" }];
  const out: Estado[] = [];
  if (r.cnpjDivergente) out.push({ rotulo: "CNPJ divergente", tom: "critico" });
  if (r.chaveTrocadaRecente) out.push({ rotulo: "Chave trocada < 24 h", tom: "atencao" });
  return out;
}

/** Ordem de urgência para filas: crítico → atenção → dinheiro → sinal → ok → neutro. */
const PESO: Record<Tom, number> = { critico: 0, atencao: 1, dinheiro: 2, sinal: 3, ok: 4, neutro: 5 };
export const pesoTom = (t: Tom) => PESO[t];
export function maisUrgente(tons: Tom[]): Tom {
  return tons.reduce<Tom>((a, t) => (PESO[t] < PESO[a] ? t : a), "neutro");
}
