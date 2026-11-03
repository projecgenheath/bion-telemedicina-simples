"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";

/**
 * A pré-sala (sala de espera) foi removida: o paciente entra direto na sala
 * pelo botão "Entrar na sala", liberado 30 min antes do horário.
 * Esta rota só existe para não quebrar links antigos:
 *  - /sala-espera?consulta=<id> → /consulta?consulta=<id>
 *  - /sala-espera               → /paciente (ou /painel para médico/admin)
 *  - /sala-espera?consulta=<inválido> → TELA DE ERRO (não redireciona em
 *    silêncio para a home): o link está quebrado e o usuário precisa saber.
 */

/** Mesmo critério de app/(bion)/(fullscreen)/consulta/page.tsx (cuid/uuid). */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

function Redirecionar() {
  const router = useRouter();
  const { sessao, carregando, autenticado } = useBion();
  const pedido = useSearchParams().get("consulta");
  const consultaId = pedido && ID_VALIDO.test(pedido) ? pedido : null;
  const idInvalido = !!pedido && !consultaId;

  // Só redireciona depois que a sessão carrega: antes, um paciente ainda
  // sem papel conhecido era jogado para /painel pelo fallback de role.
  useEffect(() => {
    if (carregando || !autenticado || idInvalido) return;
    if (consultaId) router.replace(`/consulta?consulta=${encodeURIComponent(consultaId)}`);
    else router.replace(sessao.role === "paciente" ? "/paciente" : "/painel");
  }, [carregando, autenticado, idInvalido, consultaId, sessao.role, router]);

  if (carregando || !autenticado) return <TelaCarregando texto="Abrindo…" />;

  if (idInvalido) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-3">
        <h1 className="text-xl font-black">Link de sala inválido</h1>
        <p className="text-sm text-muted-foreground">
          O identificador da consulta neste link não é válido, então não dá para abrir a sala a partir dele.
          Volte e abra a consulta pelo seu app, pelo botão “Entrar na sala”.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 rounded-full border text-sm font-bold"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => router.push(sessao.role === "paciente" ? "/paciente" : "/painel")}
            className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold"
          >
            Ir para o início
          </button>
        </div>
      </div>
    );
  }

  return <TelaCarregando texto="Abrindo…" />;
}

export default function PaginaSalaEspera() {
  return (
    <Suspense fallback={<TelaCarregando texto="Abrindo…" />}>
      <Redirecionar />
    </Suspense>
  );
}
