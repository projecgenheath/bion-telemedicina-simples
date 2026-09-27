"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";

const Consulta = dynamic(
  () => import("@/components/bion/Consulta").then((m) => m.Consulta),
  {
    ssr: false,
    loading: () => <TelaCarregando texto="Preparando sala de consulta…" />,
  },
);

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
