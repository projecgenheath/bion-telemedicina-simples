"use client";

import { CalendarClock, ClipboardPlus, FileChartColumn, Info, LayoutGrid, LifeBuoy, MessageCircle, Settings, UsersRound } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Logo } from "@/components/bion/brand";

/** Destinos do menu lateral — a tela atual diz qual fica ativo. */
export type DestinoMenu =
  | "inicio"
  | "pacientes"
  | "mensagens"
  | "agenda"
  | "relatorios"
  | "documentos"
  | "configuracoes"
  | "ajuda";

type Item = {
  id: DestinoMenu;
  rotulo: string;
  /** Nome acessível/tooltip (mais descritivo que o rótulo curto). */
  nome: string;
  Icone: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Ponto vermelho (pendências). */
  selo?: number | null;
  /** Contador numérico (mensagens não lidas). */
  contador?: number;
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Menu lateral só com ícones (tela larga ≥ 1024 px), na ordem do modelo de
 * referência: Início, Pacientes, Mensagens, Agenda, Relatórios, Documentos |
 * Configurações, Ajuda. O sino saiu daqui — fica no topo, ao lado do perfil,
 * em todas as telas. "Ajuda" abre um menu com Termos e ajuda + Suporte
 * (nenhuma função se perde). Abaixo de 1024 px fica escondido.
 */
export function BarraLateralMedico({
  agora,
  ativo,
  onInicio,
  onPacientes,
  onMensagens,
  onAgenda,
  onRelatorios,
  onDocumentos,
  onConfiguracoes,
  onTermos,
  onSuporte,
  naoLidas,
  renovacoes,
}: {
  agora: number;
  /** Item da tela atual (null = nenhum, ex.: notificações, que vivem no sino). */
  ativo: DestinoMenu | null;
  onInicio: () => void;
  onPacientes: () => void;
  onMensagens: () => void;
  onAgenda: () => void;
  onRelatorios: () => void;
  onDocumentos: () => void;
  onConfiguracoes: () => void;
  onTermos: () => void;
  onSuporte: () => void;
  naoLidas: number;
  renovacoes: number | null;
}) {
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const ajudaRef = useRef<HTMLLIElement>(null);
  const botaoAjudaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ajudaAberta) return;
    const fora = (e: PointerEvent) => {
      if (!ajudaRef.current?.contains(e.target as Node)) setAjudaAberta(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape fecha só o menu (não a tela por baixo).
      e.stopPropagation();
      setAjudaAberta(false);
      botaoAjudaRef.current?.focus();
    };
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [ajudaAberta]);

  const principais: Item[] = [
    { id: "inicio", rotulo: "Início", nome: "Início", Icone: LayoutGrid, onClick: onInicio },
    { id: "pacientes", rotulo: "Pacientes", nome: "Pacientes", Icone: UsersRound, onClick: onPacientes },
    { id: "mensagens", rotulo: "Mensagens", nome: "Mensagens", Icone: MessageCircle, onClick: onMensagens, contador: naoLidas },
    { id: "agenda", rotulo: "Agenda", nome: "Agenda e horários", Icone: CalendarClock, onClick: onAgenda },
    { id: "relatorios", rotulo: "Relatórios", nome: "Relatórios: gestão e receita", Icone: FileChartColumn, onClick: onRelatorios },
    { id: "documentos", rotulo: "Documentos", nome: "Documentos: renovações de receita", Icone: ClipboardPlus, onClick: onDocumentos, selo: renovacoes },
  ];
  const nomeAcessivel = (it: Item) => {
    if (it.contador) return `${it.nome}: ${it.contador} não lida${it.contador > 1 ? "s" : ""}`;
    if (it.selo) return `${it.nome} (${it.selo} pendente${it.selo > 1 ? "s" : ""})`;
    return it.nome;
  };
  const classe = (ativoAqui: boolean) =>
    `bm2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem] ${ativoAqui ? "bm2-lateral-ativo" : ""}`;
  const botao = (it: Item) => (
    <li key={it.id}>
      <button
        type="button"
        onClick={it.onClick}
        aria-label={nomeAcessivel(it)}
        aria-current={ativo === it.id ? "page" : undefined}
        title={it.nome}
        data-destino={it.id}
        className={classe(ativo === it.id)}
      >
        <it.Icone className="h-5 w-5" aria-hidden />
        {it.contador ? (
          <span aria-hidden className="bm2-contador">
            {it.contador > 99 ? "99+" : it.contador}
          </span>
        ) : it.selo ? (
          <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#C42B2B] ring-2 ring-[var(--bm2-fundo)]" />
        ) : null}
      </button>
    </li>
  );
  const escolher = (f: () => void) => {
    setAjudaAberta(false);
    f();
  };
  return (
    <aside className={`bm-v2 bm2-lateral ${ajudaAberta ? "bm2-lateral-com-menu" : ""}`} aria-label="Menu do médico">
      <div className="grid h-[5.5rem] place-items-center border-b border-[var(--bm2-divisor)]">
        <Logo size="sm" />
      </div>
      <nav aria-label="Áreas" className="flex flex-1 flex-col items-center">
        <ul className="mt-[1.0625rem] flex flex-col items-center gap-[0.8rem]">{principais.map(botao)}</ul>
        <span aria-hidden className="my-[1.375rem] h-px w-10 bg-[var(--bm2-divisor)]" />
        <ul className="flex flex-col items-center gap-[0.8rem]">
          <li>
            <button
              type="button"
              onClick={onConfiguracoes}
              aria-label="Configurações e perfil"
              aria-current={ativo === "configuracoes" ? "page" : undefined}
              title="Configurações e perfil"
              data-destino="configuracoes"
              className={classe(ativo === "configuracoes")}
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </li>
          <li ref={ajudaRef} className="relative">
            <button
              ref={botaoAjudaRef}
              type="button"
              onClick={() => setAjudaAberta((a) => !a)}
              aria-label="Ajuda: termos e suporte"
              aria-haspopup="true"
              aria-expanded={ajudaAberta}
              aria-controls="bm2-menu-ajuda"
              aria-current={ativo === "ajuda" ? "page" : undefined}
              title="Ajuda: termos e suporte"
              data-destino="ajuda"
              className={classe(ativo === "ajuda" || ajudaAberta)}
            >
              <Info className="h-5 w-5" aria-hidden />
            </button>
            {ajudaAberta ? (
              <ul id="bm2-menu-ajuda" aria-label="Ajuda" className="bm2-lateral-menu">
                <li>
                  <button type="button" onClick={() => escolher(onTermos)} autoFocus>
                    <Info className="h-4 w-4" aria-hidden />
                    Termos e ajuda
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => escolher(onSuporte)}>
                    <LifeBuoy className="h-4 w-4" aria-hidden />
                    Suporte
                  </button>
                </li>
              </ul>
            ) : null}
          </li>
        </ul>
      </nav>
      <div className="mx-3 border-t border-[var(--bm2-divisor)] py-3 text-center text-[11px] text-[var(--bm2-texto-2)] tabular-nums">
        <time aria-label="Hora atual em São Paulo">{fmtHora.format(agora)}</time>
      </div>
    </aside>
  );
}
