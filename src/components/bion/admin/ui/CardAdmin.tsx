import type { ComponentType, ReactNode } from "react";
import type { Tom } from "../rotulos";
import "../admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/**
 * Card de vidro do admin. `tom` acende a faixa de estado à esquerda
 * (o texto do estado deve vir junto, ex.: um ChipEstado). `denso` reduz
 * raio e espaçamento (desktop / listas longas).
 */
export function CardAdmin({
  titulo,
  icone: IconeTitulo,
  acao,
  tom,
  denso = false,
  className = "",
  children,
  ...resto
}: {
  titulo?: ReactNode;
  icone?: Icone;
  acao?: ReactNode;
  tom?: Tom;
  denso?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={`ba-card ${className}`} data-tom={tom} data-denso={denso || undefined} {...resto}>
      {titulo || acao ? (
        <header className="flex items-center justify-between gap-3 mb-3">
          {titulo ? (
            <h3 className="ba-rotulo inline-flex items-center gap-1.5 min-w-0">
              {IconeTitulo ? <IconeTitulo className="w-4 h-4 shrink-0" aria-hidden /> : null}
              <span className="truncate">{titulo}</span>
            </h3>
          ) : (
            <span />
          )}
          {acao ? <div className="shrink-0">{acao}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Indicador numérico (KPI) dentro de um card. */
export function KpiAdmin({
  rotulo,
  valor,
  detalhe,
  tom,
  icone: IconeKpi,
  carregando = false,
  onAbrir,
  denso = false,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: Tom;
  icone?: Icone;
  carregando?: boolean;
  /** Torna o card inteiro clicável (abre o módulo/fila correspondente). */
  onAbrir?: () => void;
  denso?: boolean;
}) {
  const conteudo = (
    <>
      <div className="ba-rotulo inline-flex items-center gap-1.5">
        {IconeKpi ? <IconeKpi className="w-4 h-4" aria-hidden /> : null}
        {rotulo}
      </div>
      {carregando ? (
        <div className="ba-esqueleto h-9 w-20 mt-2" aria-hidden />
      ) : (
        <div
          className={`ba-numero mt-1 ${denso ? "text-2xl" : "text-4xl"}`}
          style={tom && tom !== "neutro" ? { color: "var(--ba-tom)" } : undefined}
          data-tom={tom}
        >
          {valor}
        </div>
      )}
      {detalhe ? <div className="text-xs ba-texto-2 mt-1">{detalhe}</div> : null}
      {carregando ? <span className="sr-only">Carregando {rotulo}…</span> : null}
    </>
  );
  if (onAbrir) {
    return (
      <button type="button" onClick={onAbrir} className="ba-card" data-tom={tom} data-denso={denso || undefined} aria-busy={carregando}>
        {conteudo}
      </button>
    );
  }
  return (
    <div className="ba-card" data-tom={tom} data-denso={denso || undefined} aria-busy={carregando}>
      {conteudo}
    </div>
  );
}
