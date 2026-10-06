"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { PrivacidadeModulo } from "@/components/bion/admin/lgpd/PrivacidadeModulo";
import { PrivacidadePaciente } from "@/components/bion/PrivacidadePaciente";
import { PacienteFrame } from "@/components/bion/paciente/PacienteFrame";

export default function PaginaPrivacidade() {
  const { sessao } = useBion();
  // Admin: Privacidade & LGPD no visual Torre BION (PrivacidadeAdmin fica sem uso, não apagado).
  if (sessao.role === "admin") {
    return (
      <Suspense fallback={null}>
        <PrivacidadeModulo />
      </Suspense>
    );
  }
  if (sessao.role === "paciente") {
    return (
      <PacienteFrame titulo="Termos e privacidade">
        <PrivacidadePaciente />
      </PacienteFrame>
    );
  }
  return <PrivacidadePaciente />;
}
