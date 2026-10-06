"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { RelatoriosModulo } from "@/components/bion/admin/relatorios/RelatoriosModulo";

/** Relatórios do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaRelatorios() {
  const { sessao } = useBion();
  // Defesa extra além do redirecionamento do layout.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <RelatoriosModulo />
    </Suspense>
  );
}
