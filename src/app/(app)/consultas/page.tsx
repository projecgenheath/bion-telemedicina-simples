"use client";

import { useBion } from "@/lib/bion-store";
import { AgendaConsultas } from "@/components/bion/AgendaConsultas";

export default function PaginaConsultas() {
  const { sessao } = useBion();
  const perfil = sessao.role === "medico" ? "medico" : "paciente";
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {perfil === "medico" ? "Minha Agenda de Teleconsultas" : "Minhas Consultas"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {perfil === "medico"
            ? "Acompanhe seus horários, remarcações e pacientes confirmados."
            : "Gerencie suas consultas agendadas, cancele ou remarque quando necessário."}
        </p>
      </div>
      <AgendaConsultas perfil={perfil} />
    </div>
  );
}
