"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import type { Consulta } from "@/lib/bion-tipos";
import { poppinsPaciente } from "./fonte-paciente";

const FOCAVEIS = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ações da consulta que saíram do cartão azul (rodada 2): o cartão fica como
 * na ref. 03/12 — um botão largo e um quadrado ao lado — e o quadrado abre
 * este menu com Pagar (quando há pagamento pendente), Remarcar e Cancelar.
 * Celular: folha que sobe da borda de baixo. Computador: menu junto ao botão.
 * Teclado: abre com o foco no primeiro item, Tab fica dentro, Esc fecha e
 * devolve o foco ao botão que abriu.
 */
export function MenuConsulta({
  consulta,
  ancora,
  pagar,
  onRemarcar,
  onCancelar,
  onFechar,
}: {
  consulta: Consulta;
  ancora: HTMLElement | null;
  pagar: ReactNode;
  onRemarcar: () => void;
  onCancelar: () => void;
  onFechar: () => void;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const tituloId = `bp2-menu-${consulta.id}`;
  // O botão de pagar decide sozinho se aparece (carregando / checkout desligado).
  const pagarRef = useRef<HTMLDivElement>(null);
  const [pagarVazio, setPagarVazio] = useState(false);
  useEffect(() => {
    const el = pagarRef.current;
    if (!el) return;
    let focado = false;
    const ver = () => {
      setPagarVazio(el.childElementCount === 0);
      // Quando o botão de pagar chega depois de abrir, ele vira o primeiro foco
      // (só se a pessoa ainda não saiu do primeiro item).
      const b = el.querySelector<HTMLElement>("button:not([disabled])");
      const primeiro = painelRef.current?.querySelector(".bp2-folha-item");
      if (b && !focado && document.activeElement === primeiro) {
        focado = true;
        b.focus();
      }
    };
    ver();
    const mo = new MutationObserver(ver);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [pagar]);

  useLayoutEffect(() => {
    const largo = window.matchMedia("(min-width: 1024px)");
    const medir = () => {
      if (!largo.matches || !ancora) return setPos(null);
      const r = ancora.getBoundingClientRect();
      const right = Math.max(12, window.innerWidth - r.right);
      const altura = painelRef.current?.offsetHeight ?? 240;
      if (r.bottom + 8 + altura > window.innerHeight - 12) setPos({ bottom: window.innerHeight - r.top + 8, right });
      else setPos({ top: r.bottom + 8, right });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    largo.addEventListener("change", medir);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      largo.removeEventListener("change", medir);
    };
  }, [ancora]);

  useEffect(() => {
    const painel = painelRef.current;
    // Foco na primeira ação (Pagar, ou Remarcar), não no "Fechar".
    (painel?.querySelector<HTMLElement>(".bp2-folha-pagar button:not([disabled]), .bp2-folha-item") ?? painel?.querySelector<HTMLElement>(FOCAVEIS))?.focus();
    return () => {
      if (ancora?.isConnected) ancora.focus();
    };
  }, [ancora]);

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key !== "Tab") return;
    const itens = Array.from(painelRef.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);
    if (!itens.length) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`bp2-app bp2-folha-raiz ${poppinsPaciente.variable}`}>
      <div className="bp2-folha-fundo" aria-hidden onClick={onFechar} />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onKeyDown={aoTeclar}
        className="bp2-folha bp2-v2 bp2-inicio"
        style={pos ? { top: pos.top, bottom: pos.bottom, right: pos.right } : undefined}
      >
        <span aria-hidden className="bp2-folha-alca" />
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h2 id={tituloId} className="truncate text-[15px] font-medium">
              {consulta.especialidade} com {consulta.medico}
            </h2>
            <p className="bp2-t-2 text-xs">
              {consulta.data} às {consulta.hora}
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="bp2-folha-fechar grid h-9 w-9 shrink-0 place-items-center rounded-full">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {pagar ? (
            <>
              <div ref={pagarRef} className="bp2-folha-pagar">
                {pagar}
              </div>
              {pagarVazio ? (
                <p role="status" className="bp2-folha-aviso rounded-[14px] px-3 py-2.5 text-xs">
                  Carregando o pagamento… Se não aparecer em instantes, feche e abra de novo.
                </p>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="bp2-folha-item"
            onClick={() => {
              onFechar();
              onRemarcar();
            }}
          >
            <span className="bp2-folha-icone" aria-hidden>
              <RefreshCw className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Remarcar consulta</span>
              <span className="bp2-t-2 block text-xs">Escolher outro dia ou horário</span>
            </span>
          </button>
          <button
            type="button"
            className="bp2-folha-item"
            onClick={() => {
              onFechar();
              onCancelar();
            }}
          >
            <span className="bp2-folha-icone bp2-folha-icone-perigo" aria-hidden>
              <X className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Cancelar consulta</span>
              <span className="bp2-t-2 block text-xs">Você confirma na próxima tela</span>
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
