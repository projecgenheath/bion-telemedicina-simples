"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { TelaCarregando } from "@/components/bion/brand";
import { MedicoApp } from "@/components/bion/medico/MedicoApp";
import { GuardaAceiteTermos } from "@/components/bion/GuardaAceiteTermos";

/**
 * App imersivo do MÉDICO (fullscreen). O layout (fullscreen) só garante
 * autenticação; o papel é conferido aqui. Não há mais versão clássica.
 * Suspense: o MedicoApp lê ?painel= (deep-link do menu e das páginas
 * clássicas) com useSearchParams.
 */
export default function PaginaMedico() {
  const { sessao, carregando, autenticado } = useBion();
  const router = useRouter();
  const ehMedico = sessao.role === "medico";

  // Só redireciona depois que a sessão terminou de carregar: antes, a
  // sessão começa vazia e um médico legítimo seria jogado para /painel
  // antes de o papel ser conhecido. O layout fullscreen já barra
  // não-autenticados para /entrar, então aqui só redirecionamos quem
  // está autenticado e não é médico.
  useEffect(() => {
    if (carregando || !autenticado) return;
    if (!ehMedico) router.replace(sessao.role === "paciente" ? "/paciente" : "/painel");
  }, [carregando, autenticado, ehMedico, sessao.role, router]);

  if (carregando || !autenticado) return <TelaCarregando texto="Carregando…" />;
  if (!ehMedico) return <TelaCarregando texto="Redirecionando…" />;
  return (
    <GuardaAceiteTermos perfil="MEDICO">
      <Suspense fallback={<TelaCarregando texto="Abrindo seu app…" />}>
        <MedicoApp />
      </Suspense>
    </GuardaAceiteTermos>
  );
}
