"use client";

import { useBion } from "@/lib/bion-store";
import { Receitas } from "@/components/bion/Receitas";

export default function PaginaReceitas() {
  const { sessao } = useBion();
  return <Receitas perfil={sessao.role === "medico" ? "medico" : "paciente"} />;
}
