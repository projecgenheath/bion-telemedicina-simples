"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { AdminDashboard } from "@/components/bion/telas/Dashboards";
import { TelaCarregando } from "@/components/bion/brand";
import { PosConsultaModal } from "@/components/bion/PosConsultaModal";
import { urlDa, type View } from "@/lib/rotas";

function ConteudoPainel() {
  const { sessao } = useBion();
  const router = useRouter();
  const parametros = useSearchParams();
  const go = (v: View) => router.push(urlDa(v));
  const posConsulta = parametros.get("pos-consulta") === "1";
  // Paciente e médico têm app imersivo próprio em fullscreen; o painel
  // clássico do médico foi removido (não há mais ?legado=1).
  const temAppProprio = sessao.role === "paciente" || sessao.role === "medico";

  useEffect(() => {
    if (sessao.role === "paciente") router.replace("/paciente");
    else if (sessao.role === "medico") router.replace("/medico");
  }, [sessao.role, router]);

  if (temAppProprio) {
    return <TelaCarregando texto="Abrindo seu app…" />;
  }

  return (
    <>
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
