"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { LlmModulo } from "@/components/bion/admin/llm/LlmModulo";

/** Monitor LLM do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaLlmMonitor() {
  const { sessao } = useBion();
  // Defesa extra além do redirecionamento do layout.
  if (sessao.role !== "admin") return null;
  return (
    <Suspense fallback={null}>
      <LlmModulo />
    </Suspense>
  );
}
