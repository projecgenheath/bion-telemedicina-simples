"use client";

import { ChamadaMedico } from "@/components/bion/medico/ChamadaMedico";
import { ChamadaPaciente } from "@/components/bion/paciente/ChamadaPaciente";

type Role = "paciente" | "medico" | "admin";

/**
 * Roteador da sala de teleconsulta por papel. A tela do médico fica em
 * medico/ChamadaMedico.tsx e a do paciente (também usada pelo admin) em
 * paciente/ChamadaPaciente.tsx; o estado comum fica em
 * consulta/useSalaConsulta.ts e o layout em consulta/SalaConsultaTela.tsx.
 */
export function Consulta({
  onEnd,
  role,
  consultaId,
}: {
  onEnd: () => void;
  role: Role;
  /** `?consulta=<id>` da URL: a sala é DESTA consulta. Sem ele, adivinha (links antigos). */
  consultaId?: string;
}) {
  if (role === "medico") return <ChamadaMedico onEnd={onEnd} consultaId={consultaId} />;
  return <ChamadaPaciente onEnd={onEnd} role={role} consultaId={consultaId} />;
}
