"use client";

import { useBion } from "@/lib/bion-store";
import { Ajuda } from "@/components/bion/Ajuda";
import { AjudaModulo } from "@/components/bion/admin/conta/AjudaModulo";
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
  // Admin: Ajuda no visual Torre BION.
  if (sessao.role === "admin") return <AjudaModulo />;
  return <Ajuda perfil={sessao.role} />;
}
