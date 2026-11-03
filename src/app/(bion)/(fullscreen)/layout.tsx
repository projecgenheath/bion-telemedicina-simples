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
  const { autenticado, carregando, precisaTrocarSenha, erroCarga, tentarNovamenteCarga } = useBion();
  const router = useRouter();

  useEffect(() => {
    // B24: erro de carga NÃO redireciona para o login — sessão válida com
    // falha de rede/servidor não é logout.
    if (!carregando && !autenticado && !erroCarga) router.replace("/entrar");
  }, [carregando, autenticado, erroCarga, router]);

  if (erroCarga && !autenticado) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6" role="alert">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-lg font-bold">Não foi possível carregar</h1>
          <p className="text-sm opacity-80">
            Houve uma falha ao carregar seus dados. Sua sessão continua ativa — tente novamente.
          </p>
          <button
            type="button"
            onClick={tentarNovamenteCarga}
            disabled={carregando}
            className="px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {carregando ? "Tentando…" : "Tentar novamente"}
          </button>
        </div>
      </div>
    );
  }
  if (carregando || !autenticado) return <TelaCarregando texto="Preparando a sala…" />;
  if (precisaTrocarSenha) return <TrocarSenhaObrigatoria />;
  return <>{children}</>;
}
