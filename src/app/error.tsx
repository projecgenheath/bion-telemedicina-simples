"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log no console do browser para suporte; não enviar PII.
    console.error("[BION] erro de rota:", error?.digest ?? error?.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-foreground">
            Algo deu errado
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Não foi possível carregar esta página. Sua sessão e seus dados de
            saúde não foram afetados. Tente novamente ou volte ao início.
          </p>
          {error?.digest ? (
            <p className="text-xs text-muted-foreground font-mono">
              Ref: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition"
          >
            Tentar de novo
          </button>
          <Link
            href="/"
            className="px-8 py-3.5 rounded-2xl border font-bold text-sm hover:bg-muted transition"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
