"use client";

import { MensagensModulo } from "@/components/bion/admin/mensagens/MensagensModulo";
import { Mensagens } from "@/components/bion/telas/Mensagens";
import { useBion } from "@/lib/bion-store";

/** Admin vê o módulo da Torre. Paciente e médico ficam na tela compartilhada. */
export default function PaginaMensagens() {
  const { sessao } = useBion();
  if (sessao.role === "admin") return <MensagensModulo />;
  return <Mensagens />;
}
