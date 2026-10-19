"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import "./admin.css";

/**
 * O admin não entra na sala de teleconsulta: sem câmera, sem polling e sem ICE.
 * Leva para o detalhe da consulta em Agendamentos (ou a lista, se não houver id).
 */
export function RedirecionaAdminSala({ consultaId }: { consultaId?: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(
      consultaId
        ? `/admin-agendamentos?consulta=${encodeURIComponent(consultaId)}`
        : "/admin-agendamentos",
    );
  }, [router, consultaId]);

  return (
    <div className="ba-app ba-ceu flex items-center justify-center" role="status" aria-live="polite">
      <div className="ba-card text-center max-w-sm mx-4">
        <p className="text-base font-bold">Abrindo a consulta no painel…</p>
        <p className="mt-1 text-sm ba-texto-2">Você será levado para Agendamentos.</p>
      </div>
    </div>
  );
}
