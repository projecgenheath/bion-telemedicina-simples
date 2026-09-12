"use client";
import { useState } from "react";
import {
  Clock,
  Plus,
  Pill,
  Check,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";

export function Lembretes() {
  const { lembretes, adicionarLembrete, alternarLembrete, removerLembrete } = useBion();
  const [modalNovo, setModalNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [horario, setHorario] = useState("08:00");
  const [tipo, setTipo] = useState<"Medicação" | "Consulta" | "Exame" | "Hidratação">("Medicação");
  const [frequencia, setFrequencia] = useState("Todos os dias");

  const criarLembrete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    adicionarLembrete({
      titulo: titulo.trim(),
      horario,
      tipo,
      frequencia,
    });
    toast.success("Lembrete criado", {
      description: `"${titulo.trim()}" às ${horario} • ${frequencia}`,
    });
    setTitulo("");
    setModalNovo(false);
  };

  const pendentes = lembretes.filter((i) => !i.feito).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Lembretes & Alarmes de Saúde</h1>
          <p className="text-muted-foreground mt-1">
            {pendentes} lembrete{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}{" "}
            para hoje
          </p>
        </div>
        <button
          onClick={() => setModalNovo(true)}
          className="px-5 py-3 rounded-2xl text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center gap-1.5 self-start sm:self-auto"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Plus className="w-4 h-4" /> Criar Lembrete
        </button>
      </div>

      <div className="space-y-2.5">
        {lembretes.map((l) => (
          <div
            key={l.id}
            className={`bg-card border rounded-3xl p-4 flex items-center justify-between gap-4 shadow-sm transition ${
              l.feito ? "opacity-55" : ""
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
              <Pill className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm text-foreground ${l.feito ? "line-through" : ""}`}>
                {l.titulo}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <Clock className="w-3.5 h-3.5" /> {l.horario} • {l.frequencia}
                <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-bold">
                  {l.tipo}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => alternarLembrete(l.id)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${
                  l.feito
                    ? "bg-emerald-500 text-white border-transparent"
                    : "border-border hover:border-primary"
                }`}
                title={l.feito ? "Marcar como pendente" : "Marcar como tomado/concluído"}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  removerLembrete(l.id);
                  toast.info("Lembrete removido");
                }}
                className="p-2 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-muted transition"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalNovo && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalNovo(false)}
        >
          <form
            onSubmit={criarLembrete}
            className="bg-card border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">Novo Lembrete de Saúde</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Título / Medicamento</label>
                <input
                  aria-label="Título / Medicamento"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Losartana 50mg, Beber água, Medir Pressão"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Horário</label>
                  <input
                  aria-label="Horário"
                    type="time"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as typeof tipo)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                  >
                    <option value="Medicação">Medicação</option>
                    <option value="Consulta">Consulta</option>
                    <option value="Exame">Exame</option>
                    <option value="Hidratação">Hidratação</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Frequência</label>
                <select
                  value={frequencia}
                  onChange={(e) => setFrequencia(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                >
                  <option value="Todos os dias">Todos os dias</option>
                  <option value="Segunda a Sexta">Segunda a Sexta</option>
                  <option value="A cada 12 horas">A cada 12 horas</option>
                  <option value="A cada 8 horas">A cada 8 horas</option>
                  <option value="Semanalmente">Semanalmente</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-primary-foreground font-bold text-xs"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Salvar Lembrete
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

