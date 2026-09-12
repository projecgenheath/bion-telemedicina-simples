"use client";

import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { Consulta } from "@/components/bion/Consulta";

export default function PaginaConsulta() {
  const router = useRouter();
  const { sessao } = useBion();
  return (
    <Consulta
      role={sessao.role}
      onEnd={() =>
        router.replace(
          sessao.role === "paciente" ? "/painel?pos-consulta=1" : "/painel",
        )
      }
    />
  );
}
