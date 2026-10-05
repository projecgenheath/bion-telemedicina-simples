"use client";

import { useEffect, useRef } from "react";

/**
 * Fecha a sobreposição com o botão "voltar" do navegador/Android:
 * empurra uma entrada no histórico ao abrir e fecha no `popstate`.
 * Se a sobreposição fechar pela UI, consome a entrada extra.
 *
 * Cópia adaptada de `medico/TelaSobreposta.tsx` (fase 2 do redesign do
 * paciente). Fica na pasta do paciente para não importar código de médico
 * nem mover o original para `src/lib/` ainda.
 */
export function useVoltarFecha(aberto: boolean, onFechar: () => void) {
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  });
  useEffect(() => {
    if (!aberto) return;
    // Profundidade permite sobreposições aninhadas: só fecha quem ficou
    // "acima" da entrada atual do histórico.
    const profundidade = ((window.history.state?.bmProfundidade as number | undefined) ?? 0) + 1;
    let viaVoltar = false;
    window.history.pushState({ ...window.history.state, bmProfundidade: profundidade }, "");
    const aoVoltar = () => {
      const atual = (window.history.state?.bmProfundidade as number | undefined) ?? 0;
      if (atual < profundidade) {
        viaVoltar = true;
        fecharRef.current();
      }
    };
    window.addEventListener("popstate", aoVoltar);
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      if (!viaVoltar && window.history.state?.bmProfundidade === profundidade) window.history.back();
    };
  }, [aberto]);
}
