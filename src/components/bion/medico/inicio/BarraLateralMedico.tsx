"use client";

import { BarChart3, Bell, CalendarDays, CircleHelp, LayoutGrid, LifeBuoy, Pill, UserRound, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Logo } from "@/components/bion/brand";

type Item = {
  rotulo: string;
  Icone: ComponentType<{ className?: string }>;
  onClick: () => void;
  ativo?: boolean;
  selo?: number | null;
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Menu lateral só com ícones (tela larga ≥ 1024 px), como no modelo de
 * referência: logo no topo, áreas principais, depois conta/ajuda e a hora no
 * rodapé. Abaixo de 1024 px fica escondido (o celular segue com a pílula).
 */
export function BarraLateralMedico({
  agora,
  painel,
  onInicio,
  onPacientes,
  onAgenda,
  onRenovacoes,
  onNotificacoes,
  onGestao,
  onPerfil,
  onAjuda,
  onSuporte,
  naoLidas,
  renovacoes,
  notificacoes,
}: {
  agora: number;
  painel: number;
  onInicio: () => void;
  onPacientes: () => void;
  onAgenda: () => void;
  onRenovacoes: () => void;
  onNotificacoes: () => void;
  onGestao: () => void;
  onPerfil: () => void;
  onAjuda: () => void;
  onSuporte: () => void;
  naoLidas: number;
  renovacoes: number | null;
  notificacoes: number;
}) {
  const principais: Item[] = [
    { rotulo: "Início", Icone: LayoutGrid, onClick: onInicio, ativo: painel === 1 },
    { rotulo: "Pacientes e mensagens", Icone: Users, onClick: onPacientes, ativo: painel === 2, selo: naoLidas },
    { rotulo: "Agenda e horários", Icone: CalendarDays, onClick: onAgenda },
    { rotulo: "Renovações de receita", Icone: Pill, onClick: onRenovacoes, selo: renovacoes },
    { rotulo: "Gestão e receita", Icone: BarChart3, onClick: onGestao },
  ];
  const conta: Item[] = [
    { rotulo: "Notificações", Icone: Bell, onClick: onNotificacoes, selo: notificacoes },
    { rotulo: "Meu perfil", Icone: UserRound, onClick: onPerfil, ativo: painel === 0 },
    { rotulo: "Termos e ajuda", Icone: CircleHelp, onClick: onAjuda },
    { rotulo: "Suporte", Icone: LifeBuoy, onClick: onSuporte },
  ];
  const botao = (it: Item) => (
    <li key={it.rotulo}>
      <button
        type="button"
        onClick={it.onClick}
        aria-label={it.selo ? `${it.rotulo} (${it.selo})` : it.rotulo}
        aria-current={it.ativo ? "page" : undefined}
        title={it.rotulo}
        className={`bm2-lateral-item relative grid h-11 w-11 place-items-center rounded-xl ${it.ativo ? "bm2-lateral-ativo" : ""}`}
      >
        <it.Icone className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        {it.selo ? (
          <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#C42B2B] ring-2 ring-[var(--bm2-fundo)]" />
        ) : null}
      </button>
    </li>
  );
  return (
    <aside className="bm-v2 bm2-lateral" aria-label="Menu do médico">
      <div className="grid h-16 place-items-center">
        <Logo size="sm" />
      </div>
      <nav aria-label="Áreas" className="flex flex-1 flex-col items-center">
        <ul className="mt-4 flex flex-col items-center gap-2">{principais.map(botao)}</ul>
        <span aria-hidden className="my-5 h-px w-8 bg-[var(--bm2-borda)]" />
        <ul className="flex flex-col items-center gap-2">{conta.map(botao)}</ul>
      </nav>
      <div className="border-t border-[var(--bm2-borda)] py-3 text-center text-[11px] text-[var(--bm2-texto-2)] tabular-nums">
        <time aria-label="Hora atual">{fmtHora.format(agora)}</time>
      </div>
    </aside>
  );
}
