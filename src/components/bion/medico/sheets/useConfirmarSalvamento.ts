"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * As mutações do store são "dispara e esquece" (erros já viram toast no
 * próprio store). Este hook mostra "Salvando…" e só confirma quando o valor
 * NOVO chega ao store pelo delta do servidor — sem sucesso otimista.
 * Use num componente que CONTINUA montado depois que o sheet fecha
 * (MedicoApp), senão a confirmação nunca chega.
 *
 * Devolve uma promessa: true quando o delta confirmou, false no timeout.
 * Quem chama pode (e deve) aguardar antes de fechar o sheet — e, em false,
 * mostrar erro + retry em vez de fechar em silêncio. Chamadores antigos que
 * ignoram o retorno continuam funcionando (o toast de erro do timeout
 * aparece do mesmo jeito).
 */
export type Confirmar<T> = (esperado: T, carregando: string, ok: string) => Promise<boolean>;

export function useConfirmarSalvamento<T>(atual: T, igual: (a: T, b: T) => boolean) {
  const pendente = useRef<{
    v: T;
    id: string | number;
    ok: string;
    t: ReturnType<typeof setTimeout>;
    resolver: (ok: boolean) => void;
  } | null>(null);
  useEffect(() => {
    const p = pendente.current;
    if (p && igual(atual, p.v)) {
      clearTimeout(p.t);
      toast.success(p.ok, { id: p.id });
      pendente.current = null;
      p.resolver(true);
    }
  }, [atual]);

  useEffect(() => () => {
    const p = pendente.current;
    if (p) {
      clearTimeout(p.t);
      toast.dismiss(p.id);
      p.resolver(false);
    }
  }, []);

  return useCallback<Confirmar<T>>((esperado, carregando, ok) => {
    if (pendente.current) {
      // Nova tentativa substitui a anterior: resolve a antiga como falha e
      // some com o toast dela, para não ficarem dois "Salvando…" no ar.
      clearTimeout(pendente.current.t);
      toast.dismiss(pendente.current.id);
      pendente.current.resolver(false);
      pendente.current = null;
    }
    // B-16: o valor esperado JÁ é o atual (ex.: salvar preço igual ao vigente)?
    // Sucesso imediato — antes o toast de "Salvando…" ficava pendente os 12 s
    // e sumia sem confirmação.
    if (igual(atual, esperado)) {
      const id = toast.loading(carregando);
      return new Promise<boolean>((resolver) => {
        setTimeout(() => {
          toast.dismiss(id);
          toast.success(ok, { id });
          resolver(true);
        }, 350);
      });
    }
    const id = toast.loading(carregando);
    return new Promise<boolean>((resolver) => {
      // Sem confirmação em 12 s: ERRO VISÍVEL (antes o toast só sumia e o
      // usuário ficava sem saber se salvou). O chamador recebe false e
      // mostra o retry no próprio sheet.
      const t = setTimeout(() => {
        toast.error("Não foi possível confirmar o salvamento. Tente novamente.", { id });
        pendente.current = null;
        resolver(false);
      }, 12_000);
      pendente.current = { v: esperado, id, ok, t, resolver };
    });
  }, [atual, igual]);
}
