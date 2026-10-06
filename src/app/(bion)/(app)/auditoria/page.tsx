"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { AuditoriaModulo } from "@/components/bion/admin/auditoria/AuditoriaModulo";

/** Auditoria do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAuditoria() {
  const { sessao } = useBion();
  // Defesa extra além do redirecionamento do layout.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <AuditoriaModulo />
    </Suspense>
  );
}
