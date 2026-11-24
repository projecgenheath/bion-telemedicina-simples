"use client";

import { CalendarPlus, ClipboardList, FileText, HeartPulse, Info, LayoutGrid, LifeBuoy, MessageCircle, Settings, ShieldCheck, CircleHelp } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Logo } from "@/components/bion/brand";
import type { DestinoPaciente } from "./destino";

type Item = {
  id: DestinoPaciente;
  /** Nome acessível/tooltip. */
  nome: string;
  Icone: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Contador numérico (mensagens não lidas). */
  contador?: number;
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Menu lateral só com ícones (tela larga ≥ 1024 px), no mesmo desenho do
 * médico (ref. 12): logo no topo, Início, Mensagens, Saúde, Exames,
 * Documentos, Agendar | Perfil, Ajuda; hora embaixo. "Ajuda" abre um menu
 * com Ajuda, Termos e privacidade e Suporte. Abaixo de 1024 px fica
 * escondido (a barra de baixo assume).
 */
export function BarraLateralPaciente({
  ativo,
  onInicio,
  onMensagens,
  onSaude,
  onExames,
  onDocumentos,
  onAgendar,
  onPerfil,
  onAjuda,
  onTermos,
  onSuporte,
  naoLidas,
}: {
  ativo: DestinoPaciente | null;
  onInicio: () => void;
  onMensagens: () => void;
  onSaude: () => void;
  onExames: () => void;
  onDocumentos: () => void;
  onAgendar: () => void;
  onPerfil: () => void;
  onAjuda: () => void;
  onTermos: () => void;
  onSuporte: () => void;
  naoLidas: number;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
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
    { id: "inicio", nome: "Início", Icone: LayoutGrid, onClick: onInicio },
    { id: "mensagens", nome: "Mensagens com os médicos", Icone: MessageCircle, onClick: onMensagens, contador: naoLidas },
    { id: "saude", nome: "Minha saúde: remédios, IMC e pressão", Icone: HeartPulse, onClick: onSaude },
    { id: "exames", nome: "Exames e laudos", Icone: ClipboardList, onClick: onExames },
    { id: "documentos", nome: "Documentos: receitas, atestados e pedidos", Icone: FileText, onClick: onDocumentos },
    { id: "agendar", nome: "Agendar consulta com a BION IA", Icone: CalendarPlus, onClick: onAgendar },
  ];
  const nomeAcessivel = (it: Item) =>
    it.contador ? `${it.nome}: ${it.contador} não lida${it.contador > 1 ? "s" : ""}` : it.nome;
  const classe = (aqui: boolean) =>
    `bp2-lateral-item relative grid h-10 w-10 place-items-center rounded-[0.65rem] ${aqui ? "bp2-lateral-ativo" : ""}`;
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
          <span aria-hidden className="bp2-contador">
            {it.contador > 99 ? "99+" : it.contador}
          </span>
        ) : null}
      </button>
    </li>
  );
  const escolher = (f: () => void) => {
    setAjudaAberta(false);
    f();
  };
  return (
    <aside className={`bp2-v2 bp2-lateral ${ajudaAberta ? "bp2-lateral-com-menu" : ""}`} aria-label="Menu do paciente">
      <div className="grid h-[5.5rem] place-items-center border-b border-[var(--bp2-divisor)]">
        <Logo size="sm" />
      </div>
      <nav aria-label="Áreas" className="flex flex-1 flex-col items-center">
        <ul className="mt-[1.0625rem] flex flex-col items-center gap-[0.8rem]">{principais.map(botao)}</ul>
        <span aria-hidden className="my-[1.375rem] h-px w-10 bg-[var(--bp2-divisor)]" />
        <ul className="flex flex-col items-center gap-[0.8rem]">
          <li>
            <button
              type="button"
              onClick={onPerfil}
              aria-label="Meu perfil e configurações"
              aria-current={ativo === "perfil" ? "page" : undefined}
              title="Meu perfil e configurações"
              data-destino="perfil"
              className={classe(ativo === "perfil")}
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </li>
          <li ref={ajudaRef} className="relative">
            <button
              ref={botaoAjudaRef}
              type="button"
              onClick={() => setAjudaAberta((a) => !a)}
              aria-label="Ajuda, termos e suporte"
              aria-haspopup="true"
              aria-expanded={ajudaAberta}
              aria-controls="bp2-menu-ajuda"
              aria-current={ativo === "ajuda" ? "page" : undefined}
              title="Ajuda, termos e suporte"
              data-destino="ajuda"
              className={classe(ativo === "ajuda" || ajudaAberta)}
            >
              <Info className="h-5 w-5" aria-hidden />
            </button>
            {ajudaAberta ? (
              <ul id="bp2-menu-ajuda" aria-label="Ajuda" className="bp2-lateral-menu">
                <li>
                  <button type="button" onClick={() => escolher(onAjuda)} autoFocus>
                    <CircleHelp className="h-4 w-4" aria-hidden />
                    Ajuda
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => escolher(onTermos)}>
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Termos e privacidade
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
      <div className="mx-3 border-t border-[var(--bp2-divisor)] py-3 text-center text-[11px] text-[var(--bp2-texto-2)] tabular-nums">
        <time aria-label="Hora atual em São Paulo" suppressHydrationWarning>
          {fmtHora.format(agora)}
        </time>
      </div>
    </aside>
  );
}
