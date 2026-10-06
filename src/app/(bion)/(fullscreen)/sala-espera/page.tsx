"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";

/**
 * A pré-sala (sala de espera) foi removida: o paciente entra direto na sala
 * pelo botão "Entrar na sala", liberado 30 min antes do horário.
 * Esta rota só existe para não quebrar links antigos:
 *  - /sala-espera?consulta=<id> → /consulta?consulta=<id>
 *  - /sala-espera               → /paciente (ou /painel para médico/admin)
 */

/** Mesmo critério de app/(bion)/(fullscreen)/consulta/page.tsx (cuid/uuid). */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

function Redirecionar() {
  const router = useRouter();
  const { sessao } = useBion();
  const pedido = useSearchParams().get("consulta");
  const consultaId = pedido && ID_VALIDO.test(pedido) ? pedido : null;

  useEffect(() => {
    if (consultaId) router.replace(`/consulta?consulta=${encodeURIComponent(consultaId)}`);
    else router.replace(sessao.role === "paciente" ? "/paciente" : "/painel");
  }, [consultaId, sessao.role, router]);

  return <TelaCarregando texto="Abrindo…" />;
}

export default function PaginaSalaEspera() {
  return (
    <Suspense fallback={<TelaCarregando texto="Abrindo…" />}>
      <Redirecionar />
    </Suspense>
  );
}
