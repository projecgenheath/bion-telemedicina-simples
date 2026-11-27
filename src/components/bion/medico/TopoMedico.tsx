"use client";

import { Bell, MessageCircle } from "lucide-react";
import { iniciais } from "./metricas";
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
  /** Etapa 5, rodada 2: Mensagens saiu da barra do celular e fica nos
   *  botões redondos do topo (como na ref. 03), com o contador real. */
  mensagens: number;
  onMensagens: () => void;
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

export function rotuloMensagens(n: number) {
  return n > 0 ? `Mensagens: ${n} não lida${n > 1 ? "s" : ""}. Abrir mensagens` : "Mensagens. Abrir mensagens";
}

/** Botão redondo de Mensagens (celular), igual ao do topo do Início. */
export function MensagensTopo({ className = "" }: { className?: string }) {
  const topo = useContext(TopoMedicoContexto);
  if (!topo) return null;
  const n = topo.mensagens;
  return (
    <button
      type="button"
      onClick={topo.onMensagens}
      aria-label={rotuloMensagens(n)}
      data-mensagens-topo=""
      className={`bm2-icone-topo bm2-icone-topo-borda relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${className}`}
    >
      <MessageCircle className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      {n > 0 ? <span aria-hidden className="bm2-contador">{n > 99 ? "99+" : n}</span> : null}
    </button>
  );
}

/** Avatar redondo que abre Meu perfil e configurações (celular). */
export function PerfilRedondoTopo({ className = "" }: { className?: string }) {
  const topo = useContext(TopoMedicoContexto);
  if (!topo?.perfil.onAbrir) return null;
  const { nome, foto, onAbrir } = topo.perfil;
  return (
    <button type="button" onClick={onAbrir} aria-label="Abrir meu perfil e configurações" data-perfil-topo="" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${className}`}>
      {foto ? (
        <img src={foto} alt="" className="h-11 w-11 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="bm2-avatar grid h-11 w-11 place-items-center rounded-full text-[13px] font-medium">
          {iniciais(nome)}
        </span>
      )}
    </button>
  );
}
