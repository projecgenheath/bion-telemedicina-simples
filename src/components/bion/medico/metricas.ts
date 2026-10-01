/**
 * Métricas do app do médico — funções PURAS (sem React, sem store), para
 * poderem ser testadas isoladamente. Todo cálculo de "dia" usa o fuso da
 * clínica (America/Sao_Paulo), nunca o fuso do navegador.
 *
 * Regra do redesign: nada de número inventado. Se não há dado, o chamador
 * mostra estado vazio.
 */
import { diaFusoClinica, partesFusoClinica } from "@/lib/bion-tipos";
import type { Consulta, PacienteRegistro } from "@/lib/bion-tipos";
import { isoDia } from "@/components/bion/paciente/agenda-medico";

/** Status em que a consulta ainda vai acontecer. */
export const STATUS_ATIVOS: Consulta["status"][] = ["confirmada", "em_espera", "pendente_anamnese"];

/**
 * "R$ 150,50" → 150.5 · "R$ 1.234,56" → 1234.56 · "R$ 150" → 150 · 150 → 150.
 * (O MedicoDashboard antigo usava `replace(/\D/g, "")` e lia "R$ 150,50" como 15050.)
 */
export function parseValorBRL(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Dia (YYYY-MM-DD, fuso da clínica) em que a consulta acontece. */
export const diaDaConsulta = (c: Consulta) => isoDia(c.dataISO ?? c.ts);

/** Consulta pertence ao médico da sessão (por id; nome só em registro legado sem id). */
export function ehDoMedico(c: Consulta, sessao: { id?: string; nome: string }) {
  if (c.medicoId && sessao.id) return c.medicoId === sessao.id;
  return c.medico === sessao.nome;
}

/** Próxima consulta ativa (inclui a que começou há até 30 min). */
export function proximaConsulta(consultas: Consulta[], agora: number): Consulta | undefined {
  return consultas
    .filter((c) => STATUS_ATIVOS.includes(c.status) && c.ts >= agora - 30 * 60_000)
    .sort((a, b) => a.ts - b.ts)[0];
}

/** Sala de teleatendimento aberta: de 30 min antes até 2 h depois do horário. */
export const salaAberta = (ts: number, agora: number) => agora >= ts - 30 * 60_000 && agora <= ts + 2 * 3_600_000;

export type ResumoHoje = {
  agendadas: Consulta[];
  restantes: Consulta[];
  remarcadas: Consulta[];
  canceladas: Consulta[];
};

/**
 * Consultas COM DATA DE HOJE (fuso da clínica).
 *  - agendadas: não canceladas;
 *  - restantes: ainda por acontecer (status ativo e horário no futuro);
 *  - remarcadas: marcadas como remarcadas e não canceladas;
 *  - canceladas: status cancelada.
 * Limitação conhecida: a remarcação muda a data da consulta, então uma
 * consulta de hoje movida para outro dia não aparece aqui (falta a data
 * original no servidor — Fase 2 do plano).
 */
export function resumoHoje(consultas: Consulta[], agora: number): ResumoHoje {
  const hoje = isoDia(agora);
  const doDia = consultas.filter((c) => diaDaConsulta(c) === hoje).sort((a, b) => a.ts - b.ts);
  const agendadas = doDia.filter((c) => c.status !== "cancelada");
  return {
    agendadas,
    restantes: agendadas.filter((c) => STATUS_ATIVOS.includes(c.status) && c.ts > agora),
    remarcadas: agendadas.filter((c) => c.remarcada),
    canceladas: doDia.filter((c) => c.status === "cancelada"),
  };
}

export type PontoFaturamento = { iso: string; rotulo: string; valor: number; qtd: number };

/**
 * Faturamento BRUTO dos últimos `dias` dias (incluindo hoje): soma do valor
 * das consultas PAGAS e não canceladas, pela data da consulta.
 * (A data real do pagamento e estornos não chegam ao médico — Fase 4.)
 */
export function serieFaturamento(consultas: Consulta[], dias = 30): {
  pontos: PontoFaturamento[];
  total: number;
  qtd: number;
} {
  const pontos: PontoFaturamento[] = [];
  const indice = new Map<string, PontoFaturamento>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = diaFusoClinica(-i);
    const p = { iso: d.iso, rotulo: `${String(d.dia).padStart(2, "0")}/${String(d.mes + 1).padStart(2, "0")}`, valor: 0, qtd: 0 };
    pontos.push(p);
    indice.set(d.iso, p);
  }
  let total = 0;
  let qtd = 0;
  for (const c of consultas) {
    if (!c.pago || c.status === "cancelada") continue;
    const p = indice.get(diaDaConsulta(c));
    if (!p) continue;
    const v = parseValorBRL(c.valor);
    p.valor += v;
    p.qtd += 1;
    total += v;
    qtd += 1;
  }
  return { pontos, total: Math.round(total * 100) / 100, qtd };
}

/** Consultas concluídas nos últimos 30 dias (base do "atendimentos no mês" do perfil). */
export function concluidas30d(consultas: Consulta[], agora: number): number {
  const inicio = agora - 30 * 86_400_000;
  return consultas.filter((c) => c.status === "concluida" && c.ts >= inicio && c.ts <= agora).length;
}

export type PacienteDoMedico = {
  /** pacienteId quando existe; "nome:<nome>" só para consulta legada sem id. */
  chave: string;
  pacienteId?: string;
  nome: string;
  registro?: PacienteRegistro;
  consultas: Consulta[];
  proxima?: Consulta;
  ultima?: Consulta;
};

export const chavePaciente = (c: { pacienteId?: string; paciente: string }) => c.pacienteId ?? `nome:${c.paciente}`;

/**
 * Pacientes agendados ou já atendidos, agrupados por pacienteId (nunca por
 * nome — homônimos). Ordem: primeiro quem tem próxima consulta (a mais
 * próxima no topo); depois os já atendidos (o mais recente no topo).
 */
export function pacientesOrdenados(
  consultas: Consulta[],
  pacientes: PacienteRegistro[],
  agora: number,
): PacienteDoMedico[] {
  const grupos = new Map<string, Consulta[]>();
  for (const c of consultas) {
    const k = chavePaciente(c);
    const lista = grupos.get(k) ?? [];
    lista.push(c);
    grupos.set(k, lista);
  }
  const itens: PacienteDoMedico[] = [];
  for (const [chave, lista] of grupos) {
    const ordenadas = [...lista].sort((a, b) => b.ts - a.ts);
    const pacienteId = chave.startsWith("nome:") ? undefined : chave;
    const futuras = lista
      .filter((c) => STATUS_ATIVOS.includes(c.status) && c.ts >= agora - 30 * 60_000)
      .sort((a, b) => a.ts - b.ts);
    const passadas = ordenadas.filter((c) => c.ts < agora);
    itens.push({
      chave,
      pacienteId,
      nome: ordenadas[0]?.paciente ?? "Paciente",
      registro: pacienteId ? pacientes.find((p) => p.id === pacienteId) : undefined,
      consultas: ordenadas,
      proxima: futuras[0],
      ultima: passadas[0] ?? ordenadas[0],
    });
  }
  return itens.sort((a, b) => {
    if (a.proxima && b.proxima) return a.proxima.ts - b.proxima.ts;
    if (a.proxima) return -1;
    if (b.proxima) return 1;
    return (b.ultima?.ts ?? 0) - (a.ultima?.ts ?? 0);
  });
}

/* ------------------------------------------------------------------ */
/* Grade de horários (gerada no cliente, gravada em horariosDisponiveis) */
/* ------------------------------------------------------------------ */

export const INTERVALO_MINIMO = 10;
export const DURACAO_MINIMA = 10;
/** Limite do servidor para horariosDisponiveis (PATCH /api/medicos/[id]). */
export const MAX_HORARIOS = 100;

export type ParametrosGrade = {
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM" — a última consulta precisa TERMINAR até aqui
  duracao: number; // minutos
  intervalo: number; // minutos (>= INTERVALO_MINIMO)
  pausaInicio?: string; // "HH:MM" (opcional, pausa diária)
  pausaFim?: string;
};

export const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const paraMin = (h: string) => {
  const [hh, mm] = h.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
};
export const paraHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Valida os parâmetros; devolve mensagem de erro ou null. */
export function validarGrade(p: ParametrosGrade): string | null {
  if (!HORA_RE.test(p.inicio) || !HORA_RE.test(p.fim)) return "Informe início e fim no formato HH:MM.";
  if (paraMin(p.fim) <= paraMin(p.inicio)) return "O fim do expediente precisa ser depois do início.";
  if (!Number.isInteger(p.duracao) || p.duracao < DURACAO_MINIMA || p.duracao > 240) {
    return `A duração da consulta deve ficar entre ${DURACAO_MINIMA} e 240 minutos.`;
  }
  if (!Number.isInteger(p.intervalo) || p.intervalo < INTERVALO_MINIMO || p.intervalo > 240) {
    return `O intervalo entre consultas deve ser de no mínimo ${INTERVALO_MINIMO} minutos.`;
  }
  const temPausa = Boolean(p.pausaInicio || p.pausaFim);
  if (temPausa) {
    if (!p.pausaInicio || !p.pausaFim || !HORA_RE.test(p.pausaInicio) || !HORA_RE.test(p.pausaFim)) {
      return "Informe início e fim da pausa (HH:MM) ou deixe os dois vazios.";
    }
    if (paraMin(p.pausaFim) <= paraMin(p.pausaInicio)) return "O fim da pausa precisa ser depois do início.";
  }
  return null;
}

/**
 * Gera os horários de início: a partir de `inicio`, passo = duração +
 * intervalo; a consulta precisa terminar até `fim` e não pode invadir a
 * pausa (se invadir, o próximo horário começa no fim da pausa).
 */
export function gerarGrade(p: ParametrosGrade): string[] {
  if (validarGrade(p)) return [];
  const fim = paraMin(p.fim);
  const pi = p.pausaInicio ? paraMin(p.pausaInicio) : null;
  const pf = p.pausaFim ? paraMin(p.pausaFim) : null;
  const horarios: string[] = [];
  let t = paraMin(p.inicio);
  while (t + p.duracao <= fim && horarios.length < MAX_HORARIOS) {
    if (pi !== null && pf !== null && t < pf && t + p.duracao > pi) {
      t = pf;
      continue;
    }
    horarios.push(paraHora(t));
    t += p.duracao + p.intervalo;
  }
  return horarios;
}

/** Sugestão inicial a partir da grade gravada (quando não há parâmetros salvos). */
export function sugerirParametros(horarios: string[]): ParametrosGrade {
  const ordenados = [...horarios].filter((h) => HORA_RE.test(h)).sort();
  if (ordenados.length === 0) return { inicio: "08:00", fim: "18:00", duracao: 30, intervalo: 10 };
  const difs = ordenados.slice(1).map((h, i) => paraMin(h) - paraMin(ordenados[i]));
  const passo = difs.length ? Math.min(...difs) : 40;
  const intervalo = INTERVALO_MINIMO;
  const duracao = Math.max(DURACAO_MINIMA, passo - intervalo);
  const ultimo = paraMin(ordenados[ordenados.length - 1]);
  // Maior "buraco" (> 1,5 passo) vira a pausa diária: do fim da consulta
  // anterior até o próximo horário — reproduz a grade gravada.
  let pausa: Pick<ParametrosGrade, "pausaInicio" | "pausaFim"> = {};
  let maior = passo * 1.5;
  difs.forEach((d, i) => {
    if (d > maior) {
      maior = d;
      pausa = { pausaInicio: paraHora(paraMin(ordenados[i]) + duracao), pausaFim: ordenados[i + 1] };
    }
  });
  return {
    inicio: ordenados[0],
    fim: paraHora(Math.min(23 * 60 + 59, ultimo + duracao)),
    duracao,
    intervalo,
    ...pausa,
  };
}

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

export function saudacao(agora: number) {
  const h = partesFusoClinica(agora).hora;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Iniciais do primeiro e do último nome (ignora "Dr(a)." e partículas). */
export function iniciais(nome: string) {
  const partes = nome
    .replace(/^(dr|dra)\.?\s+/i, "")
    .split(/\s+/)
    .filter((p) => p && !/^(da|de|do|das|dos|e)$/i.test(p));
  const sel = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes;
  return sel.map((p) => p[0]?.toUpperCase()).join("") || "?";
}

/** Nome do paciente fora do contexto clínico (prévia pública): "Paciente M." */
export const nomeAnonimo = (nome: string) => {
  const inicial = nome.trim()[0]?.toUpperCase();
  return inicial ? `Paciente ${inicial}.` : "Paciente";
};

export const ROTULO_STATUS: Record<Consulta["status"], string> = {
  confirmada: "Confirmada",
  em_espera: "Aguardando pagamento",
  pendente_anamnese: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluída",
  aguardando_reagendamento: "Aguardando reagendamento",
};
