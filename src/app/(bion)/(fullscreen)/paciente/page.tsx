"use client";

import { PacienteApp } from "@/components/bion/paciente/PacienteApp";

/**
 * App imersivo do paciente (fullscreen): rolagem vertical em 3 seções
 * (início, saúde, exames) + painéis laterais por gesto (perfil e documentos).
 */
export default function PaginaPaciente() {
  return <PacienteApp />;
}
