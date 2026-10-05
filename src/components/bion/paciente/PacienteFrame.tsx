"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import "./paciente.css";

/** Moldura sem AppShell para telas abertas a partir do app do paciente. */
export function PacienteFrame({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="bp-app-paciente min-h-dvh bp-painel text-bion-ink dark:text-bion-paper">
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 border-b border-bion-ink/10 dark:border-white/10 bg-white/85 dark:bg-black/80 backdrop-blur">
        <button
          type="button"
          onClick={() => router.replace("/paciente?tela=perfil")}
          className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/8 dark:bg-white/10"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">{titulo}</h1>
      </header>
      <div className="p-4 max-w-2xl mx-auto">{children}</div>
    </div>
  );
}
