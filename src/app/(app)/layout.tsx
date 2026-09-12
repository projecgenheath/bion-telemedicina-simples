"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { AppShell } from "@/components/bion/telas/AppShell";
import { TelaCarregando } from "@/components/bion/brand";
import { SO_ADMIN, SO_MEDICO, viewDoPath } from "@/lib/rotas";

export default function LayoutAutenticado({ children }: { children: React.ReactNode }) {
  const { autenticado, carregando, sessao } = useBion();
  const router = useRouter();
  const pathname = usePathname();
  const view = viewDoPath(pathname);

  // Sem sessão → tela de entrada
  useEffect(() => {
    if (!carregando && !autenticado) router.replace("/entrar");
  }, [carregando, autenticado, router]);

  // Guarda de papel: admin/médico têm telas exclusivas
  useEffect(() => {
    if (carregando || !autenticado) return;
    if (SO_ADMIN.includes(view) && sessao.role !== "admin") router.replace("/painel");
    else if (SO_MEDICO.includes(view) && sessao.role !== "medico") router.replace("/painel");
  }, [carregando, autenticado, view, sessao.role, router]);

  if (carregando || !autenticado) return <TelaCarregando />;

  return <AppShell>{children}</AppShell>;
}
