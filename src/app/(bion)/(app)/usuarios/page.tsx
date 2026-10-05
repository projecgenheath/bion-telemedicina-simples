"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";

/**
 * A antiga "Usuários & CRM" era uma tela de mentira (lista fixa, nada era
 * gravado). A validação real de médicos fica em Médicos › Em validação.
 * A URL continua valendo (links e favoritos): o admin é levado para lá.
 * Outros papéis já são redirecionados pelo layout (rota em SO_ADMIN).
 */
export default function PaginaUsuarios() {
  const { sessao } = useBion();
  const router = useRouter();
  const admin = sessao.role === "admin";
  useEffect(() => {
    if (admin) router.replace("/admin-medicos?aba=validacao");
  }, [admin, router]);
  return null;
}
