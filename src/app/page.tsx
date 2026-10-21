"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Landing } from "@/components/bion/telas/Landing";
import { estaNoAppNativo } from "@/lib/app-nativo";

const semAssinatura = () => () => {};

export default function PaginaInicial() {
  const router = useRouter();
  // false no servidor (web normal); no cliente lê se está na casca nativa.
  const noApp = useSyncExternalStore(semAssinatura, estaNoAppNativo, () => false);

  // No app (Capacitor) não mostramos a landing: vai para o login, que já
  // redireciona para a home do perfil quando existe sessão salva.
  useEffect(() => {
    if (noApp) router.replace("/entrar");
  }, [noApp, router]);

  if (noApp) return null;
  return <Landing />;
}
