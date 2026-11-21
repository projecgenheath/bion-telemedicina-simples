"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBion } from "@/lib/bion-store";
import { Login } from "@/components/bion/telas/Login";
import { TelaCarregando } from "@/components/bion/brand";
import { destinoDepoisDeEntrar } from "@/lib/agendar-publico";

export default function PaginaEntrar() {
  const { autenticado, carregando, sessao } = useBion();
  const router = useRouter();
  const [consulta, setConsulta] = useState(false);
  const [voltar, setVoltar] = useState<string | null>(null);
  const [cadastro, setCadastro] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setVoltar(q.get("voltar"));
    setCadastro(q.get("cadastro") === "1");
    setConsulta(true);
  }, []);

  useEffect(() => {
    if (!consulta || carregando || !autenticado) return;
    router.replace(destinoDepoisDeEntrar(sessao.role, voltar));
  }, [consulta, carregando, autenticado, sessao.role, router, voltar]);

  if (!consulta || carregando) return <TelaCarregando />;
  if (autenticado) return <TelaCarregando texto="Redirecionando..." />;
  return <Login comecarNoCadastro={cadastro} voltar={voltar} />;
}
