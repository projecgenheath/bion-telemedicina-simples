"use client";

import { useCallback, useEffect, useState } from "react";
import {
  bancoTemConteudo,
  mesclarCampoConta,
  normalizarBancoKits,
  normalizarModelosMensagem,
} from "@/lib/atalhos-medico";
import {
  chaveKits,
  gravarBancoKits,
  lerBancoKits,
  type ArmazenamentoKits,
  type BancoKits,
} from "@/lib/kits-prescricao";

const EVENTO_KITS = "bion-medico-kits";
/** Sobe quando o aparelho grava, para um GET antigo não apagar o que acabou de ser salvo. */
let geracaoModelos = 0;
let geracaoKits = 0;

export const armazenamentoLocal: ArmazenamentoKits = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* sem persistência neste aparelho */
    }
  },
};

function lerModelosLocal(chave: string): string[] {
  try {
    return normalizarModelosMensagem(JSON.parse(armazenamentoLocal.getItem(chave) ?? "[]"));
  } catch {
    return [];
  }
}

function gravarModelosLocal(chave: string, lista: string[]) {
  armazenamentoLocal.setItem(chave, JSON.stringify(lista));
}

type Conta = { modelosMensagem: unknown; bancoKits: unknown; existe: boolean };

async function lerConta(): Promise<Conta | null> {
  const res = await fetch("/api/medico/atalhos", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as Conta | null;
}

async function gravarConta(corpo: { modelosMensagem?: string[]; bancoKits?: BancoKits }): Promise<boolean> {
  const res = await fetch("/api/medico/atalhos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }).catch(() => null);
  return !!res?.ok;
}

/** Modelos de mensagem: conta primeiro; aparelho sobe só se a conta está vazia. */
export function useModelosMensagemConta(medicoId: string) {
  const chave = `bion:modelos-medico:${medicoId}`;
  const [lista, setLista] = useState<string[]>([]);
  const [naConta, setNaConta] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLista(lerModelosLocal(chave));
    const visto = geracaoModelos;
    (async () => {
      const conta = await lerConta();
      if (!vivo || geracaoModelos !== visto) return;
      if (!conta) {
        setNaConta(false);
        return;
      }
      const servidor = normalizarModelosMensagem(conta.modelosMensagem);
      const local = lerModelosLocal(chave);
      const decisao = mesclarCampoConta(servidor, local, (itens) => itens.length === 0);
      if (decisao.enviarLocal) {
        const enviou = await gravarConta({ modelosMensagem: local });
        if (!vivo || geracaoModelos !== visto) return;
        setLista(local);
        setNaConta(enviou);
        return;
      }
      geracaoModelos += 1;
      setLista(decisao.valor);
      gravarModelosLocal(chave, decisao.valor);
      setNaConta(true);
    })();
    return () => {
      vivo = false;
    };
  }, [chave]);

  const substituir = useCallback(
    async (nova: string[]) => {
      const limpa = normalizarModelosMensagem(nova);
      geracaoModelos += 1;
      setLista(limpa);
      gravarModelosLocal(chave, limpa);
      const enviou = await gravarConta({ modelosMensagem: limpa });
      setNaConta(enviou);
      return enviou;
    },
    [chave],
  );

  return { lista, naConta, substituir };
}

/**
 * Kits e pacotes. Cada gravação lê o aparelho de novo, para uma seção não
 * apagar o que a outra acabou de salvar. A conta recebe o banco inteiro.
 */
export function useBancoKitsConta(medicoId: string) {
  const [banco, setBanco] = useState<BancoKits>({ kits: [], pacotes: [], exemplosOcultos: [] });
  const [naConta, setNaConta] = useState(false);

  useEffect(() => {
    let vivo = true;
    const aplicarLocal = () => {
      if (vivo) setBanco(lerBancoKits(armazenamentoLocal, medicoId));
    };
    aplicarLocal();
    const aoMudar = (evento: Event) => {
      const id = (evento as CustomEvent<string>).detail;
      if (!id || id === medicoId) aplicarLocal();
    };
    window.addEventListener(EVENTO_KITS, aoMudar);
    const visto = geracaoKits;
    (async () => {
      const conta = await lerConta();
      if (!vivo || geracaoKits !== visto) return;
      if (!conta) {
        setNaConta(false);
        return;
      }
      const servidor = normalizarBancoKits(conta.bancoKits);
      const local = lerBancoKits(armazenamentoLocal, medicoId);
      const decisao = mesclarCampoConta(servidor, local, (b) => !bancoTemConteudo(b));
      if (decisao.enviarLocal) {
        const enviou = await gravarConta({ bancoKits: local });
        if (!vivo || geracaoKits !== visto) return;
        setBanco(local);
        setNaConta(enviou);
        return;
      }
      if (geracaoKits !== visto) return;
      geracaoKits += 1;
      gravarBancoKits(armazenamentoLocal, medicoId, decisao.valor);
      setBanco(decisao.valor);
      setNaConta(true);
      window.dispatchEvent(new CustomEvent(EVENTO_KITS, { detail: medicoId }));
    })();
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_KITS, aoMudar);
    };
  }, [medicoId]);

  const persistir = useCallback(
    async (mutar: (atual: BancoKits) => BancoKits) => {
      geracaoKits += 1;
      const atual = lerBancoKits(armazenamentoLocal, medicoId);
      const novo = normalizarBancoKits(mutar(atual));
      gravarBancoKits(armazenamentoLocal, medicoId, novo);
      setBanco(novo);
      window.dispatchEvent(new CustomEvent(EVENTO_KITS, { detail: medicoId }));
      const enviou = await gravarConta({ bancoKits: novo });
      setNaConta(enviou);
      return enviou;
    },
    [medicoId],
  );

  return { banco, persistir, naConta, chave: chaveKits(medicoId) };
}
