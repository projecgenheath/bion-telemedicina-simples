"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Dias inteiros bloqueados pelo médico (GET /api/medicos/[id]/        */
/* bloqueios → { dias: ["AAAA-MM-DD", ...] }, dias civis de São Paulo  */
/* de hoje até hoje + 60). Só datas — o motivo nunca vem.              */
/*                                                                    */
/* Conveniência de tela: o servidor já recusa agendar/remarcar nesses  */
/* dias com 409 ("O médico não atende neste dia."). Por isso, em erro  */
/* (rede, 401, 5xx) o hook devolve conjunto vazio e a agenda continua  */
/* funcionando normalmente.                                            */
/* ------------------------------------------------------------------ */

/** Validade do cache por médico (evita rajadas de requisições). */
const CACHE_MS = 60_000;
/** Falha fica em cache por menos tempo: tenta de novo logo depois. */
const CACHE_FALHA_MS = 15_000;
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const VAZIO: ReadonlySet<string> = new Set<string>();

type Entrada = { dias: ReadonlySet<string>; validoAte: number };
const cache = new Map<string, Entrada>();
const emAndamento = new Map<string, Promise<ReadonlySet<string>>>();

function lerCache(medicoId: string): ReadonlySet<string> | null {
  const e = cache.get(medicoId);
  return e && e.validoAte > Date.now() ? e.dias : null;
}

/** Descarta o cache do médico (a próxima leitura vai ao servidor). */
export function invalidarDiasBloqueados(medicoId?: string) {
  if (medicoId) cache.delete(medicoId);
  else cache.clear();
}

/**
 * Busca (com cache em memória e uma única requisição em voo por médico) os
 * dias bloqueados. Nunca rejeita: em erro resolve com conjunto vazio.
 */
export function buscarDiasBloqueados(medicoId: string): Promise<ReadonlySet<string>> {
  const emCache = lerCache(medicoId);
  if (emCache) return Promise.resolve(emCache);
  const pendente = emAndamento.get(medicoId);
  if (pendente) return pendente;

  const p = fetch(`/api/medicos/${encodeURIComponent(medicoId)}/bloqueios`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  })
    .then(async (res) => {
      const json = (await res.json().catch(() => null)) as { dias?: unknown } | null;
      if (!res.ok || !json || !Array.isArray(json.dias)) throw new Error("bloqueios indisponíveis");
      const dias: ReadonlySet<string> = new Set(
        json.dias.filter((d): d is string => typeof d === "string" && DIA_ISO.test(d)),
      );
      cache.set(medicoId, { dias, validoAte: Date.now() + CACHE_MS });
      return dias;
    })
    .catch(() => {
      cache.set(medicoId, { dias: VAZIO, validoAte: Date.now() + CACHE_FALHA_MS });
      return VAZIO;
    })
    .finally(() => {
      emAndamento.delete(medicoId);
    });
  emAndamento.set(medicoId, p);
  return p;
}

/**
 * Dias bloqueados do médico `medicoId` (null/undefined = não busca).
 * Refaz a busca quando o médico muda; `recarregar()` força ir ao servidor
 * (ex.: depois de um 409 ao agendar/remarcar).
 */
export function useDiasBloqueados(medicoId: string | null | undefined) {
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<{
    medicoId: string;
    versao: number;
    dias: ReadonlySet<string>;
  } | null>(null);

  useEffect(() => {
    if (!medicoId) return;
    let ativo = true;
    void buscarDiasBloqueados(medicoId).then((dias) => {
      if (ativo) setResultado({ medicoId, versao, dias });
    });
    return () => {
      ativo = false;
    };
  }, [medicoId, versao]);

  const recarregar = useCallback(() => {
    if (!medicoId) return;
    invalidarDiasBloqueados(medicoId);
    setVersao((v) => v + 1);
  }, [medicoId]);

  if (!medicoId) return { bloqueados: VAZIO, carregando: false, recarregar };
  const atual = resultado && resultado.medicoId === medicoId ? resultado : null;
  // Cache já válido (outra tela buscou o mesmo médico): usa direto, sem piscar.
  const emCache = lerCache(medicoId);
  return {
    // Enquanto recarrega o MESMO médico, mantém o último conjunto conhecido.
    bloqueados: emCache ?? atual?.dias ?? VAZIO,
    carregando: !emCache && (!atual || atual.versao !== versao),
    recarregar,
  };
}
