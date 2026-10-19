"use client";

import { ConsultaNaoEncontrada, SalaConsultaTela } from "@/components/bion/consulta/SalaConsultaTela";
import { useSalaConsulta } from "@/components/bion/consulta/useSalaConsulta";

/**
 * Sala de teleconsulta do PACIENTE (movida de Consulta.tsx sem mudança
 * visual nem de comportamento). O admin usa a mesma tela, como antes.
 * O paciente só SAI da chamada (não encerra a consulta).
 */
export function ChamadaPaciente({
  onEnd,
  role = "paciente",
  consultaId,
}: {
  onEnd: () => void;
  role?: "paciente" | "admin";
  consultaId?: string;
}) {
  const sala = useSalaConsulta({ role, consultaId, onEnd });
  if (sala.tele.naoEncontrada) return <ConsultaNaoEncontrada role={role} />;
  return <SalaConsultaTela sala={sala} role={role} onEnd={onEnd} onEncerrar={sala.sairDaSala} />;
}
