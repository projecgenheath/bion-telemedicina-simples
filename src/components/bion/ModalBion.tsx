"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

type ModalBionProps = {
  /** Modal aberto? */
  aberto: boolean;
  /** Chamado ao fechar (ESC, clique fora quando habilitado, botão fechar) */
  onFechar: () => void;
  /** Título acessível (lido por leitores de tela; renderizado sr-only) */
  titulo: string;
  /** Descrição acessível opcional (sr-only) */
  descricao?: string;
  /** Classe max-w-* do conteúdo no modo centrado (ex.: "max-w-md") */
  largura?: string;
  /** Bottom-sheet no celular (sobe do rodapé); centrado a partir do breakpoint */
  sheet?: boolean;
  /** Breakpoint em que deixa de ser bottom-sheet (padrão "sm") */
  sheetAte?: "sm" | "md";
  /** Classes do overlay (ex.: "bg-black/60 backdrop-blur-sm") */
  overlay?: string;
  /** Fecha ao clicar no overlay (padrão: true) */
  foraFecha?: boolean;
  /** Classes extras no container do conteúdo */
  className?: string;
  children: React.ReactNode;
};

/**
 * Modal do design system BION — wrapper sobre o Radix Dialog.
 * Dá de graça: focus trap, fechamento por ESC, aria-modal/role=dialog,
 * trava de interação de fundo e devolução de foco ao fechar.
 * O card visual (bg-card rounded-3xl etc.) continua no children,
 * preservando o layout existente.
 */
export function ModalBion({
  aberto,
  onFechar,
  titulo,
  descricao,
  largura = "max-w-lg",
  sheet = false,
  sheetAte = "sm",
  overlay = "bg-black/60 backdrop-blur-sm",
  foraFecha = true,
  className,
  children,
}: ModalBionProps) {
  return (
    <DialogPrimitive.Root
      open={aberto}
      onOpenChange={(o) => {
        if (!o) onFechar();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50", overlay)} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if (!foraFecha) e.preventDefault();
          }}
          className={cn(
            "z-50 outline-none",
            sheet
              ? cn(
                  "fixed inset-x-0 bottom-0 w-full",
                  sheetAte === "md"
                    ? "md:bottom-auto md:right-auto md:top-1/2 md:left-1/2 md:w-full md:-translate-x-1/2 md:-translate-y-1/2"
                    : "sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2",
                  largura,
                )
              : cn(
                  "fixed left-1/2 top-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
                  largura,
                ),
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{titulo}</DialogPrimitive.Title>
          {descricao ? (
            <DialogPrimitive.Description className="sr-only">
              {descricao}
            </DialogPrimitive.Description>
          ) : null}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
