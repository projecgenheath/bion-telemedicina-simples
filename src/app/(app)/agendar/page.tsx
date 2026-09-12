"use client";

import { useRouter } from "next/navigation";
import { AgendamentoFluxo } from "@/components/bion/AgendamentoFluxo";

export default function PaginaAgendar() {
  const router = useRouter();
  return (
    <AgendamentoFluxo
      onDone={() => router.push("/painel")}
      onGoToWaitingRoom={() => router.push("/sala-espera")}
    />
  );
}
