"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * As mutações do store são "dispara e esquece" (erros já viram toast no
 * próprio store). Este hook mostra "Salvando…" e só confirma quando o valor
 * NOVO chega ao store pelo delta do servidor — sem sucesso otimista.
 * Use num componente que CONTINUA montado depois que o sheet fecha
 * (MedicoApp), senão a confirmação nunca chega.
 */
export type Confirmar<T> = (esperado: T, carregando: string, ok: string) => void;

export function useConfirmarSalvamento<T>(atual: T, igual: (a: T, b: T) => boolean) {
  const pendente = useRef<{ v: T; id: string | number; ok: string; t: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    const p = pendente.current;
    if (p && igual(atual, p.v)) {
      clearTimeout(p.t);
      toast.success(p.ok, { id: p.id });
      pendente.current = null;
    }
  }, [atual]);

  useEffect(() => () => {
    const p = pendente.current;
    if (p) {
      clearTimeout(p.t);
      toast.dismiss(p.id);
    }
  }, []);

  return useCallback<Confirmar<T>>((esperado, carregando, ok) => {
    if (pendente.current) clearTimeout(pendente.current.t);
    const id = toast.loading(carregando);
    // Sem confirmação em 12 s (erro já mostrado pelo store ou rede lenta): some.
    const t = setTimeout(() => {
      toast.dismiss(id);
      pendente.current = null;
    }, 12_000);
    pendente.current = { v: esperado, id, ok, t };
  }, []);
}
