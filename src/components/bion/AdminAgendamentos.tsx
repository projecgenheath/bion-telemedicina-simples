"use client";

import { useMemo, useState } from "react";
import { Search, Pencil, X, CalendarX2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useBion, type Consulta } from "@/lib/bion-store";

const STATUS: { valor: Consulta["status"] | "todas"; label: string }[] = [
  { valor: "todas", label: "Todas" },
  { valor: "confirmada", label: "Confirmadas" },
  { valor: "em_espera", label: "Em espera" },
  { valor: "concluida", label: "Concluídas" },
  { valor: "cancelada", label: "Canceladas" },
];

export function AdminAgendamentos() {
  const { consultas, medicos, atualizarConsulta, cancelarConsulta } = useBion();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Consulta["status"] | "todas">("todas");
  const [editar, setEditar] = useState<Consulta | null>(null);
  const [form, setForm] = useState({ data: "", hora: "", medico: "" });
  const [cancelando, setCancelando] = useState<Consulta | null>(null);
  const [motivo, setMotivo] = useState("");

  const lista = useMemo(
    () =>
      consultas
        .filter((c) => (filtro === "todas" ? true : c.status === filtro))
        .filter((c) =>
          `${c.paciente} ${c.medico} ${c.especialidade}`
            .toLowerCase()
            .includes(busca.toLowerCase()),
        )
        .slice()
        .sort((a, b) => b.ts - a.ts),
    [consultas, filtro, busca],
  );

  const resumo = useMemo(
    () => ({
      total: consultas.length,
      confirmadas: consultas.filter((c) => c.status === "confirmada").length,
      concluidas: consultas.filter((c) => c.status === "concluida").length,
      canceladas: consultas.filter((c) => c.status === "cancelada").length,
    }),
    [consultas],
  );

  const abrirEdicao = (c: Consulta) => {
    setForm({ data: c.data, hora: c.hora, medico: c.medico });
    setEditar(c);
  };

  const salvar = () => {
    if (!editar) return;
    if (!form.data.trim() || !form.hora.trim()) {
      toast.error("Informe data e horário.");
      return;
    }
    const med = medicos.find((m) => m.nome === form.medico);
    atualizarConsulta(editar.id, {
      data: form.data,
      hora: form.hora,
      medico: form.medico,
      ...(med ? { especialidade: med.especialidade } : {}),
    });
    toast.success("Agendamento atualizado.");
    setEditar(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-foreground">Administração de Agendamentos</h2>
        <p className="text-xs text-muted-foreground">
          Veja, edite e cancele consultas — tudo reflete nos relatórios.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Total", resumo.total],
          ["Confirmadas", resumo.confirmadas],
          ["Concluídas", resumo.concluidas],
          ["Canceladas", resumo.canceladas],
        ].map(([label, v]) => (
          <div key={String(label)} className="bg-card border rounded-2xl p-4">
            <div className="text-2xl font-extrabold text-foreground">{v}</div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por paciente, médico ou especialidade"
            className="w-full pl-11 pr-4 py-3 rounded-2xl border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {STATUS.map((s) => (
            <button
              key={s.valor}
              onClick={() => setFiltro(s.valor)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${filtro === s.valor ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {lista.map((c) => (
          <div
            key={c.id}
            className="bg-card border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">{c.paciente}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-soft text-primary">
                  {c.status}
                </span>
                {c.remarcada && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                    remarcada
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> {c.data} às {c.hora} • {c.medico} •{" "}
                {c.especialidade}
              </p>
              {c.motivoCancelamento && (
                <p className="text-[11px] text-destructive">Motivo: {c.motivoCancelamento}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => abrirEdicao(c)}
                className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 hover:bg-muted"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
              {c.status !== "cancelada" && (
                <button
                  onClick={() => {
                    setMotivo("");
                    setCancelando(c);
                  }}
                  className="px-3 py-2 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/10"
                >
                  <CalendarX2 className="w-3.5 h-3.5" /> Cancelar
                </button>
              )}
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhum agendamento encontrado.
          </p>
        )}
      </div>

      {editar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border rounded-3xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-foreground">Editar agendamento</h3>
              <button onClick={() => setEditar(null)} aria-label="Fechar">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <label className="text-xs font-semibold space-y-1 block">
              <span className="text-muted-foreground">Data</span>
              <input
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="w-full p-2.5 rounded-xl border bg-background outline-none"
              />
            </label>
            <label className="text-xs font-semibold space-y-1 block">
              <span className="text-muted-foreground">Horário</span>
              <input
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
                className="w-full p-2.5 rounded-xl border bg-background outline-none"
              />
            </label>
            <label className="text-xs font-semibold space-y-1 block">
              <span className="text-muted-foreground">Médico</span>
              <select
                value={form.medico}
                onChange={(e) => setForm({ ...form, medico: e.target.value })}
                className="w-full p-2.5 rounded-xl border bg-background outline-none"
              >
                {medicos.map((m) => (
                  <option key={m.id} value={m.nome}>
                    {m.nome} — {m.especialidade}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={salvar}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
            >
              Salvar alterações
            </button>
          </div>
        </div>
      )}

      {cancelando && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-3xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-extrabold text-foreground text-center">Cancelar consulta?</h3>
            <p className="text-xs text-muted-foreground text-center">
              {cancelando.paciente} com {cancelando.medico} — {cancelando.data} às{" "}
              {cancelando.hora}
            </p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento"
              className="w-full p-2.5 rounded-xl border bg-background text-xs outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCancelando(null)}
                className="flex-1 py-2.5 rounded-xl border text-xs font-bold"
              >
                Voltar
              </button>
              <button
                onClick={() => {
                  cancelarConsulta(cancelando.id, motivo || "Cancelado pela administração");
                  toast.success("Consulta cancelada.");
                  setCancelando(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
