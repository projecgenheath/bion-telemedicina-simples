"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Bell, Calendar, Check, CheckCheck, ClipboardList, LifeBuoy, MessageSquare, Pill } from "lucide-react";
import { useBion, type NotifTipo } from "@/lib/bion-store";
import { TelaModulo } from "../ui/TelaModulo";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { useDadosAdmin } from "../dados";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const ICONE: Record<NotifTipo, Icone> = {
  lembrete: Bell,
  mensagem: MessageSquare,
  receita: Pill,
  agenda: Calendar,
  exame: ClipboardList,
  suporte: LifeBuoy,
};
const ROTULO: Record<NotifTipo, string> = {
  lembrete: "Lembrete",
  mensagem: "Mensagem",
  receita: "Receita",
  agenda: "Agenda",
  exame: "Exame",
  suporte: "Suporte",
};

/** Notificações do admin no visual Torre BION (mesmos dados e ações da tela antiga). */
export function NotificacoesModulo() {
  const { notificacoesVisiveis: notificacoes, naoLidas, marcarLida, marcarTodasLidas } = useBion();
  const { atualizar, atualizando } = useDadosAdmin();
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const lista = useMemo(() => (soNaoLidas ? notificacoes.filter((n) => !n.lida) : notificacoes), [notificacoes, soNaoLidas]);

  return (
    <TelaModulo
      titulo="Notificações"
      icone={Bell}
      subtitulo={naoLidas > 0 ? `${naoLidas} ${naoLidas === 1 ? "não lida" : "não lidas"}` : "Tudo em dia"}
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      acoes={
        naoLidas > 0 ? (
          <button type="button" onClick={marcarTodasLidas} className="ba-botao ba-botao-secundario !min-h-11 !px-3">
            <CheckCheck className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Marcar todas como lidas</span>
            <span className="sm:hidden">Ler todas</span>
          </button>
        ) : null
      }
      ferramentas={
        <div role="group" aria-label="Mostrar" className="flex gap-1.5">
          <button type="button" className="ba-filtro" aria-pressed={!soNaoLidas} onClick={() => setSoNaoLidas(false)}>
            Todas <span className="tabular-nums opacity-80">{notificacoes.length}</span>
          </button>
          <button type="button" className="ba-filtro" aria-pressed={soNaoLidas} onClick={() => setSoNaoLidas(true)}>
            Não lidas <span className="tabular-nums opacity-80">{naoLidas}</span>
          </button>
        </div>
      }
    >
      {lista.length === 0 ? (
        <div className="ba-card" data-denso="true">
          <EstadoVazio icone={Bell} titulo={soNaoLidas ? "Nenhuma notificação não lida" : "Nenhuma notificação"} texto="Os avisos do app aparecem aqui." />
        </div>
      ) : (
        <ul className="grid gap-2 xl:grid-cols-2 max-w-5xl">
          {lista.map((n) => {
            const Ic = ICONE[n.tipo] ?? Bell;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => marcarLida(n.id)}
                  className="ba-card w-full text-left"
                  data-denso="true"
                  data-tom={n.lida ? undefined : "sinal"}
                  aria-label={`${n.titulo}. ${n.lida ? "Lida" : "Não lida, marcar como lida"}`}
                >
                  <div className={`flex gap-3 ${n.lida ? "opacity-70" : ""}`}>
                    <span className="ba-estado-icone !w-9 !h-9 shrink-0" data-tom={n.lida ? "neutro" : "sinal"} aria-hidden>
                      <Ic className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm leading-snug break-words">{n.titulo}</p>
                        {n.lida ? <Check className="w-4 h-4 ba-texto-3 shrink-0" aria-hidden /> : <span className="ba-chip-ponto mt-1.5 shrink-0" aria-hidden />}
                      </div>
                      <p className="text-xs ba-texto-2 break-words mt-0.5">{n.texto}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <ChipEstado tom="neutro" ponto={false}>
                          {ROTULO[n.tipo] ?? n.tipo}
                        </ChipEstado>
                        <span className="text-xs ba-texto-3">{n.hora}</span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </TelaModulo>
  );
}
