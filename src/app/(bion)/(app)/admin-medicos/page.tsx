"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { MedicosModulo } from "@/components/bion/admin/medicos/MedicosModulo";

/** Médicos do admin no visual Torre BION, com a validação real (rota em SO_ADMIN em rotas.ts). */
export default function PaginaAdminMedicos() {
  const { sessao, carregando } = useBion();
  // Defesa extra além do redirecionamento do layout. Antes, quem não era
  // admin via um shell vazio (return null + fallback null) sem nenhuma
  // explicação; agora há mensagem explícita enquanto o layout redireciona.
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
      <MedicosModulo />
    </Suspense>
  );
}
