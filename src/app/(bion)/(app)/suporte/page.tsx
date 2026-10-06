"use client";

import { Suspense } from "react";
import { ChamadosSuporte } from "@/components/bion/ChamadosSuporte";
import { SuporteModulo } from "@/components/bion/admin/suporte/SuporteModulo";
import { PacienteFrame } from "@/components/bion/paciente/PacienteFrame";
import { useBion } from "@/lib/bion-store";

export default function PaginaSuporte() {
  const { sessao } = useBion();
  // Admin: visão própria no visual Torre BION (o ChamadosSuporte compartilhado não muda).
  if (sessao.role === "admin") {
    return (
      <Suspense fallback={null}>
        <SuporteModulo />
      </Suspense>
    );
  }
  if (sessao.role === "paciente") {
    return (
      <PacienteFrame titulo="Suporte">
        <ChamadosSuporte />
      </PacienteFrame>
    );
  }
  return <ChamadosSuporte />;
}
