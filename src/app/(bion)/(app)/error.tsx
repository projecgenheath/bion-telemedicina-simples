"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BION] erro na área autenticada:", error?.digest ?? error?.message);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="text-center space-y-5 max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" aria-hidden />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-extrabold text-foreground">
            Não foi possível carregar esta tela
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ocorreu um erro inesperado. Você pode tentar de novo ou voltar ao
            painel principal.
          </p>
          {error?.digest ? (
            <p className="text-xs text-muted-foreground font-mono">Ref: {error.digest}</p>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition"
          >
            Tentar de novo
          </button>
          <Link
            href="/painel"
            className="px-6 py-3 rounded-2xl border font-bold text-sm hover:bg-muted transition"
          >
            Ir ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}
