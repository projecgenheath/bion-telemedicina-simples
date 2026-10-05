"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { MedicosModulo } from "@/components/bion/admin/medicos/MedicosModulo";

/** Médicos do admin no visual Torre BION, com a validação real (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAdminMedicos() {
  const { sessao } = useBion();
  // Defesa extra além do redirecionamento do layout.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <MedicosModulo />
    </Suspense>
  );
}
