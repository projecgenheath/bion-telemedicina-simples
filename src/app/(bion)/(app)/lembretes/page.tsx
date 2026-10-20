"use client";

import { useBion } from "@/lib/bion-store";
import { Lembretes } from "@/components/bion/telas/Lembretes";
import { LembretesModulo } from "@/components/bion/admin/conta/LembretesModulo";

export default function PaginaLembretes() {
  const { sessao } = useBion();
  // Admin: Lembretes no visual Torre BION.
  if (sessao.role === "admin") return <LembretesModulo />;
  return <Lembretes />;
}
