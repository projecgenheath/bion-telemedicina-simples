"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { CentroComando } from "@/components/bion/admin/comando/CentroComando";
import { TelaCarregando } from "@/components/bion/brand";

function ConteudoPainel() {
  const { sessao } = useBion();
  const router = useRouter();
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

  // A14: o antigo modal pós-consulta (?pos-consulta=1) foi removido — era um
  // fluxo órfão (paciente/médico são redirecionados acima e nenhuma tela
  // gerava o link) montado com dados fabricados: médica e especialidade
  // fixas, documentos "da consulta" sem vínculo e retorno inventado de
  // 30 dias. Um resumo pós-consulta real é decisão de produto nova.
  return <>{sessao.role === "admin" && <CentroComando />}</>;
}

export default function PaginaPainel() {
  return (
    <Suspense fallback={null}>
      <ConteudoPainel />
    </Suspense>
  );
}
