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
import { useBion } from "@/lib/bion-store";

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
};

const CORES: Record<string, { bg: string; text: string }> = {
  consulta: { bg: "bg-blue-50", text: "text-blue-700" },
  exame: { bg: "bg-violet-50", text: "text-violet-700" },
  receita: { bg: "bg-emerald-50", text: "text-emerald-700" },
  atestado: { bg: "bg-amber-50", text: "text-amber-700" },
  evento: { bg: "bg-rose-50", text: "text-rose-700" },
};

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  consulta: Stethoscope,
  exame: FlaskConical,
  receita: Pill,
  atestado: FileText,
  evento: Heart,
};

const PRESSAO_DATA = [
  { mes: "Jun", s: 135, d: 88 },
  { mes: "Jul", s: 130, d: 85 },
  { mes: "Ago", s: 128, d: 83 },
  { mes: "Set", s: 132, d: 86 },
  { mes: "Out", s: 126, d: 81 },
  { mes: "Nov", s: 122, d: 79 },
  { mes: "Dez", s: 118, d: 77 },
];

const PESO_DATA = [
  { mes: "Jun", v: 78.2 },
  { mes: "Jul", v: 77.8 },
  { mes: "Ago", v: 77.1 },
  { mes: "Set", v: 76.5 },
  { mes: "Out", v: 75.9 },
  { mes: "Nov", v: 75.2 },
  { mes: "Dez", v: 74.8 },
];

function GraficoPressao() {
  const H = 100;
  const max = 155;
  const min = 60;
  const range = max - min;
  const pS = PRESSAO_DATA.map((d, i) => ({
    x: (i / (PRESSAO_DATA.length - 1)) * 100,
    y: H - ((d.s - min) / range) * H,
    mes: d.mes,
  }));
  const pD = PRESSAO_DATA.map((d, i) => ({
    x: (i / (PRESSAO_DATA.length - 1)) * 100,
    y: H - ((d.d - min) / range) * H,
  }));
  const pathS = pS.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const pathD = pD.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

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
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { l: "Atual", v: "118/77", cls: "bg-muted/50 text-foreground" },
          { l: "Meta", v: "120/80", cls: "bg-emerald-50 text-emerald-700" },
          { l: "Tendência", v: "↓ Melhora", cls: "bg-muted/50 text-emerald-600" },
        ].map((c) => (
          <div key={c.l} className={`rounded-xl p-2 ${c.cls}`}>
            <div className="text-[10px] text-muted-foreground">{c.l}</div>
            <div className="text-sm font-extrabold">{c.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GraficoPeso() {
  const H = 80;
  const max = 80;
  const min = 73;
  const range = max - min;
  const pts = PESO_DATA.map((d, i) => ({
    x: (i / (PESO_DATA.length - 1)) * 100,
    y: H - ((d.v - min) / range) * H,
    v: d.v,
    mes: d.mes,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${path} L100,${H} L0,${H} Z`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold flex items-center gap-1.5">
          <Heart className="w-4 h-4 text-rose-500" /> Evolução de Peso (kg)
        </span>
        <span className="text-muted-foreground">últimos 6 meses</span>
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
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Início: <strong className="text-foreground">78.2 kg</strong>
        </span>
        <span className="text-emerald-600 font-bold">-3.4 kg em 6 meses 🎉</span>
        <span>
          IMC: <strong className="text-foreground">24.1</strong> (Normal)
        </span>
      </div>
    </div>
  );
}

export function HistoricoClinico() {
  const { consultas, documentos, arquivos } = useBion();
  const [filtro, setFiltro] = useState<FiltroTipo>("tudo");
  const [busca, setBusca] = useState("");
  const [ativoId, setAtivoId] = useState<string | null>(null);

  const eventos: EventoTimeline[] = [
    ...consultas
      .filter((c) => c.paciente === "Marina Silva")
      .map((c) => ({
        id: c.id,
        tipo: "consulta" as const,
        titulo: `Teleconsulta — ${c.especialidade}`,
        subtitulo: c.medico,
        data: c.data,
        ts: c.ts,
        detalhes: c.motivoConsulta ?? "Consulta de rotina",
        medico: c.medico,
        status: c.status,
      })),
    ...documentos
      .filter((d) => d.paciente === "Marina Silva")
      .map((d) => ({
        id: d.id,
        tipo: d.tipo === "receita" ? ("receita" as const) : ("atestado" as const),
        titulo: d.titulo,
        subtitulo: `Emitido por ${d.medico}`,
        data: d.data,
        ts: Date.now() - Math.random() * 90 * 86400000,
        detalhes:
          d.tipo === "receita"
            ? `${d.medicamento ?? ""} — ${d.posologia ?? ""}`
            : `CID: ${d.cid ?? "Z00"} • ${d.duracao ?? "1 dia"}`,
        medico: d.medico,
      })),
    ...arquivos
      .filter((a) => a.enviadoPor === "paciente")
      .map((a) => ({
        id: a.id,
        tipo: "exame" as const,
        titulo: a.nome,
        subtitulo: "Exame anexado",
        data: a.data,
        ts: Date.now() - Math.random() * 60 * 86400000,
        detalhes: `${a.tipo.toUpperCase()} • ${a.tamanhoKb}KB`,
      })),
    {
      id: "ev-hemo",
      tipo: "exame",
      titulo: "Hemograma Completo",
      subtitulo: "Laboratório Fleury",
      data: "10 Nov",
      ts: Date.now() - 40 * 86400000,
      detalhes: "Resultado: Normal. Hemoglobina 13.8 g/dL, Leucócitos 6.800/mm³.",
    },
    {
      id: "ev-ecg",
      tipo: "exame",
      titulo: "ECG de Repouso 12 derivações",
      subtitulo: "Laboratório Einstein",
      data: "28 Out",
      ts: Date.now() - 53 * 86400000,
      detalhes: "Ritmo sinusal normal, sem alterações isquêmicas.",
    },
    {
      id: "ev-gli",
      tipo: "exame",
      titulo: "Glicemia + Colesterol Total",
      subtitulo: "Laboratório Particular",
      data: "28 Out",
      ts: Date.now() - 53 * 86400000,
      detalhes: "Glicemia: 89 mg/dL (Normal). LDL: 112 mg/dL (↑ Atenção).",
    },
    {
      id: "ev-pa",
      tipo: "evento",
      titulo: "Medição de Pressão",
      subtitulo: "Monitoramento domiciliar",
      data: "15 Nov",
      ts: Date.now() - 35 * 86400000,
      detalhes: "118/77 mmHg — Dentro do esperado.",
    },
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
    const key =
      e.data === "Hoje"
        ? "Hoje"
        : new Date(e.ts).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
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
      confirmada: "bg-blue-50 text-blue-700",
      concluida: "bg-emerald-50 text-emerald-700",
      cancelada: "bg-red-50 text-red-600",
      em_espera: "bg-amber-50 text-amber-700",
    };
    const labels: Record<string, string> = {
      confirmada: "Confirmada",
      concluida: "Concluída",
      cancelada: "Cancelada",
      em_espera: "Em espera",
    };
    return (
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[s] ?? "bg-muted text-muted-foreground"}`}
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
          <GraficoPressao />
        </div>
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <GraficoPeso />
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
            c: "text-violet-700",
            bg: "bg-violet-50",
            f: "exames",
          },
          {
            l: "Receitas",
            v: totais.receitas,
            I: Pill,
            c: "text-emerald-700",
            bg: "bg-emerald-50",
            f: "receitas",
          },
          {
            l: "Atestados",
            v: totais.atestados,
            I: FileText,
            c: "text-amber-700",
            bg: "bg-amber-50",
            f: "atestados",
          },
        ].map((s) => (
          <button
            key={s.l}
            onClick={() => setFiltro(s.f === filtro ? "tudo" : (s.f as FiltroTipo))}
            className={`bg-card border rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition ${filtro === s.f ? "ring-2 ring-primary/30" : ""}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`}>
              <s.I className={`w-4 h-4 ${s.c}`} />
            </div>
            <div className="text-xl font-extrabold">{s.v}</div>
            <div className="text-[11px] text-muted-foreground">{s.l}</div>
          </button>
        ))}
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar exame, medicamento, médico..."
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {(["tudo", "consultas", "exames", "receitas", "atestados"] as FiltroTipo[]).map((f) => (
            <button
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
              <span className="text-[11px] text-muted-foreground">
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
                        onClick={() => setAtivoId(aberto ? null : ev.id)}
                        className={`flex-1 bg-card border rounded-2xl p-4 shadow-xs hover:shadow-md transition cursor-pointer ${aberto ? "ring-2 ring-primary/30" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm">{ev.titulo}</span>
                              {statusBadge(ev.status)}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cor.bg} ${cor.text}`}
                              >
                                {ev.tipo}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {ev.subtitulo}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-muted-foreground">{ev.data}</span>
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
                              {(ev.tipo === "receita" || ev.tipo === "atestado") && (
                                <button
                                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download className="w-3.5 h-3.5" /> Baixar PDF
                                </button>
                              )}
                              {ev.tipo === "exame" && (
                                <button
                                  className="flex items-center gap-1.5 text-xs font-bold text-violet-700 bg-violet-50 px-3 py-1.5 rounded-xl hover:bg-violet-100 transition"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Eye className="w-3.5 h-3.5" /> Visualizar
                                </button>
                              )}
                              {ev.tipo === "consulta" && (
                                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Pago via Pix
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
      <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2 font-extrabold text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600" /> Itens que merecem acompanhamento
        </div>
        {[
          {
            l: "Colesterol LDL: 112 mg/dL",
            d: "Levemente acima do ideal (< 100). Dr. Carlos recomendou dieta e novo exame em 90 dias.",
          },
          {
            l: "Receita de Losartana vence em 5 dias",
            d: "Solicite renovação na próxima consulta ou via BION Saúde IA.",
          },
        ].map((a, i) => (
          <div key={i} className="flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold text-amber-900">{a.l}</div>
              <div className="text-amber-700 mt-0.5">{a.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
