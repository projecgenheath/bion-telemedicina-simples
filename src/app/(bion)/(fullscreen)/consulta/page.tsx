"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { ConsultaNaoEncontrada } from "@/components/bion/consulta/SalaConsultaTela";
import { BotaoPagarStripe } from "@/components/bion/paciente/BotaoPagarStripe";

const Consulta = dynamic(
  () => import("@/components/bion/Consulta").then((m) => m.Consulta),
  {
    ssr: false,
    loading: () => <TelaCarregando texto="Preparando sala de consulta…" />,
  },
);

/** Id de consulta aceito na URL (cuid/uuid): evita levar lixo para a rota da sala. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Sala com pagamento pendente: a sala não pode ser aberta enquanto a
 * consulta em_espera não estiver paga (o servidor responde 402 com o mesmo
 * critério). O paciente recebe o botão de pagamento real (checkout Stripe,
 * o mesmo do card da próxima consulta); o médico, que não paga a consulta
 * do paciente, recebe só o aviso + Voltar. Admin não chega aqui: o
 * roteador da sala o desvia para Agendamentos antes de qualquer tela.
 */
function SalaPagamentoPendente({
  consultaId,
  role,
  especialidade,
  medico,
}: {
  consultaId: string;
  role: "paciente" | "medico" | "admin";
  especialidade: string;
  medico: string;
}) {
  const router = useRouter();
  const destino = role === "paciente" ? "/paciente" : "/painel";
  return (
    <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-white p-6">
      <div role="alert" className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-16 h-16 rounded-3xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
          <span className="text-2xl font-extrabold" aria-hidden>
            R$
          </span>
        </div>
        <div>
          <h1 className="text-lg font-bold">Pagamento pendente</h1>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Esta consulta ({especialidade} com {medico}) ainda está aguardando pagamento, por isso a sala
            não pode ser aberta. Depois da confirmação do pagamento, volte aqui para entrar na sala.
          </p>
        </div>
        {role === "paciente" ? (
          <BotaoPagarStripe consultaId={consultaId} rotulo="Pagar agora" className="w-full" />
        ) : null}
        <button
          type="button"
          onClick={() => router.replace(destino)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>
    </div>
  );
}

function SalaConsulta() {
  const router = useRouter();
  const { sessao, carregando, consultas } = useBion();
  // `/consulta?consulta=<id>`: a sala é DESTA consulta — e só dela.
  // Sem id, com id em formato inválido, sem consulta encontrada no store
  // ou com participante divergente, a página mostra "Consulta não
  // encontrada" com Voltar e NUNCA adivinha outra consulta (o hook também
  // não escolhe mais sozinho: useSalaConsulta.ts). Enquanto o store
  // carrega, mostra carregando — não um falso "não encontrada".
  const pedido = useSearchParams().get("consulta");
  const consultaId = pedido && ID_VALIDO.test(pedido) ? pedido : undefined;
  if (!consultaId) return <ConsultaNaoEncontrada role={sessao.role} />;
  if (carregando) return <TelaCarregando texto="Preparando sala de consulta…" />;
  const consulta = consultas.find((c) => c.id === consultaId);
  if (!consulta) return <ConsultaNaoEncontrada role={sessao.role} />;
  // Sem acesso: o usuário não é nem o médico nem o paciente desta consulta.
  // Admin fica de fora da checagem (o roteador da sala o desvia).
  if (
    sessao.role !== "admin" &&
    sessao.id &&
    consulta.medicoId !== undefined &&
    consulta.pacienteId !== undefined &&
    sessao.id !== consulta.medicoId &&
    sessao.id !== consulta.pacienteId
  ) {
    return <ConsultaNaoEncontrada role={sessao.role} />;
  }
  // Pagamento pendente: mesmo critério do servidor (em_espera && !pago).
  // Admin fica de fora (não entra na sala de qualquer forma).
  if (sessao.role !== "admin" && consulta.status === "em_espera" && consulta.pago !== true) {
    return (
      <SalaPagamentoPendente
        consultaId={consultaId}
        role={sessao.role}
        especialidade={consulta.especialidade}
        medico={consulta.medico}
      />
    );
  }
  // key: trocar ?consulta=A por ?consulta=B (ex.: "Sair e atender" da chamada
  // recebida) REMONTA a sala. Sem isso o estado de A (anotações, rascunhos,
  // cronômetro, chat, aba) vazaria para B. Na troca, a sala A desmonta antes:
  // useTeleconsulta → destruir() avisa "saiu" e para todas as tracks; só então
  // a sala B monta e pede a mídia de novo.
  return (
    <Consulta
      key={consultaId}
      role={sessao.role}
      consultaId={consultaId}
      onEnd={() =>
        router.replace(
          sessao.role === "paciente" ? "/paciente" : "/painel",
        )
      }
    />
  );
}

export default function PaginaConsulta() {
  return (
    <Suspense fallback={<TelaCarregando texto="Preparando sala de consulta…" />}>
      <SalaConsulta />
    </Suspense>
  );
}
