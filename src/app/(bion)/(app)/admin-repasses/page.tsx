"use client";

import { Suspense } from "react";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { RepassesModulo } from "@/components/bion/admin/repasses/RepassesModulo";

/** Repasses aos médicos (só admin; a rota também está em SO_ADMIN em rotas.ts). */
export default function PaginaAdminRepasses() {
  const { sessao, carregando } = useBion();
  // Defesa extra: CNPJ e chave PIX completos só aparecem para o admin.
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
      <RepassesModulo />
    </Suspense>
  );
}
