/**
 * Métricas do app do médico — funções PURAS (sem React, sem store), para
 * poderem ser testadas isoladamente. Todo cálculo de "dia" usa o fuso da
 * clínica (America/Sao_Paulo), nunca o fuso do navegador.
 *
 * Regra do redesign: nada de número inventado. Se não há dado, o chamador
 * mostra estado vazio.
 */
import { partesFusoClinica } from "@/lib/bion-tipos";
import type { Consulta, PacienteRegistro } from "@/lib/bion-tipos";
import { isoDia } from "@/components/bion/paciente/agenda-medico";

/** Status em que a consulta ainda vai acontecer. */
export const STATUS_ATIVOS: Consulta["status"][] = ["confirmada", "em_espera", "pendente_anamnese"];

/**
 * "R$ 150,50" → 150.5 · "R$ 1.234,56" → 1234.56 · "R$ 150" → 150 · 150 → 150.
 * (O painel clássico, já removido, usava `replace(/\D/g, "")` e lia "R$ 150,50" como 15050.)
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

/** Desfechos gravados pelo sistema a partir da presença na sala (EventoConsulta). */
export const ROTULO_FALTA_PACIENTE = "Falta do paciente";
export const ROTULO_FALHA_TECNICA = "Falha técnica";
/** Evento falha_tecnica com motivo "falta_medico" (o paciente entrou e o médico não). */
export const ROTULO_FALTA_MEDICO = "Médico não compareceu";

/** Desfecho do sistema por consulta: falha técnica comum ou falta do médico. */
export type DesfechoSistema = "falha_tecnica" | "falta_medico";

/**
 * Rótulo da consulta na agenda do médico: a falta do paciente (`c.falta`, do
 * bootstrap) e a falha técnica / falta do médico (evento falha_tecnica de
 * GET /api/medico/eventos) têm precedência sobre o status.
 */
export function rotuloStatusMedico(c: Consulta, desfechos?: ReadonlyMap<string, DesfechoSistema>): string {
  const d = desfechos?.get(c.id);
  if (d === "falta_medico") return ROTULO_FALTA_MEDICO;
  if (d === "falha_tecnica") return ROTULO_FALHA_TECNICA;
  if (c.falta) return ROTULO_FALTA_PACIENTE;
  return ROTULO_STATUS[c.status];
}

/** Consultas com evento falha_tecnica → "falta_medico" (motivo) ou "falha_tecnica". */
export function desfechosSistema(eventos: EventoMedico[]): Map<string, DesfechoSistema> {
  const mapa = new Map<string, DesfechoSistema>();
  for (const e of eventos) {
    if (e.tipo === "falha_tecnica") mapa.set(e.consultaId, e.motivo === "falta_medico" ? "falta_medico" : "falha_tecnica");
  }
  return mapa;
}

/* ------------------------------------------------------------------ */
/* Remarcações/cancelamentos do PACIENTE (GET /api/medico/eventos)     */
/* ------------------------------------------------------------------ */

/** Evento de consulta como chega de GET /api/medico/eventos (datas ISO). */
export type EventoMedico = {
  consultaId: string;
  tipo: string; // "cancelada" | "remarcada" | "falha_tecnica" | "falta_paciente"
  por: string; // "paciente" | "medico" | "sistema" | "admin"
  motivo: string;
  em: string;
  dataAnterior: string;
  dataNova: string | null;
};

export type AcoesPacienteHoje = {
  /** Consultas de hoje que o paciente remarcou (ids distintos). */
  remarcadas: number;
  /** Consultas de hoje que o paciente cancelou (ids distintos). */
  canceladas: number;
  /** Consultas distintas com qualquer uma das duas ações. */
  total: number;
};

/**
 * Quantas consultas de HOJE (fuso da clínica, pela data ORIGINAL =
 * `dataAnterior` do evento) o PACIENTE remarcou ou cancelou.
 * Não contam:
 *  - eventos do médico, do sistema ou do admin;
 *  - `motivo = "reagendamento"` (o paciente só escolheu nova data depois de
 *    o médico/sistema cancelar);
 *  - o cancelamento do paciente que é a RESPOSTA a um cancelamento do
 *    médico/sistema (consulta em "aguardando_reagendamento": o evento anterior
 *    da mesma consulta é um cancelamento que não foi do paciente) — é a
 *    escolha do reembolso integral, não uma desistência.
 * Reserva de remarcação ainda não paga não gera evento, então não conta.
 */
export function contarAcoesPacienteHoje(eventos: EventoMedico[], agora: number): AcoesPacienteHoje {
  const hoje = isoDia(agora);
  const porConsulta = new Map<string, EventoMedico[]>();
  for (const e of eventos) {
    const lista = porConsulta.get(e.consultaId) ?? [];
    lista.push(e);
    porConsulta.set(e.consultaId, lista);
  }
  const remarcadas = new Set<string>();
  const canceladas = new Set<string>();
  for (const [consultaId, lista] of porConsulta) {
    const ordenados = [...lista].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
    ordenados.forEach((e, i) => {
      if (e.por !== "paciente" || e.motivo === "reagendamento") return;
      if (e.tipo !== "remarcada" && e.tipo !== "cancelada") return;
      if (isoDia(e.dataAnterior) !== hoje) return;
      const anterior = ordenados[i - 1];
      const respostaAoMedico =
        e.tipo === "cancelada" && anterior && anterior.por !== "paciente" && anterior.tipo !== "remarcada";
      if (respostaAoMedico) return;
      (e.tipo === "remarcada" ? remarcadas : canceladas).add(consultaId);
    });
  }
  return { remarcadas: remarcadas.size, canceladas: canceladas.size, total: new Set([...remarcadas, ...canceladas]).size };
}

/* ------------------------------------------------------------------ */
/* Reserva de remarcação pendente + agenda do dia                      */
/* ------------------------------------------------------------------ */

/** Reserva de remarcação que ainda segura o horário (pendente e antes de expiraEm). */
export function reservaVigente(c: Consulta, agora: number): NonNullable<Consulta["remarcacaoPendente"]> | null {
  const r = c.remarcacaoPendente;
  if (!r || r.status !== "pendente") return null;
  const expira = Date.parse(r.expiraEm);
  return Number.isFinite(expira) && expira > agora ? r : null;
}

const fmtDiaHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const fmtSoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "02/10 às 15:00" (fuso da clínica). */
export function diaHoraClinica(iso: string | number): string {
  const p = fmtDiaHora.formatToParts(new Date(iso));
  const g = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")} às ${g("hour")}:${g("minute")}`;
}
/** "15:00" (fuso da clínica). */
export const horaClinica = (iso: string | number) => fmtSoHora.format(new Date(iso));

/** Texto da reserva pendente exibido na agenda do médico. */
export function textoReservaPendente(r: NonNullable<Consulta["remarcacaoPendente"]>): string {
  return `Novo horário reservado, aguardando pagamento: ${diaHoraClinica(r.novaData)} (até ${horaClinica(r.expiraEm)})`;
}

export type SlotAgenda = {
  hora: string;
  /** livre: horário da grade sem consulta; ocupado: consulta ativa; reservado: novo horário de uma remarcação aguardando pagamento. */
  estado: "livre" | "ocupado" | "reservado" | "encerrada";
  /** Consulta neste horário (qualquer status) — a data ORIGINAL continua valendo. */
  consultas: Consulta[];
  /** Consulta cuja remarcação (ainda não paga) reservou este horário. */
  reservadoPor?: Consulta;
  expiraEm?: string;
};

/**
 * Agenda de um dia (YYYY-MM-DD, fuso da clínica): horários da grade +
 * horários das consultas do dia + horários reservados por remarcações
 * pendentes (vigentes) que caem neste dia. A consulta com reserva fica no
 * horário ORIGINAL (vale até o pagamento); o novo horário aparece como
 * "reservado". Reserva expirada é ignorada (o horário volta a ficar livre).
 */
export function agendaDoDia(consultas: Consulta[], iso: string, grade: string[], agora: number): SlotAgenda[] {
  const slots = new Map<string, SlotAgenda>();
  const slot = (hora: string) => {
    let s = slots.get(hora);
    if (!s) {
      s = { hora, estado: "livre", consultas: [] };
      slots.set(hora, s);
    }
    return s;
  };
  for (const h of grade) if (HORA_RE.test(h)) slot(h);
  for (const c of consultas) {
    if (diaDaConsulta(c) === iso) {
      const s = slot(horaClinica(c.dataISO ?? c.ts));
      s.consultas.push(c);
    }
    const r = reservaVigente(c, agora);
    if (r && isoDia(r.novaData) === iso) {
      const s = slot(horaClinica(r.novaData));
      s.reservadoPor = c;
      s.expiraEm = r.expiraEm;
    }
  }
  for (const s of slots.values()) {
    if (s.consultas.some((c) => STATUS_ATIVOS.includes(c.status))) s.estado = "ocupado";
    else if (s.reservadoPor) s.estado = "reservado";
    else if (s.consultas.length) s.estado = "encerrada";
  }
  return [...slots.values()].sort((a, b) => paraMin(a.hora) - paraMin(b.hora));
}

/**
 * Consultas que "Cancelar agenda do dia" cancela: do dia escolhido, com
 * status ativo (não cancelada, concluída nem aguardando reagendamento) e que
 * AINDA NÃO COMEÇARAM (uma consulta de hoje que já passou não é cancelada
 * retroativamente). Em ordem de horário.
 */
export function consultasCancelaveisDoDia(consultas: Consulta[], iso: string, agora: number): Consulta[] {
  return consultas
    .filter((c) => diaDaConsulta(c) === iso && STATUS_ATIVOS.includes(c.status) && c.ts > agora)
    .sort((a, b) => a.ts - b.ts);
}

/** Reservas vigentes de remarcação (de outras consultas) com novo horário neste dia. */
export function reservasNoDia(consultas: Consulta[], iso: string, agora: number): Consulta[] {
  return consultas.filter((c) => {
    const r = reservaVigente(c, agora);
    return !!r && isoDia(r.novaData) === iso;
  });
}

/* ------------------------------------------------------------------ */
/* Receita líquida (GET /api/medico/receita)                           */
/* ------------------------------------------------------------------ */

export type ReceitaDia = {
  dia: string; // YYYY-MM-DD (São Paulo)
  /** Líquido das consultas: bruto − comissão − taxa do gateway (sem multas). */
  liquidoCentavos: number;
  brutoCentavos: number;
  comissaoCentavos: number;
  taxaCentavos: number;
  /** Parte do médico (50%) nas multas pagas pelo paciente. */
  multasMedicoCentavos: number;
  /** Receita do médico no dia = liquidoCentavos + multasMedicoCentavos. */
  totalCentavos: number;
  consultas: number;
};

export type RespostaReceita = {
  de: string;
  ate: string;
  dias: ReceitaDia[];
  totais: Omit<ReceitaDia, "dia">;
  regra: { comissaoPct: number; multaParteMedicoPct: number };
};

export const fmtCentavos = (centavos: number) => fmtBRL(centavos / 100);

export type PontoReceita = { iso: string; rotulo: string; centavos: number; qtd: number };

/** Pontos do gráfico (um por dia do intervalo, na ordem; dias sem receita = 0). */
export function pontosReceita(r: RespostaReceita | null): PontoReceita[] {
  if (!r) return [];
  return r.dias.map((d) => {
    const [, mes, dia] = d.dia.split("-");
    return { iso: d.dia, rotulo: `${dia}/${mes}`, centavos: d.totalCentavos, qtd: d.consultas };
  });
}
