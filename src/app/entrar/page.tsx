"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { Login } from "@/components/bion/telas/Login";
import { TelaCarregando } from "@/components/bion/brand";

export default function PaginaEntrar() {
  const { autenticado, carregando } = useBion();
  const router = useRouter();

  useEffect(() => {
    if (!carregando && autenticado) router.replace("/painel");
  }, [carregando, autenticado, router]);

  if (carregando) return <TelaCarregando />;
  if (autenticado) return <TelaCarregando texto="Redirecionando..." />;
  return <Login />;
}
