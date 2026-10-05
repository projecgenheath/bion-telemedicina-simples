"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { AgendamentosModulo } from "@/components/bion/admin/agendamentos/AgendamentosModulo";

/** Agendamentos do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAdminAgendamentos() {
  const { sessao } = useBion();
  // Defesa extra além do redirecionamento do layout: só o admin vê a agenda de todos.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <AgendamentosModulo />
    </Suspense>
  );
}
