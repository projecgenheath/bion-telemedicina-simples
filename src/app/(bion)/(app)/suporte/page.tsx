"use client";

import { ChamadosSuporte } from "@/components/bion/ChamadosSuporte";
import { PacienteFrame } from "@/components/bion/paciente/PacienteFrame";
import { useBion } from "@/lib/bion-store";

export default function PaginaSuporte() {
  const { sessao } = useBion();
  if (sessao.role === "paciente") {
    return (
      <PacienteFrame titulo="Suporte">
        <ChamadosSuporte />
      </PacienteFrame>
    );
  }
  return <ChamadosSuporte />;
}
