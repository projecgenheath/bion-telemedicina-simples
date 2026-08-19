import { Bell, Check, MessageSquare, Pill, Calendar, ClipboardList, CheckCheck } from "lucide-react";
import { useBion, type NotifTipo } from "@/lib/bion-store";

const iconePorTipo: Record<NotifTipo, any> = {
  lembrete: Bell,
  mensagem: MessageSquare,
  receita: Pill,
  agenda: Calendar,
  exame: ClipboardList,
};

const rotulo: Record<NotifTipo, string> = {
  lembrete: "Lembrete",
  mensagem: "Mensagem",
  receita: "Receita",
  agenda: "Agenda",
  exame: "Exame",
};

export function Notificacoes() {
  const { notificacoesVisiveis: notificacoes, naoLidas, marcarLida, marcarTodasLidas } = useBion();

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Notificações</h1>
          <p className="text-muted-foreground mt-1">
            {naoLidas > 0 ? `${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : "Tudo em dia 🎉"}
          </p>
        </div>
        {naoLidas > 0 && (
          <button onClick={marcarTodasLidas}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium hover:border-primary hover:text-primary transition">
            <CheckCheck className="w-4 h-4" /> Marcar todas como lidas
          </button>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {notificacoes.map((n) => {
          const Icon = iconePorTipo[n.tipo];
          return (
            <button key={n.id} onClick={() => marcarLida(n.id)}
              className={`w-full text-left bg-card border rounded-2xl p-4 flex items-start gap-4 transition hover:border-primary ${n.lida ? "opacity-70" : ""}`}>
              <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${n.lida ? "bg-muted" : "bg-primary-soft"}`}>
                <Icon className={`w-5 h-5 ${n.lida ? "text-muted-foreground" : "text-primary"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold ${n.lida ? "" : "text-foreground"}`}>{n.titulo}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{rotulo[n.tipo]}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.texto}</p>
                <div className="text-xs text-muted-foreground mt-1.5">{n.hora}</div>
              </div>
              {n.lida ? (
                <Check className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-2" style={{ backgroundColor: "var(--accent)" }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
