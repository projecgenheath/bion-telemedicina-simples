"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { AgendamentosModulo } from "@/components/bion/admin/agendamentos/AgendamentosModulo";

/** Agendamentos do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAdminAgendamentos() {
  const { sessao, carregando } = useBion();
  // Defesa extra além do redirecionamento do layout: só o admin vê a agenda de todos.
  // Antes, quem não era admin via um shell vazio (return null + fallback null).
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
      <AgendamentosModulo />
    </Suspense>
  );
}
