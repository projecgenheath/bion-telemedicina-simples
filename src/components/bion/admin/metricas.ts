/**
 * Métricas do Centro de Comando e itens da Fila — funções PURAS sobre os
 * dados reais (store do bootstrap + /api/admin/repasses + /api/admin/reembolsos).
 * Nada inventado: o que o servidor não manda simplesmente não aparece.
 * "Hoje" é sempre o dia no fuso da clínica (America/Sao_Paulo).
 */
import type { AuditLog, Consulta, Medico, TicketSuporte } from "@/lib/bion-tipos";
import { avisosRecebimento, estadoChamado, estadoReembolso, estadoRepasse, humanizar, maisUrgente, pesoTom, type Estado, type Tom } from "./rotulos";
import { brl, competenciaCurta, mesmoDia, rotuloDia, hora, diasDeDiferenca } from "./tempo";

const MIN = 60_000;
const DIA = 86_400_000;

/* ------------------------------------------------------------------ */
/* Formatos vindos das rotas do admin (só o que a tela usa)            */
/* ------------------------------------------------------------------ */
export type RecebimentoWire = { chaveTrocadaRecente?: boolean; cnpjDivergente?: boolean } | null;
export type RepasseWire = {
  id: string;
  medicoId: string;
  medico: string;
  competencia: string;
  status: string;
  liquidoCentavos: number;
  itens: number;
  fechadoEm: string | null;
  recebimento: RecebimentoWire;
};
export type RepassesResposta = { total: number; totalLiquidoCentavos: number; repasses: RepasseWire[] };
export type ReembolsoWire = {
  id: string;
  status: string;
  valorCentavos: number;
  criadoEm: string;
  consulta: { id: string; especialidade: string; dataInicio: string; medico: string; paciente: string } | null;
};
export type ReembolsosResposta = { total: number; reembolsos: ReembolsoWire[] };

/** Valor da consulta como chega do store ("R$ 150" | "R$ 150,5" | "R$ 1.234,56") → centavos. */
export function centavosDoValor(valor: string | null | undefined): number {
  const t = String(valor ?? "").replace(/[^\d,.]/g, "");
  if (!t) return 0;
  const [inteiro, frac = ""] = t.split(",");
  const reais = Number(inteiro.replace(/\./g, ""));
  const cent = Number((frac + "00").slice(0, 2));
  return Number.isFinite(reais) && Number.isFinite(cent) ? reais * 100 + cent : 0;
}

/* ------------------------------------------------------------------ */
/* Hoje                                                                */
/* ------------------------------------------------------------------ */
const EM_ABERTO: Consulta["status"][] = ["confirmada", "pendente_anamnese", "em_espera"];

export type ResumoHoje = {
  total: number; // consultas do dia (inclui canceladas)
  agendadas: number; // ainda vão acontecer ou estão acontecendo
  concluidas: number;
  canceladas: number;
  reagendar: number; // aguardando reagendamento
  aoVivo: Consulta[]; // começaram há até 30 min ou começam em até 30 min
  proximas: Consulta[]; // restantes do dia, em ordem de horário
  pagas: number;
  brutoPagoCentavos: number; // soma do valor de tabela das consultas pagas do dia
};

export function resumoHoje(consultas: Consulta[], agora: number): ResumoHoje {
  const hoje = consultas.filter((c) => Number.isFinite(c.ts) && mesmoDia(c.ts, agora));
  const abertas = hoje.filter((c) => EM_ABERTO.includes(c.status));
  const pagas = hoje.filter((c) => c.pago && c.status !== "cancelada");
  return {
    total: hoje.length,
    agendadas: abertas.length,
    concluidas: hoje.filter((c) => c.status === "concluida").length,
    canceladas: hoje.filter((c) => c.status === "cancelada").length,
    reagendar: hoje.filter((c) => c.status === "aguardando_reagendamento").length,
    aoVivo: abertas.filter((c) => c.ts >= agora - 30 * MIN && c.ts <= agora + 30 * MIN).sort((a, b) => a.ts - b.ts),
    proximas: abertas.filter((c) => c.ts > agora - 30 * MIN).sort((a, b) => a.ts - b.ts),
    pagas: pagas.length,
    brutoPagoCentavos: pagas.reduce((s, c) => s + centavosDoValor(c.valor), 0),
  };
}

/** Consultas por dia nos últimos `dias` dias (fuso da clínica), do mais antigo ao de hoje. */
export function serieDiaria(consultas: Consulta[], agora: number, dias = 14): { rotulo: string; total: number }[] {
  const out: { rotulo: string; total: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = agora - i * DIA;
    out.push({
      rotulo: rotuloDia(dia, agora),
      total: consultas.filter((c) => c.status !== "cancelada" && Number.isFinite(c.ts) && mesmoDia(c.ts, dia)).length,
    });
  }
  return out;
}

/** Especialidades com consultas reais nos últimos 30 dias (hoje incluído), sem canceladas. */
export function especialidades30d(consultas: Consulta[], agora: number): { nome: string; total: number; pct: number }[] {
  const conta = new Map<string, number>();
  for (const c of consultas) {
    if (c.status === "cancelada" || !Number.isFinite(c.ts)) continue;
    const n = diasDeDiferenca(c.ts, agora);
    if (n > 0 || n < -29) continue;
    const nome = (c.especialidade || "").trim() || "Sem especialidade";
    conta.set(nome, (conta.get(nome) ?? 0) + 1);
  }
  const total = [...conta.values()].reduce((a, b) => a + b, 0);
  return [...conta.entries()]
    .map(([nome, n]) => ({ nome, total: n, pct: total ? Math.round((n / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function resumoMedicos(medicos: Medico[]) {
  return {
    ativos: medicos.filter((m) => m.status === "ativo").length,
    validacao: medicos.filter((m) => m.status === "pendente").length,
    suspensos: medicos.filter((m) => m.status === "suspenso").length,
  };
}

/* ------------------------------------------------------------------ */
/* Fila de decisões                                                    */
/* ------------------------------------------------------------------ */
export type CategoriaFila = "validacao" | "reembolso" | "repasse" | "chamado" | "sistema";
export const ROTULO_CATEGORIA: Record<CategoriaFila, string> = {
  validacao: "Validação",
  reembolso: "Reembolsos",
  repasse: "Repasses",
  chamado: "Chamados",
  sistema: "Sistema",
};

export type ItemFila = {
  chave: string;
  categoria: CategoriaFila;
  tom: Tom;
  titulo: string;
  detalhe: string;
  chips: Estado[];
  ts?: number;
  /** View de destino (rotas.ts), com parâmetros opcionais ("admin-repasses?repasse=ID"); null = sem tela. */
  destino: string | null;
};

export function montarFila(
  d: {
    medicos: Medico[];
    tickets: TicketSuporte[];
    auditLogs: AuditLog[];
    repasses: RepasseWire[] | null;
    reembolsos: ReembolsoWire[] | null;
  },
  agora: number,
): ItemFila[] {
  const itens: ItemFila[] = [];

  for (const m of d.medicos) {
    if (m.status !== "pendente") continue;
    itens.push({
      chave: `medico-${m.id}`,
      categoria: "validacao",
      tom: "atencao",
      titulo: m.nome,
      detalhe: [m.especialidade, m.crm ? `CRM ${m.crm}` : ""].filter(Boolean).join(" · "),
      chips: [{ rotulo: "Em validação", tom: "atencao" }],
      destino: `admin-medicos?aba=validacao&medico=${encodeURIComponent(m.id)}`,
    });
  }

  for (const r of d.reembolsos ?? []) {
    if (r.status !== "em_analise") continue;
    const c = r.consulta;
    const ts = Date.parse(r.criadoEm);
    itens.push({
      chave: `reembolso-${r.id}`,
      categoria: "reembolso",
      tom: "atencao",
      titulo: `Reembolso · ${c?.paciente ?? "Paciente"}`,
      detalhe: [c?.medico, c ? `consulta ${rotuloDia(Date.parse(c.dataInicio), agora).toLowerCase()} ${hora(Date.parse(c.dataInicio))}` : "", brl(r.valorCentavos)]
        .filter(Boolean)
        .join(" · "),
      chips: [estadoReembolso(r.status)],
      ts: Number.isFinite(ts) ? ts : undefined,
      destino: "admin-agendamentos?aba=reembolsos",
    });
  }

  for (const r of d.repasses ?? []) {
    if (r.status !== "fechado") continue;
    const avisos = avisosRecebimento(r.recebimento);
    const ts = r.fechadoEm ? Date.parse(r.fechadoEm) : NaN;
    itens.push({
      chave: `repasse-${r.id}`,
      categoria: "repasse",
      tom: avisos.length ? maisUrgente(avisos.map((a) => a.tom)) : "dinheiro",
      titulo: `Repasse · ${r.medico}`,
      detalhe: `${competenciaCurta(r.competencia, agora)} · ${brl(r.liquidoCentavos)} · ${r.itens} ${r.itens === 1 ? "consulta" : "consultas"}`,
      chips: [estadoRepasse(r.status), ...avisos],
      ts: Number.isFinite(ts) ? ts : undefined,
      destino: `admin-repasses?repasse=${encodeURIComponent(r.id)}`,
    });
  }

  for (const t of d.tickets) {
    if (t.status === "resolvido") continue;
    const e = estadoChamado(t.status);
    itens.push({
      chave: `chamado-${t.id}`,
      categoria: "chamado",
      tom: e.tom,
      titulo: t.assunto || "Chamado sem assunto",
      detalhe: [t.usuario, t.perfil === "medico" ? "médico" : "paciente", t.data].filter(Boolean).join(" · "),
      chips: [e],
      destino: "suporte",
    });
  }

  for (const l of d.auditLogs) {
    if (l.severidade !== "critical" || agora - l.ts > DIA || l.ts > agora + MIN) continue;
    itens.push({
      chave: `audit-${l.id}`,
      categoria: "sistema",
      tom: "critico",
      titulo: humanizar(l.acao),
      detalhe: [l.usuario, l.entidade].filter(Boolean).join(" · "),
      chips: [{ rotulo: "Crítico", tom: "critico" }],
      ts: l.ts,
      destino: "auditoria",
    });
  }

  // Urgência primeiro; dentro do mesmo tom, o mais antigo primeiro (quem espera há mais tempo).
  return itens.sort(
    (a, b) => pesoTom(a.tom) - pesoTom(b.tom) || (a.ts ?? Infinity) - (b.ts ?? Infinity) || a.titulo.localeCompare(b.titulo, "pt-BR"),
  );
}

export function contarPorCategoria(itens: ItemFila[]): Record<CategoriaFila, number> {
  const out: Record<CategoriaFila, number> = { validacao: 0, reembolso: 0, repasse: 0, chamado: 0, sistema: 0 };
  for (const i of itens) out[i.categoria]++;
  return out;
}
