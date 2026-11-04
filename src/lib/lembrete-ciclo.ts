/**
 * Ciclo diário e disparo do lembrete — regras puras (cliente, servidor e
 * testes; sem dependência de banco nem de "server-only").
 *
 * F7 (auditoria de errinhos): o `feito` do Lembrete era um booleano eterno —
 * marcar o remédio das 08:00 como tomado na segunda deixava o lembrete
 * riscado para sempre, e o checklist diário morria no primeiro uso.
 * Desenho: o servidor grava `feitoEm` (quando foi marcado) e o feito só
 * VALE para o dia da clínica (America/Sao_Paulo) em que foi marcado; no dia
 * seguinte o lembrete volta a aparecer pendente, sem cron de reset e sem
 * apagar o histórico. `feitoEm` chega pela migração 20261104a (NÃO
 * APLICADA): enquanto a coluna não existe, os chamadores recebem
 * `undefined` e caem no comportamento antigo (feito cru) — nunca quebram.
 *
 * F6: as regras de "devido agora" (dia + minuto no fuso da clínica) que o
 * job de avisos (src/lib/server/lembretes-aviso.ts) usa a cada minuto.
 */
import { instanteFusoClinica, partesFusoClinica } from "@/lib/bion-tipos";

/** Chave do dia de calendário no fuso da clínica: "2026-11-04". */
export function chaveDiaClinica(d: Date | string | number): string {
  const p = partesFusoClinica(d);
  if (Number.isNaN(p.ano)) return "";
  return `${p.ano}-${String(p.mes + 1).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/**
 * O "feito" está vigente AGORA? Só se foi marcado no dia de hoje (fuso da
 * clínica). feitoEm ausente/inválido com feito=true = registro legado
 * (anterior à migração): NÃO está vigente — volta a pendente, que é o
 * comportamento que o paciente espera de um checklist diário.
 */
export function feitoVigente(
  feito: boolean,
  feitoEm: Date | string | number | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!feito) return false;
  if (feitoEm === null || feitoEm === undefined || feitoEm === "") return false;
  const diaFeito = chaveDiaClinica(feitoEm);
  if (!diaFeito) return false;
  return diaFeito === chaveDiaClinica(agora);
}

/** Forma estrutural mínima de um lembrete para resolver o feito. */
export type LembreteFeito = { feito: boolean; feitoEm?: Date | string | number | null };

/** `feito` JÁ resolvido para exibição (vigente hoje ou pendente). */
export function resolverFeito(l: LembreteFeito, agora: Date = new Date()): boolean {
  return feitoVigente(l.feito, l.feitoEm, agora);
}

/* ------------------------------------------------------------------ */
/* Disparo (F6): quando o lembrete é devido                            */
/* ------------------------------------------------------------------ */

/** Forma estrutural mínima de um lembrete para o disparo. */
export type LembreteDisparo = {
  id: string;
  usuarioId: string;
  titulo: string;
  horario: string;
  tipo: string;
  frequencia: string;
  medicamentoEmUsoId?: string | null;
  feitoEm?: Date | string | null;
  ultimoDisparoEm?: Date | string | null;
};

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutos desde 00:00 de um "HH:MM" válido; null se inválido. */
export function minutosDoHorario(horario: string): number | null {
  const m = HORA_RE.exec(horario ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Instante (Date) da ocorrência de HOJE (dia da clínica) no horário dado. */
export function instanteOcorrencia(agora: Date, horario: string): Date | null {
  const min = minutosDoHorario(horario);
  if (min === null) return null;
  const p = partesFusoClinica(agora);
  return new Date(instanteFusoClinica(p.ano, p.mes, p.dia, Math.floor(min / 60), min % 60));
}

/** Dia da semana (0 = domingo) do instante, no fuso da clínica. */
export function diaSemanaClinica(agora: Date): number {
  const p = partesFusoClinica(agora);
  return new Date(Date.UTC(p.ano, p.mes, p.dia)).getUTCDay();
}

/** O dia de hoje (clínica) combina com a frequência? Semanal exige o dia. */
export function diaCombina(frequencia: string, agora: Date, diaSemanaSemanal?: number | null): boolean {
  const sem = diaSemanaClinica(agora);
  if (frequencia === "Todos os dias") return true;
  if (frequencia === "Dias úteis") return sem >= 1 && sem <= 5;
  if (frequencia === "Semanal") return diaSemanaSemanal != null && diaSemanaSemanal === sem;
  if (/^a cada \d{1,2} horas?$/i.test(frequencia ?? "")) return true; // legado: todo dia, nos horários derivados
  return false;
}

/** O minuto atual (clínica) é um minuto de disparo deste lembrete? */
export function minutoCombina(l: Pick<LembreteDisparo, "horario" | "frequencia">, agora: Date): boolean {
  const alvo = minutosDoHorario(l.horario);
  if (alvo === null) return false;
  const p = partesFusoClinica(agora);
  const atual = p.hora * 60 + p.minuto;
  const intervalo = /^a cada (\d{1,2}) horas?$/i.exec(l.frequencia ?? "");
  if (intervalo) {
    // Legado (pré-F2): UM lembrete com a âncora — dispara na âncora e a
    // cada N horas a partir dela, dentro do mesmo dia.
    const passo = Number(intervalo[1]) * 60;
    return atual >= alvo && (atual - alvo) % passo === 0;
  }
  return atual === alvo;
}

/**
 * Devido AGORA? Dia combina + minuto combina + ainda não disparou para
 * esta ocorrência + o paciente ainda não marcou feito hoje.
 * `diaSemanaSemanal`: dia da semana da posologia do medicamento ligado
 * (frequência "Semanal" genérica, sem medicamento, não tem dia — não
 * dispara; limitação documentada no relatório da frente).
 */
export function lembreteDevido(l: LembreteDisparo, agora: Date, diaSemanaSemanal?: number | null): boolean {
  if (!diaCombina(l.frequencia, agora, diaSemanaSemanal)) return false;
  if (!minutoCombina(l, agora)) return false;
  const ocorrencia = instanteOcorrencia(agora, l.horario);
  if (!ocorrencia) return false;
  if (l.ultimoDisparoEm) {
    const ultimo = new Date(l.ultimoDisparoEm).getTime();
    if (!Number.isNaN(ultimo) && ultimo >= ocorrencia.getTime()) return false;
  }
  if (l.feitoEm && chaveDiaClinica(l.feitoEm) === chaveDiaClinica(agora)) return false;
  return true;
}
