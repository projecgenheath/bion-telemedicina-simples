"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { AuditoriaModulo } from "@/components/bion/admin/auditoria/AuditoriaModulo";

/** Auditoria do admin no visual Torre BION (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAuditoria() {
  const { sessao, carregando } = useBion();
  // Defesa extra além do redirecionamento do layout.
  // Auditoria admin 09/11: mesmo padrão de Pacientes/Médicos — nada de tela
  // em branco (return null + fallback null) enquanto carrega ou redireciona.
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
      <AuditoriaModulo />
    </Suspense>
  );
}
