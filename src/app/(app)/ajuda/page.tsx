"use client";

import { useBion } from "@/lib/bion-store";
import { Ajuda } from "@/components/bion/Ajuda";

export default function PaginaAjuda() {
  const { sessao } = useBion();
  return <Ajuda perfil={sessao.role} />;
}
