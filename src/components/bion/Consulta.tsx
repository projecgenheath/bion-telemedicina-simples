"use client";

import { RedirecionaAdminSala } from "@/components/bion/admin/RedirecionaAdminSala";
import { ChamadaMedico } from "@/components/bion/medico/ChamadaMedico";
import { ChamadaPaciente } from "@/components/bion/paciente/ChamadaPaciente";

type Role = "paciente" | "medico" | "admin";

/**
 * Roteador da sala de teleconsulta por papel. A tela do médico fica em
 * medico/ChamadaMedico.tsx e a do paciente em paciente/ChamadaPaciente.tsx;
 * o admin não entra na sala (sem câmera, sem polling/ICE) e vai para o
 * detalhe da consulta em Agendamentos. O estado comum fica em
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
  if (role === "admin") return <RedirecionaAdminSala consultaId={consultaId} />;
  if (role === "medico") return <ChamadaMedico onEnd={onEnd} consultaId={consultaId} />;
  return <ChamadaPaciente onEnd={onEnd} consultaId={consultaId} />;
}
