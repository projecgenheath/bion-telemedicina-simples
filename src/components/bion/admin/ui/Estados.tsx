import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { Tom } from "../rotulos";
import "../admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Estado vazio: ícone em círculo + frase humana + ação opcional. */
export function EstadoVazio({
  icone: IconeVazio = Inbox,
  titulo,
  texto,
  acao,
  tom = "sinal",
}: {
  icone?: Icone;
  titulo: string;
  texto?: ReactNode;
  acao?: ReactNode;
  tom?: Tom;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10" role="status">
      <span className="ba-estado-icone" data-tom={tom}>
        <IconeVazio className="w-6 h-6" aria-hidden />
      </span>
      <p className="mt-4 text-base font-bold">{titulo}</p>
      {texto ? <p className="mt-1 text-sm ba-texto-2 max-w-sm">{texto}</p> : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

/** Erro com a mensagem (do servidor, quando houver) e "Tentar de novo". */
export function EstadoErro({
  titulo = "Não foi possível carregar",
  mensagem,
  onTentar,
}: {
  titulo?: string;
  mensagem?: string | null;
  onTentar?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10" role="alert">
      <span className="ba-estado-icone" data-tom="critico">
        <AlertTriangle className="w-6 h-6" aria-hidden />
      </span>
      <p className="mt-4 text-base font-bold">{titulo}</p>
      {mensagem ? <p className="mt-1 text-sm ba-texto-2 max-w-sm">{mensagem}</p> : null}
      {onTentar ? (
        <button type="button" onClick={onTentar} className="ba-botao ba-botao-secundario mt-4">
          <RefreshCw className="w-4 h-4" aria-hidden /> Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

/** Esqueleto com a forma do conteúdo (cards, lista ou KPIs). */
export function Esqueleto({
  variante = "lista",
  quantidade = 3,
  rotulo = "Carregando…",
}: {
  variante?: "lista" | "cards" | "kpis" | "tabela";
  quantidade?: number;
  rotulo?: string;
}) {
  const itens = Array.from({ length: quantidade });
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{rotulo}</span>
      {variante === "kpis" ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden>
          {itens.map((_, i) => (
            <div key={i} className="ba-card" data-denso="true">
              <div className="ba-esqueleto h-3 w-20" />
              <div className="ba-esqueleto h-8 w-16 mt-3" />
            </div>
          ))}
        </div>
      ) : variante === "tabela" ? (
        <div className="ba-card p-0 overflow-hidden" data-denso="true" aria-hidden>
          <div className="ba-esqueleto h-9 rounded-none" />
          {itens.map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              <div className="ba-esqueleto h-4 w-16" />
              <div className="ba-esqueleto h-4 flex-1" />
              <div className="ba-esqueleto h-4 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className={variante === "cards" ? "grid sm:grid-cols-2 xl:grid-cols-3 gap-3" : "space-y-3"} aria-hidden>
          {itens.map((_, i) => (
            <div key={i} className="ba-card">
              <div className="flex items-center gap-3">
                <div className="ba-esqueleto h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="ba-esqueleto h-4 w-2/3" />
                  <div className="ba-esqueleto h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
