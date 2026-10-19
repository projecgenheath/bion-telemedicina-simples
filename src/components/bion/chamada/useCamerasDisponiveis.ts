"use client";

import { useEffect, useState } from "react";

/**
 * Quantas câmeras o aparelho tem (para mostrar "Virar" só com 2+). Relê
 * quando a câmera é liberada (`depoisDe` muda; antes da permissão alguns
 * navegadores escondem a lista) e quando um dispositivo entra/sai.
 */
export function useCamerasDisponiveis(depoisDe: unknown): number {
  const [qtd, setQtd] = useState(0);
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.enumerateDevices) return;
    let vivo = true;
    const ler = () =>
      md
        .enumerateDevices()
        .then((l) => {
          if (vivo) setQtd(l.filter((d) => d.kind === "videoinput").length);
        })
        .catch(() => {});
    void ler();
    md.addEventListener?.("devicechange", ler);
    return () => {
      vivo = false;
      md.removeEventListener?.("devicechange", ler);
    };
  }, [depoisDe]);
  return qtd;
}
