"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tom } from "../rotulos";
import "../admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type AcaoBase = { id: string; rotulo: string; icone: Icone; tom: Tom };
/**
 * Regra do Alisson (Torre BION):
 * - `reversivel`: o gesto EXECUTA e oferece "Desfazer" por 5 s (ex.: aprovar médico, resolver chamado);
 * - `confirmar`: o gesto só ABRE a confirmação (dinheiro e ações destrutivas: cancelar consulta,
 *   negar reembolso, suspender…). Pagar repasse NUNCA entra como ação de gesto — só como item de menu
 *   que abre o fluxo de pagamento (use `extras`).
 */
export type AcaoRapida =
  | (AcaoBase & { modo: "reversivel"; executar: () => void | Promise<void>; desfazer: () => void | Promise<void> })
  | (AcaoBase & { modo: "confirmar"; executar: () => void });

const LIMIAR = 0.4; // fração da largura para disparar
const BORDA_SISTEMA = 24; // px: não briga com o "voltar" do iOS
const PRESSIONAR_MS = 500;

/**
 * Card com ações rápidas por gesto (só toque/caneta; nunca arraste de mouse,
 * que quebra o clique). Direita = positiva, esquerda = negativa.
 * Alternativa sem gesto (WCAG 2.5.1/2.5.7): botão "⋯" com as mesmas ações,
 * também aberto ao pressionar e segurar.
 */
export function CardDeslizavel({
  rotulo,
  direita,
  esquerda,
  extras = [],
  onAbrir,
  denso = false,
  tom,
  children,
}: {
  /** Nome acessível do item (ex.: "Consulta de Ana às 14:00"). */
  rotulo: string;
  direita?: AcaoRapida;
  esquerda?: AcaoRapida;
  extras?: AcaoRapida[];
  onAbrir?: () => void;
  denso?: boolean;
  tom?: Tom;
  children: ReactNode;
}) {
  const frenteRef = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number; id: number; eixo: "?" | "x" | "y"; largura: number } | null>(null);
  const arrastou = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dx, setDx] = useState(0);
  const [soltando, setSoltando] = useState(false);
  const [menu, setMenu] = useState(false);
  const [largura, setLargura] = useState(1);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const lado = dx > 0 ? "direita" : dx < 0 ? "esquerda" : null;
  const acaoVisivel = lado === "direita" ? direita : lado === "esquerda" ? esquerda : undefined;
  const passou = Math.abs(dx) >= largura * LIMIAR;

  const disparar = async (a: AcaoRapida) => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(10);
    } catch {
      /* sem vibração */
    }
    if (a.modo === "reversivel") {
      try {
        await a.executar();
        toast(`${a.rotulo}: feito`, {
          duration: 5000,
          action: { label: "Desfazer", onClick: () => void a.desfazer() },
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Não foi possível: ${a.rotulo}.`);
      }
    } else {
      a.executar();
    }
  };

  const limparTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const aoBaixar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || e.clientX < BORDA_SISTEMA) return;
    const w = frenteRef.current?.offsetWidth || 1;
    gesto.current = { x: e.clientX, y: e.clientY, id: e.pointerId, eixo: "?", largura: w };
    setLargura(w);
    arrastou.current = false;
    setSoltando(false);
    limparTimer();
    timer.current = setTimeout(() => {
      if (gesto.current?.eixo === "?") {
        arrastou.current = true;
        gesto.current = null;
        setMenu(true);
      }
    }, PRESSIONAR_MS);
  };

  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (g.eixo === "?") {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      limparTimer();
      g.eixo = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
      if (g.eixo === "x") {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ponteiro já liberado: segue sem captura */
        }
      }
    }
    if (g.eixo !== "x") return;
    arrastou.current = true;
    const temAcao = mx > 0 ? !!direita : !!esquerda;
    setDx(temAcao ? mx : mx * 0.15); // resistência quando não há ação daquele lado
  };

  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    limparTimer();
    const g = gesto.current;
    gesto.current = null;
    if (!g || g.id !== e.pointerId || g.eixo !== "x") return;
    const a = dx > 0 ? direita : dx < 0 ? esquerda : undefined;
    const disparou = a && Math.abs(dx) >= g.largura * LIMIAR;
    setSoltando(true);
    setDx(0);
    if (disparou && a) void disparar(a);
  };

  // pointercancel = o sistema assumiu o toque (rolagem, gesto do SO): nunca dispara ação.
  const aoCancelar = () => {
    limparTimer();
    gesto.current = null;
    setSoltando(true);
    setDx(0);
  };

  const todas = [direita, esquerda, ...extras].filter((a): a is AcaoRapida => Boolean(a));

  return (
    <div className="ba-deslizar" data-denso={denso || undefined} role="group" aria-label={rotulo}>
      {acaoVisivel ? (
        <div className="ba-deslizar-fundo" data-lado={lado ?? undefined} data-tom={acaoVisivel.tom} aria-hidden>
          <span className="inline-flex items-center gap-2">
            <acaoVisivel.icone className="w-5 h-5" aria-hidden />
            {passou ? `Solte para ${acaoVisivel.rotulo.toLowerCase()}` : acaoVisivel.rotulo}
          </span>
        </div>
      ) : null}
      <div
        ref={frenteRef}
        className="ba-deslizar-frente"
        data-soltando={soltando || undefined}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={aoBaixar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoCancelar}
        onContextMenu={(e) => {
          if (todas.length) {
            e.preventDefault();
            setMenu(true);
          }
        }}
      >
        <div className="ba-card pr-14" data-tom={tom} data-denso={denso || undefined}>
          {onAbrir ? (
            <div
              role="button"
              tabIndex={0}
              className="outline-none rounded-xl focus-visible:outline-2"
              onClick={() => {
                if (arrastou.current) {
                  arrastou.current = false;
                  return;
                }
                onAbrir();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAbrir();
                }
              }}
            >
              {children}
            </div>
          ) : (
            children
          )}
        </div>
        {todas.length ? (
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Ações: ${rotulo}`} className="ba-icone-botao absolute top-2 right-2 !bg-transparent">
                <MoreHorizontal className="w-5 h-5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="ba-escopo min-w-[13rem]">
              {todas.map((a) => (
                <DropdownMenuItem key={a.id} onSelect={() => void disparar(a)} className="gap-2 min-h-11 font-semibold">
                  <span data-tom={a.tom} style={{ color: "var(--ba-tom)" }} className="inline-flex">
                    <a.icone className="w-4 h-4" aria-hidden />
                  </span>
                  {a.rotulo}
                  {a.modo === "confirmar" ? <span className="ml-auto text-[11px] opacity-70">confirmar</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
