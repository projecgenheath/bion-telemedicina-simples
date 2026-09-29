"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TrocarSenhaObrigatoria } from "@/components/bion/telas/TrocarSenhaObrigatoria";
import { TelaCarregando } from "@/components/bion/brand";

/**
 * Rotas de tela cheia do paciente/consulta — FORA do layout (app)
 * que monta o AppShell. Assim a sala nunca herda sidebar/abas.
 */
export default function LayoutTelaCheia({ children }: { children: React.ReactNode }) {
  const { autenticado, carregando, precisaTrocarSenha } = useBion();
  const router = useRouter();

  useEffect(() => {
    if (!carregando && !autenticado) router.replace("/entrar");
  }, [carregando, autenticado, router]);

  if (carregando || !autenticado) return <TelaCarregando texto="Preparando a sala…" />;
  if (precisaTrocarSenha) return <TrocarSenhaObrigatoria />;
  return <>{children}</>;
}
