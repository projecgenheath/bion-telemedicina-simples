"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Estados padronizados do app do paciente (fase 3):
 *  - carregando: "esqueleto" pulsando (respeita menos movimento);
 *  - vazio: ícone + frase + uma ação clara;
 *  - erro: mensagem legível + "Tentar de novo".
 *
 * `superficie` escolhe o fundo e as cores do texto:
 *  - "vidro"   → cartão bp-glass (Início, Perfil, Documentos);
 *  - "marinho" → cartão bp-glass-marinho (seção de exames, texto branco);
 *  - "janela"  → cartão dentro das janelas (cancelar, reembolso…);
 *  - "solto"   → sem cartão (o pai já tem fundo).
 */
export type Superficie = "vidro" | "marinho" | "janela" | "solto";

const FUNDO: Record<Superficie, string> = {
  vidro: "bp-glass",
  marinho: "bp-glass-marinho text-white",
  janela: "bpp-sheet-cartao border bpp-sheet-borda",
  solto: "",
};
const SUAVE: Record<Superficie, string> = {
  vidro: "text-bion-ink/75 dark:text-bion-paper/75",
  marinho: "text-white/80",
  janela: "bpp-sheet-suave",
  solto: "text-bion-ink/75 dark:text-bion-paper/75",
};
const FORTE: Record<Superficie, string> = {
  vidro: "text-bion-ink dark:text-bion-paper",
  marinho: "text-white",
  janela: "bpp-sheet-forte",
  solto: "text-bion-ink dark:text-bion-paper",
};
const ICONE: Record<Superficie, string> = {
  vidro: "bg-bion-sea/10 text-bion-sea dark:bg-sky-400/10 dark:text-sky-300",
  marinho: "bg-white/15 text-white",
  janela: "bpp-sheet-chip bpp-sheet-forte",
  solto: "bg-bion-sea/10 text-bion-sea dark:bg-sky-400/10 dark:text-sky-300",
};

export function Esqueleto({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`bpp-esqueleto block ${className}`} />;
}

export function EstadoCarregando({
  texto,
  linhas = 2,
  superficie = "vidro",
  className = "",
}: {
  texto: string;
  linhas?: number;
  superficie?: Superficie;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={`${FUNDO[superficie]} rounded-2xl p-4 ${className}`}>
      <span className="sr-only">{texto}</span>
      <div className="flex items-center gap-3">
        <Esqueleto className="w-10 h-10 !rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Esqueleto className="h-3.5 w-2/3" />
          {Array.from({ length: Math.max(0, linhas - 1) }, (_, i) => (
            <Esqueleto key={i} className={`h-3 ${i % 2 ? "w-1/3" : "w-1/2"}`} />
          ))}
        </div>
      </div>
      <p aria-hidden className={`mt-3 text-xs font-semibold ${SUAVE[superficie]}`}>{texto}</p>
    </div>
  );
}

export function EstadoVazio({
  icone,
  titulo,
  texto,
  acao,
  superficie = "vidro",
  className = "",
}: {
  icone: ReactNode;
  titulo: string;
  texto?: string;
  acao?: { rotulo: string; onClick: () => void; icone?: ReactNode };
  superficie?: Superficie;
  className?: string;
}) {
  return (
    <div className={`${FUNDO[superficie]} rounded-2xl p-5 flex flex-col items-center text-center ${className}`}>
      <span aria-hidden className={`w-12 h-12 rounded-2xl inline-flex items-center justify-center ${ICONE[superficie]}`}>
        {icone}
      </span>
      <p className={`mt-3 text-sm font-bold ${FORTE[superficie]}`}>{titulo}</p>
      {texto ? <p className={`mt-1 text-sm leading-relaxed ${SUAVE[superficie]}`}>{texto}</p> : null}
      {acao ? (
        <button
          type="button"
          onClick={acao.onClick}
          className={`bpp-toque mt-4 min-h-11 px-5 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 ${
            superficie === "janela" ? "bpp-sheet-primario" : superficie === "marinho" ? "bg-white text-bion-ink" : "bp-acao"
          }`}
        >
          {acao.icone}
          {acao.rotulo}
        </button>
      ) : null}
    </div>
  );
}

export function EstadoErro({
  texto,
  detalhe,
  onTentarDeNovo,
  superficie = "vidro",
  className = "",
}: {
  texto: string;
  detalhe?: string;
  onTentarDeNovo?: () => void;
  superficie?: Superficie;
  className?: string;
}) {
  return (
    <div role="alert" className={`${FUNDO[superficie]} rounded-2xl p-4 border border-red-500/30 ${className}`}>
      <p className="text-sm font-bold inline-flex items-start gap-2 text-red-800 dark:text-red-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {texto}
      </p>
      {detalhe ? <p className={`text-xs mt-1 ${SUAVE[superficie]}`}>{detalhe}</p> : null}
      {onTentarDeNovo ? (
        <button
          type="button"
          onClick={onTentarDeNovo}
          className={`bpp-toque mt-3 min-h-11 px-4 rounded-full text-sm font-bold inline-flex items-center gap-2 ${
            superficie === "janela" ? "bpp-sheet-chip bpp-sheet-forte" : "bg-bion-ink/8 text-bion-ink dark:bg-white/10 dark:text-bion-paper"
          }`}
        >
          <RefreshCw className="w-4 h-4" aria-hidden /> Tentar de novo
        </button>
      ) : null}
    </div>
  );
}
