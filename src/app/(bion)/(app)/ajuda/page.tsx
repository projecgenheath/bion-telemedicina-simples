"use client";

import { useBion } from "@/lib/bion-store";
import { Ajuda } from "@/components/bion/Ajuda";
import { PacienteFrame } from "@/components/bion/paciente/PacienteFrame";

export default function PaginaAjuda() {
  const { sessao } = useBion();
  if (sessao.role === "paciente") {
    return (
      <PacienteFrame titulo="Ajuda">
        <Ajuda perfil="paciente" />
      </PacienteFrame>
    );
  }
  return <Ajuda perfil={sessao.role} />;
}
