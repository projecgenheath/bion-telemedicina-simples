"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { PacientesModulo } from "@/components/bion/admin/pacientes/PacientesModulo";

/** Pacientes do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAdminPacientes() {
  const { sessao, carregando } = useBion();
  // Defesa extra além do redirecionamento do layout. Mesmo padrão da página
  // de médicos: nada de tela em branco (return null + fallback null) — quem
  // não é admin vê a mensagem explícita enquanto o layout redireciona.
  if (carregando) return <TelaCarregando texto="Carregando…" />;
  if (sessao.role !== "admin") {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-2">
        <h1 className="text-xl font-black">Sem acesso</h1>
        <p className="text-sm text-muted-foreground">Esta área é exclusiva de administradores. Você será redirecionado.</p>
      </div>
    );
  }
  return (
    <Suspense fallback={<TelaCarregando texto="Carregando…" />}>
      <PacientesModulo />
    </Suspense>
  );
}
