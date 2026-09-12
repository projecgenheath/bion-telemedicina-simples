"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { AdminDashboard, MedicoDashboard, PacienteDashboard } from "@/components/bion/telas/Dashboards";
import { PosConsultaModal } from "@/components/bion/PosConsultaModal";
import { urlDa, type View } from "@/lib/rotas";

function ConteudoPainel() {
  const { sessao } = useBion();
  const router = useRouter();
  const parametros = useSearchParams();
  const go = (v: View) => router.push(urlDa(v));
  const posConsulta = parametros.get("pos-consulta") === "1";

  return (
    <>
      {sessao.role === "paciente" && <PacienteDashboard go={go} />}
      {sessao.role === "medico" && <MedicoDashboard go={go} />}
      {sessao.role === "admin" && <AdminDashboard go={go} />}

      {posConsulta && (
        <PosConsultaModal
          medico="Dra. Ana Ribeiro"
          especialidade="Clínica Geral"
          onClose={() => router.replace("/painel")}
        />
      )}
    </>
  );
}

export default function PaginaPainel() {
  return (
    <Suspense fallback={null}>
      <ConteudoPainel />
    </Suspense>
  );
}
