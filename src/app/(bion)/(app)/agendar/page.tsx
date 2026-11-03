"use client";

import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { AgendamentoFluxo } from "@/components/bion/AgendamentoFluxo";
import { TelaCarregando } from "@/components/bion/brand";

export default function PaginaAgendar() {
  const router = useRouter();
  const { sessao, carregando, autenticado } = useBion();

  // O layout (app) já redireciona não-pacientes para /painel (rota
  // SO_PACIENTE), mas o onDone abaixo não pode presumir o papel: antes,
  // qualquer um que chegasse aqui terminaria em /paciente ao concluir.
  // Enquanto a sessão carrega, não renderizamos o fluxo; quem não é
  // paciente vê o bloqueio com mensagem em vez do fluxo (e do /paciente).
  if (carregando || !autenticado) return <TelaCarregando texto="Carregando…" />;
  if (sessao.role !== "paciente") {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-3">
        <h1 className="text-xl font-black">Agendamento disponível apenas para pacientes</h1>
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva de quem agenda consultas. Médicos e administradores usam seus próprios apps.
        </p>
        <button
          type="button"
          onClick={() => router.push("/painel")}
          className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold"
        >
          Voltar ao painel
        </button>
      </div>
    );
  }
  return <AgendamentoFluxo onDone={() => router.push("/paciente")} />;
}
