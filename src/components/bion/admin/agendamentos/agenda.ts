/**
 * Regras PURAS da tela de Agendamentos do admin (testadas em agenda.teste.ts).
 * Tudo no fuso da clínica (America/Sao_Paulo); o "agora" entra como parâmetro.
 * As mensagens de erro espelham src/app/api/consultas/[id]/route.ts,
 * src/lib/server/financeiro.ts e bloqueio-agenda.ts; o texto do servidor é
 * sempre mostrado quando não há tradução melhor.
 */
import type { ApptStatus, Consulta } from "@/lib/bion-tipos";
import { instanteFusoClinica } from "@/lib/bion-tipos";
import { centavosDoValor } from "../metricas";
import { estadoConsulta, estadoReembolso, type Estado } from "../rotulos";
import { chaveDia, hora as horaDe, limitesDia } from "../tempo";

/** Status que liberam o horário (igual a STATUS_LIBERAM_HORARIO do servidor). */
export const STATUS_LIBERAM_HORARIO: ApptStatus[] = ["cancelada", "concluida", "aguardando_reagendamento"];
/** Ordem dos filtros de status (todos os status que o servidor aceita). */
export const STATUS_FILTRO: ApptStatus[] = ["confirmada", "pendente_anamnese", "em_espera", "aguardando_reagendamento", "concluida", "cancelada"];
/** Sem teleconsulta entre 23:00 e 00:00 (São Paulo) — consultaEmHorarioVedado. */
export const HORA_VEDADA = 23;

export type Periodo = "hoje" | "proximas" | "passadas" | "todas";
export type FiltroPago = "todos" | "pago" | "nao_pago";
export type Filtros = { busca: string; status: ApptStatus | "todos"; medicoId: string; periodo: Periodo; pago: FiltroPago };
export const FILTROS_PADRAO: Filtros = { busca: "", status: "todos", medicoId: "", periodo: "proximas", pago: "todos" };

/** Minúsculas e sem acento (busca "jose" encontra "José"). */
export function normalizar(t: string | null | undefined): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra e ordena: "hoje"/"próximas" do mais cedo para o mais tarde;
 * "passadas"/"todas" do mais recente para o mais antigo.
 * "Próximas" = do começo de hoje em diante (inclui as de hoje que já passaram).
 */
export function filtrarConsultas(consultas: Consulta[], f: Filtros, agora: number): Consulta[] {
  const { inicio, fim } = limitesDia(agora);
  const termo = normalizar(f.busca);
  const lista = consultas.filter((c) => {
    if (f.status !== "todos" && c.status !== f.status) return false;
    if (f.medicoId && c.medicoId !== f.medicoId) return false;
    if (f.pago === "pago" && !c.pago) return false;
    if (f.pago === "nao_pago" && c.pago) return false;
    if (f.periodo === "hoje" && (c.ts < inicio || c.ts >= fim)) return false;
    if (f.periodo === "proximas" && c.ts < inicio) return false;
    if (f.periodo === "passadas" && c.ts >= inicio) return false;
    if (termo && !normalizar(`${c.paciente} ${c.medico} ${c.especialidade}`).includes(termo)) return false;
    return true;
  });
  const asc = f.periodo === "hoje" || f.periodo === "proximas";
  return lista.sort((a, b) => (asc ? a.ts - b.ts : b.ts - a.ts) || a.id.localeCompare(b.id));
}

/** Agrupa por dia (fuso da clínica) mantendo a ordem recebida. */
export function agruparPorDia<T extends { ts: number }>(lista: T[]): { dia: string; ts: number; itens: T[] }[] {
  const grupos: { dia: string; ts: number; itens: T[] }[] = [];
  for (const c of lista) {
    const dia = chaveDia(c.ts);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.itens.push(c);
    else grupos.push({ dia, ts: c.ts, itens: [c] });
  }
  return grupos;
}

/** Contagens do topo (sobre as consultas carregadas). */
export function resumoAgenda(consultas: Consulta[], agora: number) {
  const { inicio, fim } = limitesDia(agora);
  let hoje = 0;
  let confirmadas = 0;
  let concluidas = 0;
  let canceladas = 0;
  let aguardando = 0;
  for (const c of consultas) {
    if (c.ts >= inicio && c.ts < fim && c.status !== "cancelada") hoje++;
    if (c.status === "confirmada") confirmadas++;
    else if (c.status === "concluida") concluidas++;
    else if (c.status === "cancelada") canceladas++;
    else if (c.status === "aguardando_reagendamento") aguardando++;
  }
  return { total: consultas.length, hoje, confirmadas, concluidas, canceladas, aguardando };
}

/** O servidor recusa cancelar consulta já cancelada ou concluída (409). */
export const podeCancelar = (c: Pick<Consulta, "status">) => c.status !== "cancelada" && c.status !== "concluida";

/** Cancelamento pelo admin: sem multa e reembolso INTEGRAL se a consulta foi paga (regra do servidor). */
export function reembolsoAoCancelar(c: Pick<Consulta, "pago" | "valor">): number {
  return c.pago ? centavosDoValor(c.valor) : 0;
}

export type Horario = { hora: string; livre: boolean; motivo?: "ocupado" | "reservado" | "passado" | "vedado" | "atual" };

/**
 * Grade de horários do médico num dia, marcando o que está livre. Só ajuda a
 * escolher: o servidor confere de novo (conflito do médico e do paciente,
 * reserva vigente, dia bloqueado, 23:00–00:00) dentro da transação travada.
 */
export function horariosDoDia(p: {
  grade: string[];
  dia: string; // AAAA-MM-DD
  medicoId: string;
  consultas: Consulta[];
  /** A consulta em edição (não conta como ocupando o próprio horário). */
  consultaId: string;
  agora: number;
}): Horario[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.dia);
  if (!m) return [];
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const horas = [...new Set(p.grade.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)))].sort();
  const daMesma = p.consultas.filter((c) => c.medicoId === p.medicoId);
  return horas.map((h) => {
    const [hh, mm] = h.split(":").map(Number);
    const t = instanteFusoClinica(ano, mes, dia, hh, mm);
    const atual = daMesma.find((c) => c.id === p.consultaId && c.ts === t);
    if (atual) return { hora: h, livre: false, motivo: "atual" };
    if (hh === HORA_VEDADA) return { hora: h, livre: false, motivo: "vedado" };
    if (t <= p.agora) return { hora: h, livre: false, motivo: "passado" };
    if (daMesma.some((c) => c.id !== p.consultaId && c.ts === t && !STATUS_LIBERAM_HORARIO.includes(c.status))) return { hora: h, livre: false, motivo: "ocupado" };
    const reservado = daMesma.some((c) => {
      const r = c.remarcacaoPendente;
      return c.id !== p.consultaId && r && r.status === "pendente" && Date.parse(r.expiraEm) > p.agora && Date.parse(r.novaData) === t;
    });
    if (reservado) return { hora: h, livre: false, motivo: "reservado" };
    return { hora: h, livre: true };
  });
}

/** Valida um horário digitado à mão ("Outro horário"). */
export function validarHoraManual(h: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) return "Use o formato HH:MM (ex.: 14:30).";
  if (Number(h.slice(0, 2)) === HORA_VEDADA) return "Não há atendimento entre 23:00 e 00:00.";
  return null;
}

/** Corpo do PATCH { acao: "atualizar" } só com o que mudou (médico SEMPRE por id). */
export function corpoEdicao(
  atual: Pick<Consulta, "ts" | "medicoId" | "especialidade">,
  novo: { dia: string; hora: string; medicoId: string; especialidade: string },
): { acao: "atualizar"; data?: string; hora?: string; medicoId?: string; especialidade?: string } | null {
  const corpo: { acao: "atualizar"; data?: string; hora?: string; medicoId?: string; especialidade?: string } = { acao: "atualizar" };
  if (novo.dia !== chaveDia(atual.ts) || novo.hora !== horaDe(atual.ts)) {
    corpo.data = novo.dia;
    corpo.hora = novo.hora;
  }
  if (novo.medicoId && novo.medicoId !== atual.medicoId) {
    corpo.medicoId = novo.medicoId;
    if (novo.especialidade && novo.especialidade !== atual.especialidade) corpo.especialidade = novo.especialidade;
  }
  return Object.keys(corpo).length > 1 ? corpo : null;
}

/** Corpo que desfaz uma edição (volta data, hora e médico de antes). */
export function corpoDesfazer(antes: Pick<Consulta, "ts" | "medicoId" | "especialidade">) {
  return {
    acao: "atualizar" as const,
    data: chaveDia(antes.ts),
    hora: horaDe(antes.ts),
    ...(antes.medicoId ? { medicoId: antes.medicoId } : {}),
    especialidade: antes.especialidade,
  };
}

/** Negar reembolso exige resposta ao paciente com 10+ caracteres (regra do servidor). */
export function validarRespostaNegar(resposta: string): string | null {
  return resposta.trim().length < 10 ? "Explique o motivo ao paciente (mínimo de 10 caracteres)." : null;
}

/** Mensagem clara para os erros das rotas de consulta e reembolso. */
export function explicarErro(status: number, erro: string | null | undefined): string {
  const msg = String(erro ?? "").trim();
  if (status === 0) return "Sem conexão com o servidor. Nada foi alterado; tente de novo.";
  if (status === 401 || status === 403) return "Sem permissão. Entre de novo com uma conta de administrador.";
  if (status === 404) return msg || "Não encontrado. Atualize a tela.";
  if (status === 409 && /alterada por outra pessoa/i.test(msg)) return "Outra pessoa mudou esta consulta agora há pouco. Atualize a tela e tente de novo.";
  if (msg) return msg;
  return `O servidor respondeu ${status}. Nada foi alterado.`;
}

const MOTIVO_REAGENDAMENTO: Record<string, string> = {
  medico_cancelou: "Médico cancelou o dia",
  falha_tecnica: "Falha técnica",
  falta_medico: "Médico não compareceu",
};

/** Chips do card/linha: sempre texto + cor. */
export function chipsConsulta(c: Consulta, agora: number): Estado[] {
  const out: Estado[] = [estadoConsulta(c.status)];
  if (c.status !== "cancelada") out.push(c.pago ? { rotulo: "Pago", tom: "ok" } : { rotulo: "Não pago", tom: "atencao" });
  if (c.motivoReagendamento) out.push({ rotulo: MOTIVO_REAGENDAMENTO[c.motivoReagendamento] ?? "Reagendar", tom: "atencao" });
  if (c.remarcada) out.push({ rotulo: "Remarcada", tom: "neutro" });
  const r = c.remarcacaoPendente;
  if (r && r.status === "pendente" && Date.parse(r.expiraEm) > agora) out.push({ rotulo: `Multa pendente até ${horaDe(Date.parse(r.expiraEm))}`, tom: "dinheiro" });
  if (c.falta) out.push({ rotulo: "Falta do paciente", tom: "atencao" });
  if (c.reembolsoManual) {
    const e = estadoReembolso(c.reembolsoManual.status);
    out.push({ rotulo: `Reembolso ${e.rotulo.toLowerCase()}`, tom: e.tom });
  }
  return out;
}
