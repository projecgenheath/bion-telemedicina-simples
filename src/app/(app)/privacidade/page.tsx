"use client";

import { useBion } from "@/lib/bion-store";
import { PrivacidadeAdmin } from "@/components/bion/PrivacidadeAdmin";
import { PrivacidadePaciente } from "@/components/bion/PrivacidadePaciente";

export default function PaginaPrivacidade() {
  const { sessao } = useBion();
  return sessao.role === "admin" ? <PrivacidadeAdmin /> : <PrivacidadePaciente />;
}
