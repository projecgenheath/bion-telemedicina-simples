"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";

const Consulta = dynamic(
  () => import("@/components/bion/Consulta").then((m) => m.Consulta),
  {
    ssr: false,
    loading: () => <TelaCarregando texto="Preparando sala de consulta…" />,
  },
);

/** Id de consulta aceito na URL (cuid/uuid): evita levar lixo para a rota da sala. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

function SalaConsulta() {
  const router = useRouter();
  const { sessao } = useBion();
  // `/consulta?consulta=<id>`: a sala é desta consulta. Sem o parâmetro (links
  // antigos), a sala continua escolhendo a consulta como antes.
  const pedido = useSearchParams().get("consulta");
  const consultaId = pedido && ID_VALIDO.test(pedido) ? pedido : undefined;
  return (
    <Consulta
      role={sessao.role}
      consultaId={consultaId}
      onEnd={() =>
        router.replace(
          sessao.role === "paciente" ? "/paciente" : "/painel",
        )
      }
    />
  );
}

export default function PaginaConsulta() {
  return (
    <Suspense fallback={<TelaCarregando texto="Preparando sala de consulta…" />}>
      <SalaConsulta />
    </Suspense>
  );
}
