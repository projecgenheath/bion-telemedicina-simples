"use client";

import { useBion } from "@/lib/bion-store";
import { PrivacidadeAdmin } from "@/components/bion/PrivacidadeAdmin";
import { PrivacidadePaciente } from "@/components/bion/PrivacidadePaciente";
import { PacienteFrame } from "@/components/bion/paciente/PacienteFrame";

export default function PaginaPrivacidade() {
  const { sessao } = useBion();
  if (sessao.role === "admin") return <PrivacidadeAdmin />;
  if (sessao.role === "paciente") {
    return (
      <PacienteFrame titulo="Termos e privacidade">
        <PrivacidadePaciente />
      </PacienteFrame>
    );
  }
  return <PrivacidadePaciente />;
}
