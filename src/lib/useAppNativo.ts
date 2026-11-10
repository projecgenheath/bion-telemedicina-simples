import { useSyncExternalStore } from "react";
import { estaNoAppNativo } from "@/lib/app-nativo";

const semAssinatura = () => () => {};

/**
 * true dentro do app de loja (Capacitor). No servidor e no primeiro render do
 * navegador vale false, então a hidratação nunca diverge.
 */
export function useAppNativo(): boolean {
  return useSyncExternalStore(semAssinatura, estaNoAppNativo, () => false);
}
