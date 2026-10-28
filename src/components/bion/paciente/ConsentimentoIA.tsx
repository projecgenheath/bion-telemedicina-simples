"use client";

import { useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useFocoDialogo } from "./useFocoDialogo";
import { aceitarConsentimentoIa } from "@/lib/bion-ia-cliente";
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } from "@/lib/aceite-termos";

/**
 * Tela de novo aceite da BION IA (provedor NVIDIA). Aparece quando o servidor
 * responde 409 consentimento_ia_pendente. O texto corresponde a
 * VERSAO_CONSENTIMENTO_IA (lib/consentimento-ia.ts): mudou o texto, troque a versão.
 */
export function ConsentimentoIA({ onAceito, onRecusar }: { onAceito: () => void; onRecusar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useFocoDialogo(true, onRecusar, ref);

  const aceitar = async () => {
    setSalvando(true);
    setErro(null);
    const ok = await aceitarConsentimentoIa();
    setSalvando(false);
    if (ok) onAceito();
    else setErro("Não consegui registrar seu aceite agora. Tente novamente.");
  };

  return (
    <div
      ref={ref}
      className="bpp-sheet-raiz absolute inset-0 z-[90] flex items-end justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-consentimento-ia"
      aria-describedby="texto-consentimento-ia"
    >
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Agora não" onClick={onRecusar} />
      <div className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden />
        <h2 id="titulo-consentimento-ia" className="text-lg font-bold inline-flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" aria-hidden /> A BION IA mudou
        </h2>
        <div id="texto-consentimento-ia" className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm bpp-sheet-suave space-y-2">
          <p>
            A BION IA agora usa o modelo Nemotron, da <strong className="bpp-sheet-forte">NVIDIA Corporation (EUA)</strong>.
            Nesta fase, a NVIDIA pode guardar e usar o conteúdo enviado conforme os termos dela. Por isso, a BION remove
            seus identificadores diretos das mensagens antes do envio.
          </p>
          <p>Se a NVIDIA não responder, entram respostas automáticas pré-programadas.</p>
          <p>
            Para continuar usando a IA, leia e aceite a nova{" "}
            <a href="/politica-de-privacidade" target="_blank" rel="noreferrer" className="underline font-semibold">
              Política de Privacidade
            </a>{" "}
            e os novos{" "}
            <a href="/termos-de-uso" target="_blank" rel="noreferrer" className="underline font-semibold">
              Termos de Uso
            </a>
            .
          </p>
          <p className="text-xs">
            Versões: {VERSAO_PRIVACIDADE} · {VERSAO_TERMOS_PACIENTE}
          </p>
        </div>
        {erro ? (
          <p className="text-sm text-red-600 mt-3" role="alert">
            {erro}
          </p>
        ) : null}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onRecusar} className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold">
            Agora não
          </button>
          <button
            type="button"
            onClick={() => void aceitar()}
            disabled={salvando}
            className="bpp-toque flex-1 py-3 rounded-xl bpp-sheet-primario text-sm font-bold disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Li e concordo"}
          </button>
        </div>
      </div>
    </div>
  );
}
