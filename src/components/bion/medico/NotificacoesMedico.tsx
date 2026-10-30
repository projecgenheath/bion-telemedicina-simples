"use client";

import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  ClipboardList,
  LifeBuoy,
  MessageSquare,
  Pill,
  type LucideIcon,
} from "lucide-react";
import { useBion, type NotifTipo } from "@/lib/bion-store";

/**
 * Central de notificações do app do médico (item 12 da auditoria de
 * melhorias). Até aqui o servidor criava as notificações e o store as
 * expunha (`notificacoesVisiveis`), mas só a UI clássica as consumia —
 * o app novo do médico não tinha sino nem lista. Consome o MESMO store e
 * o MESMO PATCH /api/notificacoes (via marcarLida/marcarTodasLidas) da
 * UI clássica; a navegação é interna do MedicoApp (sem rotas do paciente):
 * mensagem → painel Pacientes; receita → renovações; suporte → suporte;
 * os demais tipos → Início (coluna central).
 */
const iconePorTipo: Partial<Record<NotifTipo, LucideIcon>> = {
  lembrete: Bell,
  mensagem: MessageSquare,
  receita: Pill,
  agenda: Calendar,
  exame: ClipboardList,
  suporte: LifeBuoy,
};

const rotuloPorTipo: Partial<Record<NotifTipo, string>> = {
  lembrete: "Lembrete",
  mensagem: "Mensagem",
  receita: "Receita",
  agenda: "Agenda",
  exame: "Exame",
  suporte: "Suporte",
};

export function NotificacoesMedico({ onNavegar }: { onNavegar: (tipo: NotifTipo) => void }) {
  const { notificacoesVisiveis: notificacoes, naoLidas, marcarLida, marcarTodasLidas, carregando } = useBion();

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75" role="status">
          {carregando
            ? "Carregando…"
            : naoLidas > 0
              ? `${naoLidas} não lida${naoLidas > 1 ? "s" : ""}`
              : "Tudo em dia"}
        </p>
        {naoLidas > 0 ? (
          <button
            type="button"
            onClick={marcarTodasLidas}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-bold"
          >
            <CheckCheck className="w-4 h-4" aria-hidden /> Marcar todas como lidas
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {carregando ? (
          <p role="status" className="text-sm text-bion-ink/70 dark:text-bion-paper/70 py-8 text-center">
            Carregando suas notificações…
          </p>
        ) : notificacoes.length === 0 ? (
          <div className="bp-glass p-6 text-center">
            <Bell className="w-8 h-8 mx-auto text-bion-ink/50 dark:text-bion-paper/50" aria-hidden />
            <p className="mt-2 text-sm font-bold">Nenhuma notificação</p>
            <p className="mt-1 text-sm text-bion-ink/75 dark:text-bion-paper/75">
              Novas consultas, cancelamentos, mensagens e avaliações aparecem aqui — e também chegam por push com o
              app fechado.
            </p>
          </div>
        ) : (
          notificacoes.map((n) => {
            const Icon = iconePorTipo[n.tipo] ?? Bell;
            const rotulo = rotuloPorTipo[n.tipo] ?? "Aviso";
            return (
              <button
                type="button"
                key={n.id}
                onClick={() => {
                  marcarLida(n.id);
                  onNavegar(n.tipo);
                }}
                className={`w-full flex items-start gap-3 rounded-2xl bg-bion-ink/5 dark:bg-white/5 px-4 py-3 text-left ${
                  n.lida ? "opacity-70" : ""
                }`}
              >
                <span
                  className={`w-10 h-10 shrink-0 rounded-xl inline-flex items-center justify-center ${
                    n.lida ? "bg-bion-ink/8 dark:bg-white/10" : "bg-bion-sea/15 dark:bg-sky-400/15"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${n.lida ? "" : "text-bion-sea dark:text-sky-300"}`}
                    aria-hidden
                  />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{n.titulo}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-bion-ink/8 dark:bg-white/10 font-semibold">
                      {rotulo}
                    </span>
                  </span>
                  <span className="block text-sm text-bion-ink/75 dark:text-bion-paper/75 mt-0.5">{n.texto}</span>
                  <span className="block text-xs text-bion-ink/60 dark:text-bion-paper/60 mt-1">{n.hora}</span>
                </span>
                {n.lida ? (
                  <Check className="w-4 h-4 shrink-0 mt-1 text-bion-ink/50 dark:text-bion-paper/50" aria-hidden />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0 mt-2" aria-label="Não lida" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
