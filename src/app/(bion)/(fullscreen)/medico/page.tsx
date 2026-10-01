"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { MedicoApp } from "@/components/bion/medico/MedicoApp";

/**
 * App imersivo do MÉDICO (fullscreen). O layout (fullscreen) só garante
 * autenticação; o papel é conferido aqui. A versão clássica continua em
 * /painel?legado=1.
 */
export default function PaginaMedico() {
  const { sessao } = useBion();
  const router = useRouter();
  const ehMedico = sessao.role === "medico";

  useEffect(() => {
    if (!ehMedico) router.replace(sessao.role === "paciente" ? "/paciente" : "/painel");
  }, [ehMedico, sessao.role, router]);

  if (!ehMedico) return <TelaCarregando texto="Redirecionando…" />;
  return <MedicoApp />;
}
