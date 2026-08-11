import { useState } from "react";
import { Calendar, Clock, Stethoscope, X, RefreshCw, AlertTriangle } from "lucide-react";
import { useBion, type Consulta } from "@/lib/bion-store";

const DATAS = ["Hoje", "Amanhã", "12 Dez", "15 Dez", "18 Dez"];
const HORAS = ["09:00", "10:00", "11:00", "14:00", "15:30", "16:30"];

export function AgendaConsultas({ perfil }: { perfil: "paciente" | "medico" }) {
  const { consultas } = useBion();
  const lista = consultas.filter((c) =>
    perfil === "paciente" ? c.paciente === "Marina Silva" : c.medico === "Dra. Ana Ribeiro",
  );
  const ativas = lista.filter((c) => c.status === "confirmada");
  const outras = lista.filter((c) => c.status !== "confirmada");

  return (
    <div className="space-y-3">
      {ativas.length === 0 && (
        <div className="bg-card border rounded-2xl p-6 text-center text-muted-foreground text-sm">
          Nenhuma consulta agendada no momento.
        </div>
      )}
      {ativas.map((c) => <LinhaConsulta key={c.id} c={c} perfil={perfil} />)}
      {outras.length > 0 && (
        <>
          <div className="pt-2 text-sm font-medium text-muted-foreground">Anteriores e canceladas</div>
          {outras.map((c) => <LinhaConsulta key={c.id} c={c} perfil={perfil} />)}
        </>
      )}
    </div>
  );
}

function LinhaConsulta({ c, perfil }: { c: Consulta; perfil: "paciente" | "medico" }) {
  const { cancelarConsulta, remarcarConsulta } = useBion();
  const [modal, setModal] = useState<null | "cancelar" | "remarcar">(null);
  const [motivo, setMotivo] = useState("Imprevisto pessoal");
  const [data, setData] = useState(c.data);
  const [hora, setHora] = useState(c.hora);

  const cancelada = c.status === "cancelada";
  const concluida = c.status === "concluida";

  return (
    <div className="bg-card border rounded-2xl p-4">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold truncate ${cancelada ? "line-through text-muted-foreground" : ""}`}>
            {perfil === "paciente" ? c.medico : c.paciente}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{c.especialidade}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{c.data}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{c.hora}</span>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${cancelada ? "bg-destructive/10 text-destructive" : concluida ? "bg-muted text-muted-foreground" : "bg-accent-soft"}`}
          style={!cancelada && !concluida ? { color: "var(--accent)" } : undefined}>
          {cancelada ? "Cancelada" : concluida ? "Concluída" : c.remarcada ? "Remarcada" : "Confirmada"}
        </span>
      </div>

      {!cancelada && !concluida && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => setModal("remarcar")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium hover:border-primary hover:text-primary transition">
            <RefreshCw className="w-4 h-4" /> Remarcar
          </button>
          <button onClick={() => setModal("cancelar")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium text-destructive hover:bg-destructive/5 transition">
            <X className="w-4 h-4" /> Cancelar
          </button>
        </div>
      )}
      {cancelada && c.motivoCancelamento && (
        <div className="mt-3 text-xs text-muted-foreground">Motivo: {c.motivoCancelamento}</div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setModal(null)}>
          <div className="bg-card w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            {modal === "cancelar" ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <h2 className="text-xl font-bold mt-4">Cancelar consulta?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {c.especialidade} • {c.data} às {c.hora}. O horário volta a ficar disponível na agenda do médico.
                </p>
                <label className="block text-sm font-medium mt-4 mb-1.5">Motivo</label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  className="w-full p-3 rounded-xl border bg-background text-sm outline-none focus:border-primary">
                  {["Imprevisto pessoal", "Melhora dos sintomas", "Conflito de horário", "Outro motivo"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <div className="flex gap-2 mt-6">
                  <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border font-medium">Voltar</button>
                  <button onClick={() => { cancelarConsulta(c.id, motivo); setModal(null); }}
                    className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold">
                    Confirmar cancelamento
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">Remarcar consulta</h2>
                <p className="text-sm text-muted-foreground mt-1">Escolha a nova data e horário com {c.medico}.</p>
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Data</div>
                  <div className="flex flex-wrap gap-2">
                    {DATAS.map((d) => (
                      <button key={d} onClick={() => setData(d)}
                        className={`px-3 py-2 rounded-xl border text-sm ${data === d ? "border-primary bg-primary-soft text-primary" : ""}`}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Horário</div>
                  <div className="grid grid-cols-3 gap-2">
                    {HORAS.map((h) => (
                      <button key={h} onClick={() => setHora(h)}
                        className={`py-2 rounded-xl border text-sm ${hora === h ? "border-primary bg-primary-soft text-primary" : ""}`}>{h}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border font-medium">Voltar</button>
                  <button onClick={() => { remarcarConsulta(c.id, data, hora); setModal(null); }}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold">
                    Confirmar novo horário
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
