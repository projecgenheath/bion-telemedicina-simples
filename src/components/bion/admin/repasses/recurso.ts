"use client";

import { useCallback, useEffect, useState } from "react";

export type RespostaApi<T> = { status: number; dados: T | null; erro: string | null };

/** fetch com a sessão do navegador; nunca lança (status 0 = sem conexão). */
export async function chamarApi<T>(url: string, init?: RequestInit): Promise<RespostaApi<T>> {
  try {
    const r = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    const j = (await r.json().catch(() => null)) as (T & { erro?: string }) | null;
    if (!r.ok) return { status: r.status, dados: null, erro: j?.erro || `O servidor respondeu ${r.status}.` };
    return { status: r.status, dados: j as T, erro: null };
  } catch {
    return { status: 0, dados: null, erro: "Sem conexão com o servidor." };
  }
}

/**
 * Leitura de uma rota GET. `url = null` não busca nada. "carregando" é
 * derivado (a resposta guardada é de outra chave), sem setState síncrono no efeito.
 */
export function useRecurso<T>(url: string | null) {
  const [versao, setVersao] = useState(0);
  const chave = url ? `${url}#${versao}` : null;
  const [estado, setEstado] = useState<{ chave: string | null; url: string | null; resp: RespostaApi<T> | null; anterior: T | null }>({
    chave: null,
    url: null,
    resp: null,
    anterior: null,
  });

  useEffect(() => {
    if (!url || !chave) return;
    let vivo = true;
    void chamarApi<T>(url).then((resp) => {
      if (vivo) setEstado((e) => ({ chave, url, resp, anterior: resp.dados ?? (e.url === url ? e.anterior : null) }));
    });
    return () => {
      vivo = false;
    };
  }, [url, chave]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const atual = estado.chave === chave ? estado.resp : null;
  return {
    /** Mantém o último dado bom enquanto recarrega (a lista não "pisca"). */
    dados: atual?.dados ?? (atual || estado.url !== url ? null : estado.anterior),
    erro: atual?.erro ?? null,
    status: atual?.status ?? null,
    carregando: Boolean(url) && !atual,
    recarregar,
  };
}
