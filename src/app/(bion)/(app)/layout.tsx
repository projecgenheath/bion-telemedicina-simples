"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { AppShell } from "@/components/bion/telas/AppShell";
import { TorreAdmin } from "@/components/bion/admin/TorreAdmin";
import { TrocarSenhaObrigatoria } from "@/components/bion/telas/TrocarSenhaObrigatoria";
import { TelaCarregando } from "@/components/bion/brand";
import { GuardaAceiteTermos } from "@/components/bion/GuardaAceiteTermos";
import { SO_ADMIN, SO_CLINICA, SO_MEDICO, SO_PACIENTE, viewDoPath } from "@/lib/rotas";

export default function LayoutAutenticado({ children }: { children: React.ReactNode }) {
  const { autenticado, carregando, sessao, precisaTrocarSenha, erroCarga, tentarNovamenteCarga } = useBion();
  const router = useRouter();
  const pathname = usePathname();
  const path = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const view = viewDoPath(path);
  const rotaTelaCheia =
    path === "/paciente" ||
    path === "/consulta" ||
    path === "/suporte" ||
    path === "/privacidade" ||
    path === "/ajuda" ||
    path.startsWith("/consulta/");

  // Sem sessão → tela de entrada. B24: erro de carga NÃO redireciona —
  // sessão válida com falha de rede/servidor não é logout.
  useEffect(() => {
    if (!carregando && !autenticado && !erroCarga) router.replace("/entrar");
  }, [carregando, autenticado, erroCarga, router]);

  const destinoPaciente = sessao.role === "paciente";
  const telaCheiaPaciente = rotaTelaCheia;

  // Guarda de papel: cada tela exclusiva só abre para o papel correto
  useEffect(() => {
    if (carregando || !autenticado) return;
    if (destinoPaciente && !telaCheiaPaciente) {
      router.replace("/paciente");
      return;
    }
    if (SO_ADMIN.includes(view) && sessao.role !== "admin") router.replace("/painel");
    else if (SO_MEDICO.includes(view) && sessao.role !== "medico") router.replace("/painel");
    else if (SO_PACIENTE.includes(view) && sessao.role !== "paciente") router.replace("/painel");
    else if (SO_CLINICA.includes(view) && sessao.role === "admin") router.replace("/painel");
  }, [carregando, autenticado, view, sessao.role, router, destinoPaciente, telaCheiaPaciente]);

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

  if (carregando || !autenticado) return <TelaCarregando comLista />;

  // V4 — conta criada pela administração: troca de senha obrigatória antes
  // de qualquer navegação (a tela usa a própria sessão, já válida).
  if (precisaTrocarSenha) return <TrocarSenhaObrigatoria />;

  // Administrador: casca própria (Torre BION). Paciente e médico seguem abaixo, sem mudança.
  if (sessao.role === "admin") return <TorreAdmin>{children}</TorreAdmin>;

  // Paciente: nunca monta o AppShell antigo (sidebar/abas) — nem por um frame.
  if (destinoPaciente || rotaTelaCheia) {
    if (telaCheiaPaciente || rotaTelaCheia) {
      // Paciente: aceite dos Termos v1 + Privacidade v1. Pode recusar e seguir
      // em modo limitado (consultas pagas e exclusão da conta); agendar é
      // bloqueado no servidor (exigirAceiteTermosPaciente).
      if (destinoPaciente) {
        return (
          <GuardaAceiteTermos perfil="PACIENTE" permitirRecusa>
            {children}
          </GuardaAceiteTermos>
        );
      }
      return <>{children}</>;
    }
    return <TelaCarregando texto="Abrindo seu app…" />;
  }

  // Médico: aceite dos termos vigentes antes de qualquer tela da área dele.
  if (sessao.role === "medico") {
    return (
      <GuardaAceiteTermos perfil="MEDICO">
        <AppShell>{children}</AppShell>
      </GuardaAceiteTermos>
    );
  }
  return <AppShell>{children}</AppShell>;
}
