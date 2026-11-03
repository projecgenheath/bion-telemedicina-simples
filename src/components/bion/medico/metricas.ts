/**
 * Métricas do app do médico — funções PURAS (sem React, sem store), para
 * poderem ser testadas isoladamente. Todo cálculo de "dia" usa o fuso da
 * clínica (America/Sao_Paulo), nunca o fuso do navegador.
 *
 * Regra do redesign: nada de número inventado. Se não há dado, o chamador
 * mostra estado vazio.
 */
import { instanteFusoClinica, partesFusoClinica } from "@/lib/bion-tipos";
import type { Avaliacao, Consulta, Medico, PacienteRegistro } from "@/lib/bion-tipos";
import { isoDia } from "@/components/bion/paciente/agenda-medico";
import { salaAbertaEm } from "@/lib/janela-sala";

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

/** Sala de teleatendimento aberta: de 30 min antes até 2 h depois do horário (janela única em lib/janela-sala.ts). */
export const salaAberta = (ts: number, agora: number) => salaAbertaEm(ts, agora);

/**
 * Vigiar a presença do paciente na sala (item 22)? Só dentro da janela da
 * sala: fora dela o paciente nem consegue entrar (a sala recusa), então
 * presença fresca (PresencaSala) não pode existir e o polling nem começa.
 */
export const deveVigiarPresenca = (ts: number, agora: number) => salaAbertaEm(ts, agora);

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

/** Dias da janela de RESPOSTA do paciente — espelha `janelaDias` do POST /api/mensagens. */
export const JANELA_RESPOSTA_DIAS = 30;

export type JanelaResposta = {
  /** Consulta-base da janela: a NÃO cancelada mais recente do par (a mesma que o servidor escolhe). */
  base: Consulta;
  /** Instante em que a janela fecha: base.ts + JANELA_RESPOSTA_DIAS. */
  limite: number;
  /** Dias restantes, arredondados para cima (0 no dia do fechamento). */
  diasRestantes: number;
  /** true quando `agora` passou do limite — o servidor recusa a resposta do paciente (403). */
  encerrada: boolean;
};

/**
 * Janela de resposta do paciente nesta conversa, com a MESMA regra do
 * POST /api/mensagens: o paciente só responde até 30 dias após a consulta
 * NÃO cancelada mais recente com este médico (o servidor busca a consulta
 * por dataInicio desc; no cliente, `ts` é exatamente esse dataInicio). O
 * médico não tem janela — pode enviar sempre. Sem consulta não cancelada,
 * devolve null (a conversa nem abre para envio). Serve para o médico não
 * ler o silêncio do paciente como desinteresse quando é a plataforma
 * bloqueando a resposta.
 */
export function janelaRespostaPaciente(consultas: Consulta[], agora: number): JanelaResposta | null {
  const base = consultas.filter((c) => c.status !== "cancelada").sort((a, b) => b.ts - a.ts)[0];
  if (!base) return null;
  const limite = base.ts + JANELA_RESPOSTA_DIAS * 86_400_000;
  return {
    base,
    limite,
    diasRestantes: Math.max(0, Math.ceil((limite - agora) / 86_400_000)),
    encerrada: agora > limite,
  };
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

/**
 * Janela sem teleconsulta: 23:00–00:00 (São Paulo; o repasse diário fecha às
 * 23:30). Mesma regra do servidor (src/lib/server/bloqueio-agenda.ts:
 * slotVedado/DURACAO_CONSULTA_MIN), repetida aqui porque este arquivo roda no
 * navegador. O servidor não conhece a duração escolhida neste aparelho e
 * conta cada consulta com DURACAO_CONSULTA_SERVIDOR min, então a grade usa a
 * MAIOR das duas: assim nada que o servidor recusaria é oferecido.
 */
export const VEDADO_INICIO_MIN = 23 * 60;
export const VEDADO_FIM_MIN = 24 * 60;
export const DURACAO_CONSULTA_SERVIDOR = 30;
export const AVISO_HORARIO_VEDADO = "Não há atendimento entre 23:00 e 00:00 — a última consulta precisa terminar até 23:00.";

/** A consulta que começa em `inicioMin` (minutos do dia) e dura `duracaoMin` encosta em 23:00–00:00? */
export function slotNaJanelaVedada(inicioMin: number, duracaoMin: number): boolean {
  const b = inicioMin + Math.max(1, duracaoMin, DURACAO_CONSULTA_SERVIDOR);
  for (let k = 0; VEDADO_INICIO_MIN + k * 1440 < b; k++) {
    if (inicioMin < VEDADO_FIM_MIN + k * 1440 && b > VEDADO_INICIO_MIN + k * 1440) return true;
  }
  return false;
}

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
 * pausa (se invadir, o próximo horário começa no fim da pausa) nem a janela
 * 23:00–00:00 (`slotNaJanelaVedada`: horário não oferecido).
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
    if (!slotNaJanelaVedada(t, p.duracao)) horarios.push(paraHora(t));
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
  falta_paciente: "Falta do paciente",
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
  /**
   * livre: horário da grade sem consulta; ocupado: consulta ativa; reservado:
   * novo horário de uma remarcação aguardando pagamento; bloqueado: horário
   * que estaria livre num dia que o médico bloqueou (não aceita agendamento).
   */
  estado: "livre" | "ocupado" | "reservado" | "encerrada" | "bloqueado";
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
 * Dia bloqueado pelo médico (`bloqueado`): o que estaria livre vira "bloqueado".
 */
export function agendaDoDia(
  consultas: Consulta[],
  iso: string,
  grade: string[],
  agora: number,
  bloqueado = false,
): SlotAgenda[] {
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
    else if (bloqueado) s.estado = "bloqueado";
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

/**
 * Remove os dias bloqueados pelo médico de uma lista de dias ("AAAA-MM-DD"
 * no fuso da clínica) — ex.: a prévia da agenda que o paciente vê.
 */
export function semDiasBloqueados<T extends { iso: string }>(dias: T[], bloqueados: ReadonlySet<string>): T[] {
  return bloqueados.size ? dias.filter((d) => !bloqueados.has(d.iso)) : dias;
}

/* ------------------------------------------------------------------ */
/* Desfecho marcado pelo MÉDICO (falta do paciente / falha técnica)    */
/* Regras aprovadas pelo Alisson (06/10/2026). A MESMA função decide    */
/* no servidor (POST /api/medico/consultas/[id]/desfecho e a verificação */
/* automática em presenca-consulta.ts) e mostra a contagem na sala.     */
/* ------------------------------------------------------------------ */

/** Espera mínima, contada do horário marcado, antes de marcar "paciente não compareceu". */
export const ESPERA_FALTA_MIN = 15;
/** Sinal parado por mais que isto: a pessoa saiu da sala (e a entrada recomeça na volta). */
export const SINAL_PARADO_MS = 30_000;
/** Prazo para marcar pela agenda: fechamento do dia da consulta, 23:30 em São Paulo. */
export const PRAZO_DESFECHO_HORA = 23;
export const PRAZO_DESFECHO_MINUTO = 30;

/** Presença de uma pessoa na sala (PresencaSala). Datas em ms; null = nunca entrou. */
export type PresencaRegra = { entrouEm: number | null; ultimoPing: number | null } | null;

/** 23:30 (São Paulo) do dia da consulta, em ms. */
export function prazoDesfecho(dataInicio: number | string | Date): number {
  const p = partesFusoClinica(dataInicio);
  return instanteFusoClinica(p.ano, p.mes, p.dia, PRAZO_DESFECHO_HORA, PRAZO_DESFECHO_MINUTO);
}

/** O paciente esteve na sala DEPOIS do horário marcado (presença antes do horário não conta). */
export function pacienteEsteveNaSala(dataInicio: number, paciente: PresencaRegra): boolean {
  return paciente?.ultimoPing != null && paciente.ultimoPing >= dataInicio;
}

/**
 * O médico ficou na sala até o horário + ESPERA_FALTA_MIN: a sessão dele
 * (entrouEm → ultimoPing) alcançou esse limite. Quem entrou atrasado conta
 * do mesmo jeito: precisa estar na sala no horário + 15.
 */
export function medicoEsperouAteOLimite(dataInicio: number, medico: PresencaRegra): boolean {
  return medico?.ultimoPing != null && medico.ultimoPing >= dataInicio + ESPERA_FALTA_MIN * 60_000;
}

/** A pessoa está na sala agora (sinal com menos de SINAL_PARADO_MS). */
export function estaNaSala(p: PresencaRegra, agora: number): boolean {
  return p?.ultimoPing != null && agora - p.ultimoPing <= SINAL_PARADO_MS;
}

export type MotivoSemFalta = "prazo" | "antes_do_horario" | "paciente_esteve" | "medico_nao_esteve" | "aguardar";

export type ResultadoFalta =
  | { pode: true; liberaEm: number; faltaMs: 0; esperouMs: number }
  | { pode: false; motivo: MotivoSemFalta; liberaEm: number | null; faltaMs: number; mensagem: string };

const fmtHoraSP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Regra 1 (+ 5): o médico pode marcar "paciente não compareceu" quando
 *  - ainda está dentro do prazo (23:30 do dia da consulta);
 *  - o paciente NÃO teve presença na sala depois do horário marcado;
 *  - o médico esteve na sala numa sessão que alcançou o horário + 15 min
 *    (último sinal ≥ horário + 15). Quem entrou atrasado espera do mesmo
 *    jeito até o horário + 15; quem saiu antes disso precisa voltar à sala.
 * `esperouMs`: quanto tempo o médico ficou na sala desde a entrada (ou desde
 * o horário, se entrou antes), pela coluna PresencaSala.entrouEm.
 * Devolve também quando libera (`liberaEm`) e quanto falta (`faltaMs`), para
 * a contagem do botão na sala.
 */
export function podeMarcarFalta(p: {
  dataInicio: number;
  agora: number;
  medico: PresencaRegra;
  paciente: PresencaRegra;
}): ResultadoFalta {
  const limite = p.dataInicio + ESPERA_FALTA_MIN * 60_000;
  const prazo = prazoDesfecho(p.dataInicio);
  const nao = (motivo: MotivoSemFalta, mensagem: string, liberaEm: number | null = null): ResultadoFalta => ({
    pode: false,
    motivo,
    liberaEm,
    faltaMs: liberaEm === null ? 0 : Math.max(0, liberaEm - p.agora),
    mensagem,
  });
  if (p.agora > prazo) {
    return nao("prazo", `O prazo para marcar terminou às ${fmtHoraSP.format(prazo)} do dia da consulta.`);
  }
  if (p.agora < p.dataInicio) {
    return nao("antes_do_horario", "A consulta ainda não começou.", limite);
  }
  if (pacienteEsteveNaSala(p.dataInicio, p.paciente)) {
    return nao("paciente_esteve", "O paciente entrou na sala depois do horário: não dá para marcar falta.");
  }
  const m = p.medico;
  if (m?.ultimoPing != null && medicoEsperouAteOLimite(p.dataInicio, m)) {
    const desde = Math.max(m.entrouEm ?? m.ultimoPing, p.dataInicio);
    return { pode: true, liberaEm: limite, faltaMs: 0, esperouMs: Math.max(0, m.ultimoPing - desde) };
  }
  if (estaNaSala(m, p.agora)) {
    return nao("aguardar", `Espere na sala até ${fmtHoraSP.format(limite)} (15 min depois do horário).`, limite);
  }
  return nao(
    "medico_nao_esteve",
    p.agora < limite
      ? `Entre na sala e espere até ${fmtHoraSP.format(limite)} para marcar a falta.`
      : "Você não esperou na sala até 15 min depois do horário. Entre na sala para marcar a falta.",
    p.agora < limite ? limite : null,
  );
}

/**
 * A agenda mostra os botões "Paciente não compareceu" e "Falha técnica" na
 * consulta que já começou, ainda ativa, sem desfecho e dentro do prazo
 * (o servidor confere tudo de novo, inclusive a presença).
 */
export function podeMarcarDesfechoNaAgenda(
  c: Consulta,
  agora: number,
  desfechos?: ReadonlyMap<string, DesfechoSistema>,
): boolean {
  const inicio = c.dataISO ? Date.parse(c.dataISO) : c.ts;
  if (!STATUS_ATIVOS.includes(c.status) || c.falta || desfechos?.has(c.id)) return false;
  return agora >= inicio && agora <= prazoDesfecho(inicio);
}

/* ------------------------------------------------------------------ */
/* Painel de gestão: indicadores de um período (7/30/90 dias)          */
/* ------------------------------------------------------------------ */

export type JanelaDias = { deISO: string; ateISO: string };

/** "AAAA-MM-DD" + delta dias (aritmética no calendário, fuso da clínica). */
export function somarDiasISO(iso: string, delta: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return isoDia(instanteFusoClinica(a, m - 1, d, 12) + delta * 86_400_000);
}

/** Dia da semana (0=Dom … 6=Sáb) de um "AAAA-MM-DD". */
export function diaSemanaISO(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * Janela atual de `dias` dias TERMINANDO HOJE (fuso da clínica) e a janela
 * anterior de mesmo tamanho, para comparação de período no painel de gestão.
 */
export function janelasComparacao(agora: number, dias: number): { atual: JanelaDias; anterior: JanelaDias } {
  const ateISO = isoDia(agora);
  const deISO = somarDiasISO(ateISO, -(dias - 1));
  return {
    atual: { deISO, ateISO },
    anterior: { deISO: somarDiasISO(deISO, -dias), ateISO: somarDiasISO(deISO, -1) },
  };
}

/** Falta do paciente: status próprio ou o selo `falta` do bootstrap (evento falta_paciente). */
export const ehFaltaPaciente = (c: Consulta) => c.falta === true || c.status === "falta_paciente";

/**
 * A consulta OCUPA um horário da grade: vai acontecer (status ativo), já
 * aconteceu (concluída) ou o paciente faltou (o horário foi consumido).
 * Cancelada e aguardando reagendamento liberaram o horário — não ocupam.
 */
export const ocupaSlot = (c: Consulta) =>
  c.status === "concluida" || STATUS_ATIVOS.includes(c.status) || ehFaltaPaciente(c);

export type MetricasPeriodo = {
  /** Horários ofertados: dias de atendimento da janela × horários da grade. */
  ofertados: number;
  /** Consultas do médico que ocuparam horário na janela. */
  ocupados: number;
  /** ocupados / ofertados (null sem oferta: grade vazia). */
  ocupacao: number | null;
  /** Consultas concluídas na janela. */
  atendimentos: number;
  /** Faltas do paciente na janela. */
  faltas: number;
  /** faltas / (concluídas + faltas); null sem nenhum dos dois. */
  taxaFalta: number | null;
  /** Canceladas na janela (qualquer autor). */
  canceladas: number;
  /** Consultas pagas e não canceladas com valor conhecido na janela. */
  consultasPagas: number;
  /** Soma dos valores dessas consultas (R$, bruto). */
  receitaConsultas: number;
  /** receitaConsultas / consultasPagas (null sem consulta paga). */
  ticketMedio: number | null;
};

/**
 * Indicadores de prática de UMA janela [deISO, ateISO] (dias no fuso da
 * clínica, inclusive nas pontas), calculados das consultas que o cliente já
 * carrega e da grade do próprio médico. `consultas` deve vir já filtrada
 * para o médico (ehDoMedico). Dias de atendimento vazios = todos os dias.
 */
export function metricasPeriodo(
  consultas: Consulta[],
  /** Grade por dia da semana: slots de cada dia (índice 0=Dom … 6=Sáb, já
   *  resolvidos pela regra de lib/grade-semana) + dias de atendimento. */
  grade: { slotsPorDiaSemana: number[]; diasAtendimento: number[] },
  janela: JanelaDias,
): MetricasPeriodo {
  let ofertados = 0;
  for (let iso = janela.deISO; iso <= janela.ateISO; iso = somarDiasISO(iso, 1)) {
    const semana = diaSemanaISO(iso);
    if (grade.diasAtendimento.length === 0 || grade.diasAtendimento.includes(semana)) {
      ofertados += grade.slotsPorDiaSemana[semana] ?? 0;
    }
  }
  const naJanela = consultas.filter((c) => {
    const d = diaDaConsulta(c);
    return d >= janela.deISO && d <= janela.ateISO;
  });
  const ocupados = naJanela.filter(ocupaSlot).length;
  const atendimentos = naJanela.filter((c) => c.status === "concluida").length;
  const faltas = naJanela.filter(ehFaltaPaciente).length;
  const baseFalta = atendimentos + faltas;
  const pagas = naJanela.filter((c) => c.pago && c.status !== "cancelada" && parseValorBRL(c.valor) > 0);
  const receitaConsultas = pagas.reduce((s, c) => s + parseValorBRL(c.valor), 0);
  return {
    ofertados,
    ocupados,
    ocupacao: ofertados > 0 ? ocupados / ofertados : null,
    atendimentos,
    faltas,
    taxaFalta: baseFalta > 0 ? faltas / baseFalta : null,
    canceladas: naJanela.filter((c) => c.status === "cancelada").length,
    consultasPagas: pagas.length,
    receitaConsultas,
    ticketMedio: pagas.length > 0 ? receitaConsultas / pagas.length : null,
  };
}

/**
 * Receita prevista: consultas FUTURAS já pagas e ainda ativas (bruto, R$).
 * É dinheiro contratado que ainda não entrou na receita realizada.
 */
export function receitaPrevista(consultas: Consulta[], agora: number): { total: number; qtd: number } {
  const futuras = consultas.filter(
    (c) => c.pago && STATUS_ATIVOS.includes(c.status) && c.ts > agora && parseValorBRL(c.valor) > 0,
  );
  return { total: futuras.reduce((s, c) => s + parseValorBRL(c.valor), 0), qtd: futuras.length };
}

/** Variação percentual entre períodos; null sem base (anterior = 0 e atual > 0). */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/* ------------------------------------------------------------------ */
/* Avaliações do médico: resumo com sub-notas e distribuição           */
/* ------------------------------------------------------------------ */

export type ResumoAvaliacoes = {
  total: number;
  /** Média da nota geral (null sem avaliações). */
  media: number | null;
  /** Quantidade por estrela: índice 0 = 1 estrela … índice 4 = 5 estrelas. */
  distribuicao: [number, number, number, number, number];
  /** Médias das sub-notas — cada uma só sobre quem avaliou aquela dimensão. */
  pontualidade: number | null;
  atencao: number | null;
  clareza: number | null;
  comComentario: number;
};

const mediaDe = (valores: number[]) =>
  valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;

const subnotas = (avaliacoes: Avaliacao[], campo: "pontualidade" | "atencao" | "clareza") =>
  avaliacoes
    .map((a) => a[campo])
    .filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);

/** Resumo das avaliações RECEBIDAS pelo médico (lista que o cliente já carrega). */
export function resumoAvaliacoes(avaliacoes: Avaliacao[]): ResumoAvaliacoes {
  const distribuicao: ResumoAvaliacoes["distribuicao"] = [0, 0, 0, 0, 0];
  for (const a of avaliacoes) {
    const n = Math.round(a.nota);
    if (n >= 1 && n <= 5) distribuicao[n - 1]++;
  }
  return {
    total: avaliacoes.length,
    media: mediaDe(avaliacoes.map((a) => a.nota).filter((v) => v >= 1 && v <= 5)),
    distribuicao,
    pontualidade: mediaDe(subnotas(avaliacoes, "pontualidade")),
    atencao: mediaDe(subnotas(avaliacoes, "atencao")),
    clareza: mediaDe(subnotas(avaliacoes, "clareza")),
    comComentario: avaliacoes.filter((a) => a.comentario?.trim()).length,
  };
}

/* ------------------------------------------------------------------ */
/* Perfil público: completude e referência de preço                    */
/* ------------------------------------------------------------------ */

export type CompletudePerfil = {
  percentual: number;
  preenchidos: number;
  total: number;
  /** Rótulos do que falta, na ordem em que o paciente sente falta. */
  faltantes: string[];
};

/**
 * Quanto do perfil público está preenchido — os mesmos campos que o
 * paciente vê (ou procura) ao escolher um médico. Só presença conta,
 * nunca qualidade inventada.
 */
export function completudePerfil(
  m: Pick<Medico, "foto" | "bio" | "formacao" | "experiencia" | "idiomas" | "subespecialidades" | "horariosDisponiveis" | "horariosPorDia">,
): CompletudePerfil {
  const itens: { rotulo: string; ok: boolean }[] = [
    { rotulo: "foto de perfil", ok: Boolean(m.foto?.trim()) },
    { rotulo: "apresentação (bio)", ok: Boolean(m.bio?.trim()) },
    { rotulo: "formação", ok: Boolean(m.formacao?.trim()) },
    { rotulo: "experiência", ok: Boolean(m.experiencia?.trim()) },
    { rotulo: "idiomas", ok: (m.idiomas ?? []).some((i) => i.trim()) },
    { rotulo: "subespecialidades", ok: (m.subespecialidades ?? []).some((s) => s.trim()) },
    { rotulo: "horários de atendimento", ok: (m.horariosDisponiveis ?? []).length > 0 || Object.values(m.horariosPorDia ?? {}).some((l) => l.length > 0) },
  ];
  const preenchidos = itens.filter((i) => i.ok).length;
  return {
    percentual: Math.round((preenchidos / itens.length) * 100),
    preenchidos,
    total: itens.length,
    faltantes: itens.filter((i) => !i.ok).map((i) => i.rotulo),
  };
}

export type FaixaPrecos = { min: number; mediana: number; max: number; n: number };

/**
 * Faixa de preços dos OUTROS médicos ATIVOS da mesma especialidade no
 * diretório que o cliente já carrega (o mesmo que o paciente navega).
 * Sem outro médico com preço válido, devolve null — referência não se
 * inventa.
 */
export function faixaPrecosEspecialidade(
  medicos: Pick<Medico, "id" | "especialidade" | "valor" | "status">[],
  especialidade: string,
  meuId?: string,
): FaixaPrecos | null {
  const alvo = especialidade.trim().toLowerCase();
  const valores = medicos
    .filter(
      (m) =>
        m.status === "ativo" &&
        m.id !== meuId &&
        m.especialidade.trim().toLowerCase() === alvo &&
        Number.isFinite(m.valor) &&
        m.valor > 0,
    )
    .map((m) => m.valor)
    .sort((a, b) => a - b);
  if (valores.length === 0) return null;
  const meio = Math.floor(valores.length / 2);
  const mediana = valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;
  return { min: valores[0], mediana, max: valores[valores.length - 1], n: valores.length };
}
