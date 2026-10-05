"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { PacientesModulo } from "@/components/bion/admin/pacientes/PacientesModulo";

/** Pacientes do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAdminPacientes() {
  const { sessao } = useBion();
  // Defesa extra além do redirecionamento do layout.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <PacientesModulo />
    </Suspense>
  );
}
