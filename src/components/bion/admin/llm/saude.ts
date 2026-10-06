/**
 * Regras puras do Monitor LLM do admin (Torre BION): estado de saúde,
 * tendência e falhas a partir do que GET /api/bion-ia/monitor já devolve
 * ({ resumo, eventos }, até 80 turnos, mais recente primeiro).
 * Horas sempre no fuso da clínica. Testes: llm.teste.ts.
 */
import { partesFusoClinica } from "@/lib/bion-tipos";
import type { Tom } from "../rotulos";
import { chaveDia } from "../tempo";

export type EventoLlm = {
  ts: number;
  ok: boolean;
  ms: number;
  fonte: string | null;
  modelo: string | null;
  textoLen: number;
  http: number | null;
  finish: string | null;
  erro: string | null;
};

export type ResumoLlm = {
  turnos: number;
  ok: number;
  falhas: number;
  taxaOk: number;
  msMedia: number;
  msP50: number;
  msP95: number;
  modelos: (string | null)[];
};

export type RespostaMonitor = { resumo?: ResumoLlm | null; eventos?: EventoLlm[] | null };

/**
 * Limites do estado de saúde (decisão de produto, ajustáveis aqui):
 * - Saudável: ≥ 95 % dos turnos com resposta e p95 até 12 s.
 * - Instável: ≥ 80 % de sucesso, ou p95 acima de 12 s.
 * - Crítico: menos de 80 % de sucesso, ou as 3 últimas respostas falharam.
 */
export const LIMITES_SAUDE = { okSaudavel: 95, okInstavel: 80, p95LentoMs: 12_000, falhasSeguidasCriticas: 3 };

export type Saude = { tom: Tom; rotulo: string; texto: string };

/** Quantas falhas seguidas no topo da lista (mais recente primeiro). */
export function falhasSeguidas(eventos: EventoLlm[]): number {
  let n = 0;
  for (const e of [...eventos].sort((a, b) => b.ts - a.ts)) {
    if (e.ok) break;
    n++;
  }
  return n;
}

export function estadoSaude(resumo: ResumoLlm | null | undefined, eventos: EventoLlm[] = []): Saude {
  if (!resumo || !resumo.turnos) return { tom: "neutro", rotulo: "Sem dados", texto: "Ainda sem turnos nesta instância. Use o chat da BION IA e atualize." };
  const seguidas = falhasSeguidas(eventos);
  if (resumo.taxaOk < LIMITES_SAUDE.okInstavel || seguidas >= LIMITES_SAUDE.falhasSeguidasCriticas) {
    return {
      tom: "critico",
      rotulo: "Crítico",
      texto:
        seguidas >= LIMITES_SAUDE.falhasSeguidasCriticas
          ? `As ${seguidas} últimas respostas falharam.`
          : `Só ${resumo.taxaOk}% dos turnos tiveram resposta.`,
    };
  }
  if (resumo.taxaOk < LIMITES_SAUDE.okSaudavel) return { tom: "atencao", rotulo: "Instável", texto: `${resumo.falhas} ${resumo.falhas === 1 ? "falha" : "falhas"} em ${resumo.turnos} turnos.` };
  if (resumo.msP95 > LIMITES_SAUDE.p95LentoMs) return { tom: "atencao", rotulo: "Lento", texto: `p95 de ${segundos(resumo.msP95)}: 5% das respostas demoram mais que isso.` };
  return { tom: "ok", rotulo: "Saudável", texto: `${resumo.taxaOk}% de sucesso e p95 de ${segundos(resumo.msP95)}.` };
}

/** 850 → "850 ms"; 12345 → "12,3 s". */
export function segundos(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
}

/** Percentil igual ao do servidor (lib/server/llm-monitor.ts → resumir). */
function percentil(tempos: number[], p: number): number {
  const t = [...tempos].sort((a, b) => a - b);
  return t.length ? t[Math.min(t.length - 1, Math.floor((p / 100) * (t.length - 1)))] : 0;
}

export type Fatia = { turnos: number; taxaOk: number; msP95: number };
function fatia(eventos: EventoLlm[]): Fatia {
  const n = eventos.length;
  const ok = eventos.filter((e) => e.ok).length;
  return { turnos: n, taxaOk: n ? Math.round((ok / n) * 100) : 0, msP95: percentil(eventos.map((e) => e.ms), 95) };
}

export type Tendencia = { recente: Fatia; anterior: Fatia; deltaTaxa: number; deltaP95: number; direcao: "melhor" | "pior" | "estavel" } | null;

/**
 * Compara a metade mais recente dos turnos com a metade anterior.
 * null com menos de 6 turnos (pouco dado para falar em tendência).
 */
export function tendencia(eventos: EventoLlm[]): Tendencia {
  if (eventos.length < 6) return null;
  const ord = [...eventos].sort((a, b) => b.ts - a.ts);
  const meio = Math.floor(ord.length / 2);
  const recente = fatia(ord.slice(0, meio));
  const anterior = fatia(ord.slice(meio));
  const deltaTaxa = recente.taxaOk - anterior.taxaOk;
  const deltaP95 = recente.msP95 - anterior.msP95;
  // Sucesso pesa mais que latência; 5 pp ou 20 % de p95 já contam como mudança.
  const lim = Math.max(500, anterior.msP95 * 0.2);
  let direcao: "melhor" | "pior" | "estavel" = "estavel";
  if (deltaTaxa <= -5 || (deltaTaxa < 5 && deltaP95 > lim)) direcao = "pior";
  else if (deltaTaxa >= 5 || deltaP95 < -lim) direcao = "melhor";
  return { recente, anterior, deltaTaxa, deltaP95, direcao };
}

export type BaldeHora = { chave: string; hora: number; rotulo: string; turnos: number; falhas: number; msMedio: number };

/**
 * Turnos por hora cheia nas últimas `horas` (fuso da clínica), do mais
 * antigo ao atual. Horas sem turno entram zeradas (o gráfico não "pula").
 */
export function porHora(eventos: EventoLlm[], agora: number, horas = 24): BaldeHora[] {
  const H = 3_600_000;
  const inicioHoraAtual = Math.floor(agora / H) * H; // SP não tem horário de verão nem meia hora: hora cheia UTC = hora cheia SP
  const baldes: BaldeHora[] = [];
  for (let i = horas - 1; i >= 0; i--) {
    const t = inicioHoraAtual - i * H;
    const h = partesFusoClinica(t).hora;
    baldes.push({ chave: `${chaveDia(t)}-${h}`, hora: h, rotulo: `${String(h).padStart(2, "0")}h`, turnos: 0, falhas: 0, msMedio: 0 });
  }
  const somas = new Array<number>(horas).fill(0);
  const primeiro = inicioHoraAtual - (horas - 1) * H;
  for (const e of eventos) {
    if (!Number.isFinite(e.ts) || e.ts < primeiro || e.ts >= inicioHoraAtual + H) continue;
    const i = Math.floor((e.ts - primeiro) / H);
    baldes[i].turnos++;
    if (!e.ok) baldes[i].falhas++;
    somas[i] += e.ms;
  }
  baldes.forEach((b, i) => {
    b.msMedio = b.turnos ? Math.round(somas[i] / b.turnos) : 0;
  });
  return baldes;
}

/** Latência dos últimos `n` turnos, do mais antigo ao mais recente (mini-gráfico). */
export function serieLatencia(eventos: EventoLlm[], n = 40): { ts: number; ms: number; ok: boolean }[] {
  return [...eventos]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, n)
    .reverse()
    .map((e) => ({ ts: e.ts, ms: e.ms, ok: e.ok }));
}

/** Pontos "x,y" de uma polilinha SVG (largura × altura), escala de 0 ao máximo. */
export function pontosPolilinha(valores: number[], largura: number, altura: number): string {
  if (!valores.length) return "";
  const max = Math.max(1, ...valores);
  const passo = valores.length > 1 ? largura / (valores.length - 1) : 0;
  return valores.map((v, i) => `${Math.round(i * passo * 10) / 10},${Math.round((altura - (v / max) * altura) * 10) / 10}`).join(" ");
}

/** Falhas mais recentes primeiro. */
export function falhasRecentes(eventos: EventoLlm[], n = 5): EventoLlm[] {
  return eventos
    .filter((e) => !e.ok)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, n);
}

/** Mesma regra da coluna "Detalhe" do monitor antigo (tamanho da resposta, ou erro → finish → HTTP), em português. */
export function detalheEvento(e: EventoLlm): string {
  return e.ok ? `${e.textoLen} caracteres` : (e.erro ?? e.finish ?? `HTTP ${e.http ?? "—"}`);
}

/** Modelo do turno mais recente que informou modelo (o "em uso agora"). */
export function modeloAtual(eventos: EventoLlm[]): string | null {
  const e = [...eventos].sort((a, b) => b.ts - a.ts).find((x) => x.modelo || x.fonte);
  return e ? (e.modelo ?? e.fonte) : null;
}
