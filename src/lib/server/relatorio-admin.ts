/**
 * Relatórios do admin direto no banco. A lista (CSV, PDF, detalhe) cabe
 * até TETO_RELATORIO. Os indicadores, quando a lista não cabe, saem do
 * groupBy — não das 500 linhas do bootstrap.
 */
import type { Prisma } from "@prisma/client";
import type { Avaliacao, Consulta } from "@/lib/bion-tipos";
import { fmtCurta, fmtHora, fmtQuando } from "@/lib/bion-tipos";
import { db } from "@/lib/db";
import { valorTabela } from "@/lib/painel-forma";
import {
  calcularRelatorio,
  limiteDoPeriodo,
  type DadosRelatorio,
  type FiltrosRelatorio,
  type LinhaMedico,
  type PeriodoKey,
} from "@/components/bion/admin/relatorios/relatorio";

export const TETO_RELATORIO = 20_000;
const LOTE = 1_000;
const PERIODOS: PeriodoKey[] = ["7", "30", "90", "todos"];

export type RespostaRelatorio = {
  completo: boolean;
  totalConsultas: number;
  totalAvaliacoes: number;
  dados: DadosRelatorio;
  consultas: Consulta[];
  avaliacoes: Avaliacao[];
  plataforma: { documentos: number; arquivos: number; consentimentos: number };
  opcoes: { esp: string[]; med: string[] };
};

export function filtrosRelatorioDe(sp: URLSearchParams): FiltrosRelatorio {
  const periodo = sp.get("periodo");
  return {
    periodo: PERIODOS.includes(periodo as PeriodoKey) ? (periodo as PeriodoKey) : "todos",
    especialidade: (sp.get("especialidade") || "todas").trim() || "todas",
    medico: (sp.get("medico") || "todos").trim() || "todos",
  };
}

function whereConsulta(f: FiltrosRelatorio, desde: Date | null): Prisma.ConsultaWhereInput {
  return {
    ...(desde ? { dataInicio: { gte: desde } } : {}),
    ...(f.especialidade !== "todas" ? { especialidade: f.especialidade } : {}),
    ...(f.medico !== "todos" ? { medico: { nome: f.medico } } : {}),
  };
}

function whereAvaliacao(f: FiltrosRelatorio, desde: Date | null): Prisma.AvaliacaoWhereInput {
  const medico: Prisma.UserWhereInput = {};
  if (f.medico !== "todos") medico.nome = f.medico;
  if (f.especialidade !== "todas") medico.perfilMedico = { especialidade: f.especialidade };
  return {
    ...(desde ? { createdAt: { gte: desde } } : {}),
    ...(Object.keys(medico).length ? { medico } : {}),
  };
}

function mapConsulta(c: {
  id: string;
  medicoId: string;
  pacienteId: string;
  especialidade: string;
  dataInicio: Date;
  status: string;
  valor: number;
  pago: boolean;
  medico: { nome: string };
  paciente: { nome: string };
}): Consulta {
  const iso = c.dataInicio.toISOString();
  return {
    id: c.id,
    medicoId: c.medicoId,
    medico: c.medico.nome,
    pacienteId: c.pacienteId,
    paciente: c.paciente.nome,
    especialidade: c.especialidade,
    status: c.status as Consulta["status"],
    ts: c.dataInicio.getTime(),
    data: fmtCurta(iso),
    hora: fmtHora(iso),
    pago: c.pago,
    valor: valorTabela(c.valor),
  };
}

function mapAvaliacao(a: {
  id: string;
  nota: number;
  comentario: string | null;
  createdAt: Date;
  paciente: { id: string; nome: string };
  medico: { id: string; nome: string; perfilMedico: { especialidade: string } | null };
}): Avaliacao {
  const iso = a.createdAt.toISOString();
  return {
    id: a.id,
    paciente: a.paciente.nome,
    pacienteId: a.paciente.id,
    medico: a.medico.nome,
    medicoId: a.medico.id,
    especialidade: a.medico.perfilMedico?.especialidade ?? "",
    nota: a.nota,
    comentario: a.comentario ?? undefined,
    quando: fmtQuando(iso),
    ts: a.createdAt.getTime(),
  };
}

async function agregar(whereC: Prisma.ConsultaWhereInput, whereA: Prisma.AvaliacaoWhereInput): Promise<DadosRelatorio> {
  const [porStatus, porEsp, porMed, porPac, avAgg, avPorMed] = await Promise.all([
    db.consulta.groupBy({ by: ["status"], where: whereC, _count: { _all: true } }),
    db.consulta.groupBy({ by: ["especialidade"], where: whereC, _count: { _all: true } }),
    db.consulta.groupBy({ by: ["medicoId"], where: whereC, _count: { _all: true } }),
    db.consulta.groupBy({ by: ["pacienteId"], where: whereC, _count: { _all: true } }),
    db.avaliacao.aggregate({ where: whereA, _avg: { nota: true }, _count: { _all: true } }),
    db.avaliacao.groupBy({ by: ["medicoId"], where: whereA, _count: { _all: true }, _sum: { nota: true } }),
  ]);
  const total = porStatus.reduce((s, r) => s + r._count._all, 0);
  const contar = (st: string) => porStatus.find((r) => r.status === st)?._count._all ?? 0;
  const canceladas = contar("cancelada");
  const ids = [...new Set([...porMed.map((m) => m.medicoId), ...avPorMed.map((m) => m.medicoId)])];
  const nomes = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
    : [];
  const nomeDe = new Map(nomes.map((u) => [u.id, u.nome]));
  const linhas = new Map<string, LinhaMedico>();
  for (const m of porMed) {
    linhas.set(m.medicoId, {
      chave: `id:${m.medicoId}`,
      nome: nomeDe.get(m.medicoId) ?? "Médico",
      medicoId: m.medicoId,
      total: m._count._all,
      soma: 0,
      n: 0,
    });
  }
  for (const a of avPorMed) {
    const atual = linhas.get(a.medicoId) ?? {
      chave: `id:${a.medicoId}`,
      nome: nomeDe.get(a.medicoId) ?? "Médico",
      medicoId: a.medicoId,
      total: 0,
      soma: 0,
      n: 0,
    };
    atual.soma = a._sum.nota ?? 0;
    atual.n = a._count._all;
    linhas.set(a.medicoId, atual);
  }
  return {
    total,
    concluidas: contar("concluida"),
    canceladas,
    media: avAgg._count._all ? (avAgg._avg.nota ?? 0) : 0,
    taxaCancelamento: total ? Math.round((canceladas / total) * 100) : 0,
    especialidades: porEsp
      .map((e) => [e.especialidade, e._count._all] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")),
    medicos: [...linhas.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR")),
    pacientes: porPac.length,
  };
}

async function opcoes() {
  const [esp, medC, medA] = await Promise.all([
    db.consulta.groupBy({ by: ["especialidade"], _count: { _all: true } }),
    db.consulta.groupBy({ by: ["medicoId"], _count: { _all: true } }),
    db.avaliacao.groupBy({ by: ["medicoId"], _count: { _all: true } }),
  ]);
  const ids = [...new Set([...medC.map((m) => m.medicoId), ...medA.map((m) => m.medicoId)])];
  const nomes = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { nome: true } })
    : [];
  return {
    esp: [...new Set(esp.map((e) => e.especialidade))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    med: [...new Set(nomes.map((n) => n.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

export async function carregarRelatorio(f: FiltrosRelatorio, agora = new Date()): Promise<RespostaRelatorio> {
  const desdeMs = limiteDoPeriodo(f.periodo, agora.getTime());
  const desde = desdeMs ? new Date(desdeMs) : null;
  const whereC = whereConsulta(f, desde);
  const whereA = whereAvaliacao(f, desde);

  const [totalConsultas, totalAvaliacoes, documentos, arquivos, consentimentos, listas] = await Promise.all([
    db.consulta.count({ where: whereC }),
    db.avaliacao.count({ where: whereA }),
    db.documento.count(),
    db.arquivo.count(),
    db.consentimento.count(),
    opcoes(),
  ]);

  const consultas: Consulta[] = [];
  let cursorC: string | undefined;
  while (consultas.length < TETO_RELATORIO && consultas.length < totalConsultas) {
    const pedido = Math.min(LOTE, TETO_RELATORIO - consultas.length);
    const lote = await db.consulta.findMany({
      where: whereC,
      take: pedido,
      ...(cursorC ? { skip: 1, cursor: { id: cursorC } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        medicoId: true,
        pacienteId: true,
        especialidade: true,
        dataInicio: true,
        status: true,
        valor: true,
        pago: true,
        medico: { select: { nome: true } },
        paciente: { select: { nome: true } },
      },
    });
    consultas.push(...lote.map(mapConsulta));
    if (lote.length < pedido) break;
    cursorC = lote[lote.length - 1]?.id;
    if (!cursorC) break;
  }

  const avaliacoes: Avaliacao[] = [];
  let cursorA: string | undefined;
  while (avaliacoes.length < TETO_RELATORIO && avaliacoes.length < totalAvaliacoes) {
    const pedido = Math.min(LOTE, TETO_RELATORIO - avaliacoes.length);
    const lote = await db.avaliacao.findMany({
      where: whereA,
      take: pedido,
      ...(cursorA ? { skip: 1, cursor: { id: cursorA } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        nota: true,
        comentario: true,
        createdAt: true,
        paciente: { select: { id: true, nome: true } },
        medico: { select: { id: true, nome: true, perfilMedico: { select: { especialidade: true } } } },
      },
    });
    avaliacoes.push(...lote.map(mapAvaliacao));
    if (lote.length < pedido) break;
    cursorA = lote[lote.length - 1]?.id;
    if (!cursorA) break;
  }

  const completo = consultas.length === totalConsultas && avaliacoes.length === totalAvaliacoes;
  const dados = completo ? calcularRelatorio(consultas, avaliacoes) : await agregar(whereC, whereA);
  return {
    completo,
    totalConsultas,
    totalAvaliacoes,
    dados,
    consultas,
    avaliacoes,
    plataforma: { documentos, arquivos, consentimentos },
    opcoes: listas,
  };
}
