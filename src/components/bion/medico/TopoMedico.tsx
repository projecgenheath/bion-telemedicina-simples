"use client";

import { Bell } from "lucide-react";
import { createContext, useContext } from "react";

/**
 * Sino de notificações do topo (rodada do menu): saiu do menu lateral e fica
 * no topo, ao lado do perfil, em todas as telas do médico. O MedicoApp provê
 * a contagem real (notificacoesNaoLidas) e a ação; as telas só posicionam.
 */
export type TopoMedico = {
  notificacoes: number;
  onNotificacoes: () => void;
  /** A tela atual já é a de notificações (o sino fica marcado). */
  notificacoesAbertas: boolean;
  /** Perfil do médico logado (mesmo do topo do Início). */
  perfil: { nome: string; especialidade?: string | null; foto?: string | null; onAbrir?: () => void };
};

export const TopoMedicoContexto = createContext<TopoMedico | null>(null);

export function rotuloSino(n: number) {
  return n > 0 ? `Notificações: ${n} não lida${n > 1 ? "s" : ""}. Abrir notificações` : "Notificações. Abrir notificações";
}

export function SinoTopo({ className = "" }: { className?: string }) {
  const topo = useContext(TopoMedicoContexto);
  if (!topo) return null;
  const { notificacoes: n, onNotificacoes, notificacoesAbertas } = topo;
  return (
    <button
      type="button"
      onClick={notificacoesAbertas ? undefined : onNotificacoes}
      aria-label={notificacoesAbertas ? "Notificações (tela atual)" : rotuloSino(n)}
      aria-current={notificacoesAbertas ? "page" : undefined}
      data-sino-topo=""
      className={`bm2-icone-topo bm2-icone-topo-borda bm2-sino-topo relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${notificacoesAbertas ? "bm2-sino-ativo" : ""} ${className}`}
    >
      <Bell className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      {n > 0 && !notificacoesAbertas ? <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#C42B2B]" /> : null}
    </button>
  );
}
