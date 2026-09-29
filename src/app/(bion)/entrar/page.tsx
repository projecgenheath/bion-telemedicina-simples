"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { Login } from "@/components/bion/telas/Login";
import { TelaCarregando } from "@/components/bion/brand";

export default function PaginaEntrar() {
  const { autenticado, carregando, sessao } = useBion();
  const router = useRouter();

  useEffect(() => {
    if (carregando || !autenticado) return;
    router.replace(sessao.role === "paciente" ? "/paciente" : "/painel");
  }, [carregando, autenticado, sessao.role, router]);

  if (carregando) return <TelaCarregando />;
  if (autenticado) return <TelaCarregando texto="Redirecionando..." />;
  return <Login />;
}
