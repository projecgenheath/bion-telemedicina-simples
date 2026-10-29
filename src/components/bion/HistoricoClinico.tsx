"use client";

import React, { useState } from "react";
import {
  Clock,
  FileText,
  Pill,
  Stethoscope,
  Activity,
  Download,
  ChevronRight,
  Search,
  Eye,
  Calendar,
  Heart,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Microscope,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useBion, type ExameLab, type Medicao } from "@/lib/bion-store";
import { gerarDocumentoPDF } from "@/lib/receita-pdf";

type FiltroTipo = "tudo" | "consultas" | "exames" | "receitas" | "atestados";

type EventoTimeline = {
  id: string;
  tipo: "consulta" | "exame" | "receita" | "atestado" | "evento";
  titulo: string;
  subtitulo: string;
  data: string;
  ts: number;
  detalhes?: string;
  medico?: string;
  status?: string;
  pago?: boolean;
  /** Exame com arquivo no Storage: id do arquivo para baixar/visualizar. */
  arquivoId?: string;
  storagePath?: string | null;
};

const CORES: Record<string, { bg: string; text: string }> = {
  consulta: { bg: "bg-blue-50 dark:bg-blue-950/60", text: "text-blue-700 dark:text-blue-300" },
  exame: { bg: "bg-violet-50 dark:bg-violet-950/60", text: "text-violet-700 dark:text-violet-300" },
  receita: { bg: "bg-emerald-50 dark:bg-emerald-950/60", text: "text-emerald-800 dark:text-emerald-200" },
  atestado: { bg: "bg-amber-50 dark:bg-amber-950/60", text: "text-amber-700 dark:text-amber-300" },
  evento: { bg: "bg-rose-50 dark:bg-rose-950/60", text: "text-rose-700 dark:text-rose-300" },
};

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  consulta: Stethoscope,
  exame: FlaskConical,
  receita: Pill,
  atestado: FileText,
  evento: Heart,
};

// Meses em português usados pelo rótulo de data do store ("10 Nov 2025").
// Serve só para ordenar/agrupar por datas reais; nenhum valor é inventado.
const MESES_PT: Record<string, number> = {
  Jan: 0,
  Fev: 1,
  Mar: 2,
  Abr: 3,
  Mai: 4,
  Jun: 5,
  Jul: 6,
  Ago: 7,
  Set: 8,
  Out: 9,
  Nov: 10,
  Dez: 11,
};

/** Timestamp (ms) de um rótulo de data real do store; 0 quando não dá para determinar. */
function tsDeDataLonga(data: string): number {
  const m = data.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return 0;
  const mes = MESES_PT[m[2]];
  if (mes === undefined) return 0;
  return Date.UTC(Number(m[3]), mes, Number(m[1]));
}

function GraficoPressao({ medicoes }: { medicoes: Medicao[] }) {
  const H = 100;
  const max = 155;
  const min = 60;
  const range = max - min;
  // Medições reais de pressão do paciente, em ordem cronológica.
  const serie = [...medicoes]
    .filter((m) => m.tipo === "pa")
    .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
  if (serie.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-primary" /> Pressão Arterial (mmHg)
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Nenhum dado registrado.</p>
      </div>
    );
  }
  const x = (i: number) => (serie.length === 1 ? 50 : (i / (serie.length - 1)) * 100);
  const y = (v: number) => H - ((v - min) / range) * H;
  const pS = serie.map((m, i) => ({
    x: x(i),
    y: y(m.valor1),
    mes: m.quando,
  }));
  const pD = serie
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.valor2 !== undefined)
    .map(({ m, i }) => ({
      x: x(i),
      y: y(m.valor2 as number),
    }));
  const pathS = pS.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const pathD = pD.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const ultima = serie[serie.length - 1];
  const ultimaTexto =
    ultima.valor2 !== undefined ? `${ultima.valor1}/${ultima.valor2}` : `${ultima.valor1}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-primary" /> Pressão Arterial (mmHg)
        </span>
        <div className="flex gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-1 rounded"
              style={{ background: "var(--primary)" }}
            />{" "}
            Sistólica
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-1 rounded bg-violet-400" /> Diastólica
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 100 ${H + 16}`} className="w-full" style={{ height: 130 }}>
        <rect
          x="0"
          y={H - ((130 - min) / range) * H}
          width="100"
          height={((130 - 90) / range) * H}
          fill="rgba(16,185,129,0.07)"
        />
        <line
          x1="0"
          y1={H - ((120 - min) / range) * H}
          x2="100"
          y2={H - ((120 - min) / range) * H}
          stroke="rgba(16,185,129,0.3)"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
        <path
          d={pathD}
          fill="none"
          stroke="rgb(167,139,250)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={pathS}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pS.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--primary)" />
        ))}
        {pS.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H + 13}
            textAnchor="middle"
            fontSize="5"
            fill="currentColor"
            opacity={0.5}
          >
            {p.mes}
          </text>
        ))}
      </svg>
      <div className="text-xs text-muted-foreground">
        Última medição:{" "}
        <strong className="text-foreground">
          {ultimaTexto} mmHg
        </strong>{" "}
        • {ultima.quando}
      </div>
    </div>
  );
}

function GraficoPeso({ medicoes }: { medicoes: Medicao[] }) {
  const H = 80;
  // Medições reais de peso do paciente, em ordem cronológica.
  const serie = [...medicoes]
    .filter((m) => m.tipo === "peso")
    .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
  if (serie.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold flex items-center gap-1.5">
            <Heart className="w-4 h-4 text-rose-500 dark:text-rose-400" /> Evolução de Peso (kg)
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Nenhum dado registrado.</p>
      </div>
    );
  }
  const valores = serie.map((m) => m.valor1);
  const max = Math.max(...valores) + 1;
  const min = Math.min(...valores) - 1;
  const range = max - min || 1;
  const pts = serie.map((m, i) => ({
    x: serie.length === 1 ? 50 : (i / (serie.length - 1)) * 100,
    y: H - ((m.valor1 - min) / range) * H,
    v: m.valor1,
    mes: m.quando,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${path} L100,${H} L0,${H} Z`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold flex items-center gap-1.5">
          <Heart className="w-4 h-4 text-rose-500 dark:text-rose-400" /> Evolução de Peso (kg)
        </span>
        <span className="text-muted-foreground">
          {serie.length} registro{serie.length !== 1 ? "s" : ""}
        </span>
      </div>
      <svg viewBox={`0 0 100 ${H + 16}`} className="w-full" style={{ height: 110 }}>
        <path d={area} fill="rgba(14,165,233,0.08)" />
        <path
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="2.2" fill="var(--primary)" />
            {i === pts.length - 1 && (
              <text x={p.x - 1} y={p.y - 4} fontSize="5" fill="var(--primary)" fontWeight="bold">
                {p.v}kg
              </text>
            )}
            <text
              x={p.x}
              y={H + 13}
              textAnchor="middle"
              fontSize="5"
              fill="currentColor"
              opacity={0.5}
            >
              {p.mes}
            </text>
          </g>
        ))}
      </svg>
      <div className="text-xs text-muted-foreground">
        Última medição:{" "}
        <strong className="text-foreground">
          {serie[serie.length - 1].valor1} kg
        </strong>{" "}
        • {serie[serie.length - 1].quando}
      </div>
    </div>
  );
}

export function HistoricoClinico() {
  const { consultas, documentos, arquivos, medicoes, exames, sessao } = useBion();
  const [filtro, setFiltro] = useState<FiltroTipo>("tudo");
  const [busca, setBusca] = useState("");
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  // Baixa um exame com arquivo real no Storage (mesmo fluxo de Arquivos.tsx:
  // GET /api/arquivos?id= devolve o link assinado). Sem arquivo, não há botão.
  const baixarExame = async (arquivoId: string, nome: string) => {
    setBaixandoId(arquivoId);
    try {
      const res = await fetch(`/api/arquivos?id=${encodeURIComponent(arquivoId)}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        toast.error(json.erro || "Não foi possível gerar o link.");
        return;
      }
      const a = document.createElement("a");
      a.href = json.url;
      a.download = nome;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch {
      toast.error("Falha ao baixar.");
    } finally {
      setBaixandoId(null);
    }
  };

  // Identificação por ID (nome só para registros antigos sem ID): o
  // bootstrap já escopa as coleções no servidor; isto evita que um homônimo
  // misture consultas/documentos/arquivos nesta tela.
  const mesmoPaciente = (pacienteId?: string, nome?: string) =>
    sessao.id ? (pacienteId ? pacienteId === sessao.id : nome === sessao.nome) : nome === sessao.nome;

  const eventos: EventoTimeline[] = [
    ...consultas
      .filter((c) => mesmoPaciente(c.pacienteId, c.paciente))
      .map((c) => ({
        id: c.id,
        tipo: "consulta" as const,
        titulo: `Teleconsulta — ${c.especialidade}`,
        subtitulo: c.medico,
        data: c.data,
        ts: c.ts,
        detalhes: c.motivoConsulta ?? undefined,
        medico: c.medico,
        status: c.status,
        pago: c.pago,
      })),
    ...documentos
      .filter((d) => mesmoPaciente(d.pacienteId, d.paciente))
      .map((d) => {
        // Só campos reais do documento; sem padrão inventado para CID ou duração.
        const partes =
          d.tipo === "receita"
            ? [d.medicamento, d.posologia].filter(Boolean)
            : [d.cid ? `CID: ${d.cid}` : undefined, d.duracao].filter(Boolean);
        return {
          id: d.id,
          tipo: d.tipo === "receita" ? ("receita" as const) : ("atestado" as const),
          titulo: d.titulo,
          subtitulo: `Emitido por ${d.medico}`,
          data: d.data,
          ts: tsDeDataLonga(d.data),
          detalhes: partes.length > 0 ? partes.join(" • ") : undefined,
          medico: d.medico,
        };
      }),
    ...arquivos
      .filter((a) =>
        // Arquivo com destinatário: só o próprio paciente. Sem destinatário
        // (legado), só o enviado pelo paciente — o servidor já escopa a
        // lista por quem enviou/destinatário.
        a.pacienteId ? a.pacienteId === sessao.id : a.enviadoPor === "paciente",
      )
      .map((a) => ({
        id: a.id,
        tipo: "exame" as const,
        titulo: a.nome,
        subtitulo: "Exame anexado",
        data: a.data,
        ts: tsDeDataLonga(a.data),
        detalhes: `${a.tipo.toUpperCase()} • ${a.tamanhoKb}KB`,
        arquivoId: a.id,
        storagePath: a.storagePath ?? null,
      })),
    // Exames laboratoriais reais do paciente (já escopados pelo bootstrap).
    ...exames.map((e: ExameLab) => ({
      id: e.id,
      tipo: "exame" as const,
      titulo: e.titulo,
      subtitulo: e.arquivoNome ? `Arquivo: ${e.arquivoNome}` : "Exame laboratorial",
      data: e.quando,
      ts: new Date(e.dataColeta).getTime() || 0,
      detalhes:
        e.itens
          .map((it) => `${it.nome}: ${it.valor}${it.unidade ? ` ${it.unidade}` : ""}`)
          .join(" • ") || undefined,
    })),
  ] as EventoTimeline[];

  const filtered = eventos
    .filter((e) => {
      if (filtro === "consultas") return e.tipo === "consulta";
      if (filtro === "exames") return e.tipo === "exame" || e.tipo === "evento";
      if (filtro === "receitas") return e.tipo === "receita";
      if (filtro === "atestados") return e.tipo === "atestado";
      return true;
    })
    .filter((e) => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return (
        e.titulo.toLowerCase().includes(q) ||
        e.subtitulo.toLowerCase().includes(q) ||
        (e.detalhes?.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => b.ts - a.ts);

  // Agrupa por período legível
  const grupos: Record<string, EventoTimeline[]> = {};
  filtered.forEach((e) => {
    // Sem timestamp real, o evento vai para "Sem data registrada" — nunca para
    // um mês/ano inventado.
    const key =
      e.data === "Hoje"
        ? "Hoje"
        : e.ts > 0
          ? new Date(e.ts).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
          : "Sem data registrada";
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(e);
  });

  const totais = {
    consultas: eventos.filter((e) => e.tipo === "consulta").length,
    exames: eventos.filter((e) => e.tipo === "exame" || e.tipo === "evento").length,
    receitas: eventos.filter((e) => e.tipo === "receita").length,
    atestados: eventos.filter((e) => e.tipo === "atestado").length,
  };

  const statusBadge = (s?: string) => {
    if (!s) return null;
    const map: Record<string, string> = {
      confirmada: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300",
      concluida: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200",
      cancelada: "bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400",
      em_espera: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
      pendente_anamnese: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
    };
    const labels: Record<string, string> = {
      confirmada: "Confirmada",
      concluida: "Concluída",
      cancelada: "Cancelada",
      em_espera: "Em espera",
      pendente_anamnese: "Pendente anamnese",
    };
    return (
      <span
        className={`text-xs font-bold px-2 py-0.5 rounded-full ${map[s] ?? "bg-muted text-muted-foreground"}`}
      >
        {labels[s] ?? s}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Histórico Clínico</h1>
        <p className="text-muted-foreground mt-1">
          Linha do tempo completa: consultas, exames, receitas e saúde.
        </p>
      </div>

      {/* Gráficos de saúde */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <GraficoPressao medicoes={medicoes} />
        </div>
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <GraficoPeso medicoes={medicoes} />
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            l: "Consultas",
            v: totais.consultas,
            I: Stethoscope,
            c: "text-primary",
            bg: "bg-primary-soft",
            f: "consultas",
          },
          {
            l: "Exames",
            v: totais.exames,
            I: Microscope,
            c: "text-violet-700 dark:text-violet-300",
            bg: "bg-violet-50 dark:bg-violet-950/60",
            f: "exames",
          },
          {
            l: "Receitas",
            v: totais.receitas,
            I: Pill,
            c: "text-emerald-800 dark:text-emerald-200",
            bg: "bg-emerald-50 dark:bg-emerald-950/60",
            f: "receitas",
          },
          {
            l: "Atestados",
            v: totais.atestados,
            I: FileText,
            c: "text-amber-700 dark:text-amber-300",
            bg: "bg-amber-50 dark:bg-amber-950/60",
            f: "atestados",
          },
        ].map((s) => (
          <button type="button"
            key={s.l}
            onClick={() => setFiltro(s.f === filtro ? "tudo" : (s.f as FiltroTipo))}
            className={`bg-card border rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition ${filtro === s.f ? "ring-2 ring-primary/30" : ""}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`}>
              <s.I className={`w-4 h-4 ${s.c}`} />
            </div>
            <div className="text-xl font-extrabold">{s.v}</div>
            <div className="text-xs text-muted-foreground">{s.l}</div>
          </button>
        ))}
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
                  aria-label="Buscar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar exame, medicamento, médico..."
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {(["tudo", "consultas", "exames", "receitas", "atestados"] as FiltroTipo[]).map((f) => (
            <button type="button"
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition ${filtro === f ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border hover:bg-muted text-muted-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline agrupada */}
      <div className="space-y-8">
        {Object.entries(grupos).map(([mes, evs]) => (
          <div key={mes}>
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-extrabold capitalize">{mes}</span>
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">
                {evs.length} evento{evs.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="relative ml-3">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-3">
                {evs.map((ev) => {
                  const Ic = ICONES[ev.tipo];
                  const cor = CORES[ev.tipo];
                  const aberto = ativoId === ev.id;
                  return (
                    <div key={ev.id} className="flex gap-4">
                      <div
                        className={`w-9 h-9 rounded-xl border-2 border-card flex items-center justify-center shrink-0 z-10 shadow-sm ${cor.bg}`}
                      >
                        <Ic className={`w-4 h-4 ${cor.text}`} />
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${aberto ? "Fechar" : "Abrir"} evento: ${ev.titulo}`}
                        onClick={() => setAtivoId(aberto ? null : ev.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAtivoId(aberto ? null : ev.id);
                          }
                        }}
                        className={`flex-1 bg-card border rounded-2xl p-4 shadow-xs hover:shadow-md transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${aberto ? "ring-2 ring-primary/30" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm">{ev.titulo}</span>
                              {statusBadge(ev.status)}
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor.bg} ${cor.text}`}
                              >
                                {ev.tipo}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {ev.subtitulo}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">{ev.data}</span>
                            <ChevronRight
                              className={`w-4 h-4 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`}
                            />
                          </div>
                        </div>
                        {aberto && (
                          <div className="mt-3 pt-3 border-t space-y-2.5">
                            {ev.detalhes && (
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {ev.detalhes}
                              </p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.medico && (
                                <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                                  <Stethoscope className="w-3.5 h-3.5" />
                                  {ev.medico}
                                </div>
                              )}
                              {(ev.tipo === "receita" || ev.tipo === "atestado") &&
                                (() => {
                                  // O documento real, pelo ID — sem ele, não
                                  // há botão (nunca um botão sem efeito).
                                  const doc = documentos.find((d) => d.id === ev.id);
                                  if (!doc) return null;
                                  return (
                                    <button type="button"
                                      className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        gerarDocumentoPDF(doc);
                                        toast.success("PDF baixado", { description: doc.titulo });
                                      }}
                                    >
                                      <Download className="w-3.5 h-3.5" /> Baixar PDF
                                    </button>
                                  );
                                })()}
                              {ev.tipo === "exame" &&
                                (ev.arquivoId && ev.storagePath ? (
                                  <button type="button"
                                    disabled={baixandoId === ev.arquivoId}
                                    className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 px-3 py-1.5 rounded-xl hover:bg-violet-100 transition disabled:opacity-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void baixarExame(ev.arquivoId as string, ev.titulo);
                                    }}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    {baixandoId === ev.arquivoId ? "Baixando…" : "Visualizar"}
                                  </button>
                                ) : ev.arquivoId ? (
                                  <span className="text-xs text-muted-foreground">
                                    Só metadados — sem arquivo no Storage
                                  </span>
                                ) : null)}
                              {ev.tipo === "consulta" && ev.pago === true && (
                                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Pago
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center mx-auto">
              <Filter className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="font-bold">Nenhum evento encontrado</div>
            <div className="text-sm text-muted-foreground">
              Tente ajustar os filtros ou a busca.
            </div>
          </div>
        )}
      </div>

      {/* Alertas de saúde */}
      <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2 font-extrabold text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /> Itens que merecem acompanhamento
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Nenhum item registrado.
        </p>
      </div>
    </div>
  );
}
