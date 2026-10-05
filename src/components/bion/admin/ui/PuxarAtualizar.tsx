"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import "../admin.css";

const DISPARO = 64; // px de puxada (já com resistência) para atualizar
const MAXIMO = 96;

/**
 * Contêiner rolável com "puxar para atualizar" (toque). O navegador não
 * dispara o próprio pull-to-refresh porque a coluna usa
 * overscroll-behavior-y: contain. Alternativa por botão: o "Atualizar"
 * do TelaModulo.
 */
export function PuxarAtualizar({
  onAtualizar,
  children,
  className = "",
  rotulo = "Conteúdo",
}: {
  onAtualizar: () => Promise<unknown> | void;
  children: ReactNode;
  className?: string;
  rotulo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inicio = useRef<number | null>(null);
  const [puxada, setPuxada] = useState(0);
  const [atualizando, setAtualizando] = useState(false);

  const aoTocar = (e: React.TouchEvent) => {
    if (atualizando || (ref.current?.scrollTop ?? 0) > 0) return;
    inicio.current = e.touches[0].clientY;
  };
  const aoMover = (e: React.TouchEvent) => {
    if (inicio.current == null) return;
    const dy = e.touches[0].clientY - inicio.current;
    if (dy <= 0 || (ref.current?.scrollTop ?? 0) > 0) {
      setPuxada(0);
      return;
    }
    setPuxada(Math.min(MAXIMO, dy * 0.5));
  };
  const aoSoltar = async () => {
    if (inicio.current == null) return;
    inicio.current = null;
    if (puxada >= DISPARO) {
      setAtualizando(true);
      setPuxada(48);
      try {
        await onAtualizar();
      } finally {
        setAtualizando(false);
        setPuxada(0);
      }
    } else setPuxada(0);
  };

  const texto = atualizando ? "Atualizando…" : puxada >= DISPARO ? "Solte para atualizar" : "Puxe para atualizar";

  return (
    <div
      ref={ref}
      className={`ba-coluna h-full ${className}`}
      onTouchStart={aoTocar}
      onTouchMove={aoMover}
      onTouchEnd={aoSoltar}
      onTouchCancel={aoSoltar}
      aria-busy={atualizando}
      aria-label={rotulo}
    >
      <div className="ba-puxar-anel" style={{ height: puxada, transition: inicio.current == null ? "height .2s ease" : undefined }} aria-hidden={puxada === 0}>
        {puxada > 8 ? (
          <>
            {atualizando ? (
              <RefreshCw className="w-4 h-4 motion-safe:animate-spin" aria-hidden />
            ) : (
              <ArrowDown className="w-4 h-4" style={{ transform: puxada >= DISPARO ? "rotate(180deg)" : undefined }} aria-hidden />
            )}
            {texto}
          </>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {atualizando ? "Atualizando…" : ""}
      </span>
      {children}
    </div>
  );
}
