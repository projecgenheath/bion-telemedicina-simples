"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { RepassesModulo } from "@/components/bion/admin/repasses/RepassesModulo";

/** Repasses aos médicos (só admin; a rota também está em SO_ADMIN em rotas.ts). */
export default function PaginaAdminRepasses() {
  const { sessao } = useBion();
  // Defesa extra: CNPJ e chave PIX completos só aparecem para o admin.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <RepassesModulo />
    </Suspense>
  );
}
