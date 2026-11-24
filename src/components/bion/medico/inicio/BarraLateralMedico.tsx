"use client";

import { Bell, CalendarClock, ClipboardPlus, FileChartColumn, Info, LayoutGrid, LifeBuoy, Settings, UsersRound } from "lucide-react";
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
    { rotulo: "Pacientes e mensagens", Icone: UsersRound, onClick: onPacientes, ativo: painel === 2, selo: naoLidas },
    { rotulo: "Agenda e horários", Icone: CalendarClock, onClick: onAgenda },
    { rotulo: "Renovações de receita", Icone: ClipboardPlus, onClick: onRenovacoes, selo: renovacoes },
    { rotulo: "Gestão e receita", Icone: FileChartColumn, onClick: onGestao },
  ];
  const conta: Item[] = [
    { rotulo: "Notificações", Icone: Bell, onClick: onNotificacoes, selo: notificacoes },
    { rotulo: "Meu perfil", Icone: Settings, onClick: onPerfil, ativo: painel === 0 },
    { rotulo: "Termos e ajuda", Icone: Info, onClick: onAjuda },
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
        className={`bm2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem] ${it.ativo ? "bm2-lateral-ativo" : ""}`}
      >
        <it.Icone className="h-5 w-5" aria-hidden />
        {it.selo ? (
          <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#C42B2B] ring-2 ring-[var(--bm2-fundo)]" />
        ) : null}
      </button>
    </li>
  );
  return (
    <aside className="bm-v2 bm2-lateral" aria-label="Menu do médico">
      <div className="grid h-[5.5rem] place-items-center border-b border-[var(--bm2-divisor)]">
        <Logo size="sm" />
      </div>
      <nav aria-label="Áreas" className="flex flex-1 flex-col items-center">
        <ul className="mt-[1.0625rem] flex flex-col items-center gap-[0.8rem]">{principais.map(botao)}</ul>
        <span aria-hidden className="my-[1.375rem] h-px w-10 bg-[var(--bm2-divisor)]" />
        <ul className="flex flex-col items-center gap-[0.8rem]">{conta.map(botao)}</ul>
      </nav>
      <div className="mx-3 border-t border-[var(--bm2-divisor)] py-3 text-center text-[11px] text-[var(--bm2-texto-2)] tabular-nums">
        <time aria-label="Hora atual em São Paulo">{fmtHora.format(agora)}</time>
      </div>
    </aside>
  );
}
