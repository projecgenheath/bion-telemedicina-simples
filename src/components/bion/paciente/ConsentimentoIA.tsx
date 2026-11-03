"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useFocoDialogo } from "./useFocoDialogo";
import { aceitarConsentimentoIa, consultarEstadoIa, recusarIaGuardandoTermos } from "@/lib/bion-ia-cliente";
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } from "@/lib/aceite-termos";
import { TEXTO_CAIXA_CONSENTIMENTO_IA, rotuloVersoes } from "@/lib/consentimento-ia";

/**
 * Consentimento da BION IA (provedor NVIDIA), v3: SEPARADO dos Termos e da
 * Política. Caixa própria, desmarcada; a IA é opcional ("Usar o app sem a
 * IA") e revogável em Perfil > Privacidade. Se os Termos/Política vigentes
 * também estiverem pendentes, eles aparecem numa caixa À PARTE (dois aceites,
 * dois registros). O texto corresponde a VERSAO_CONSENTIMENTO_IA
 * (lib/consentimento-ia.ts): mudou o texto, troque a versão.
 */
export const TEXTO_RECUSA_IA =
  "Tudo bem. Você pode usar o app normalmente sem a BION IA: agendar consultas, ver seus exames e falar com seu médico continuam iguais. Se mudar de ideia, toque em Ativar a BION IA.";

function FormConsentimentoIA({
  onAceito,
  onRecusar,
  classeBorda,
  classePrimario,
}: {
  onAceito: () => void;
  onRecusar: () => void;
  classeBorda: string;
  classePrimario: string;
}) {
  const id = useId();
  const [termosPendentes, setTermosPendentes] = useState<boolean | null>(null);
  const [marcouIa, setMarcouIa] = useState(false);
  const [marcouTermos, setMarcouTermos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void consultarEstadoIa().then((e) => {
      if (vivo) setTermosPendentes(!e.termos);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const pode = marcouIa && (termosPendentes === false || marcouTermos) && termosPendentes !== null;

  const aceitar = async () => {
    if (!pode) return;
    setSalvando(true);
    setErro(null);
    const ok = await aceitarConsentimentoIa({ aceitarTermos: termosPendentes === true && marcouTermos });
    setSalvando(false);
    if (ok) onAceito();
    else setErro("Não consegui registrar sua autorização agora. Tente novamente.");
  };

  // "Usar o app sem a IA": só a IA é recusada. Se a caixa dos Termos foi
  // marcada, o aceite dos Termos/Política é gravado antes de fechar.
  const recusar = async () => {
    setSalvando(true);
    setErro(null);
    const ok = await recusarIaGuardandoTermos({ termosPendentes: termosPendentes === true, marcouTermos });
    setSalvando(false);
    if (ok) onRecusar();
    else setErro("Não consegui registrar seu aceite dos Termos agora. Tente novamente.");
  };

  return (
    <div className="space-y-3">
      <p>
        A BION IA é <strong>opcional</strong>. Ela usa o modelo Nemotron, da{" "}
        <strong>NVIDIA Corporation, nos EUA</strong>. Se você ativar, o que escrever no chat, na triagem e nos laudos,{" "}
        <strong>inclusive dados sobre a sua saúde</strong>, será enviado para lá, e a NVIDIA pode guardar e usar esse
        conteúdo conforme os termos dela. Antes do envio, a BION tenta remover automaticamente seu nome, e-mail, CPF,
        telefone, CEP e datas, mas essa remoção pode falhar. Laudos de exame vão como estão, inclusive com o seu nome
        impresso, e pedem autorização a cada envio. Evite escrever dados que identifiquem você ou outras pessoas.
      </p>
      <p>
        A BION IA não substitui consulta médica, não faz diagnóstico nem prescreve. Sem a IA, você usa o app normalmente.
        Você pode revogar quando quiser em Perfil &gt; Privacidade.
      </p>
      {termosPendentes ? (
        <label htmlFor={`${id}-termos`} className={`flex gap-3 items-start rounded-xl border ${classeBorda} p-3 cursor-pointer`}>
          <input
            id={`${id}-termos`}
            type="checkbox"
            checked={marcouTermos}
            onChange={(e) => setMarcouTermos(e.target.checked)}
            className="mt-1 w-5 h-5 shrink-0"
          />
          <span>
            Li e aceito os{" "}
            <a href="/termos-de-uso" target="_blank" rel="noreferrer" className="underline font-semibold">
              Termos de Uso
            </a>{" "}
            e a{" "}
            <a href="/politica-de-privacidade" target="_blank" rel="noreferrer" className="underline font-semibold">
              Política de Privacidade
            </a>{" "}
            ({rotuloVersoes(VERSAO_TERMOS_PACIENTE, VERSAO_PRIVACIDADE)}).
          </span>
        </label>
      ) : null}
      <label htmlFor={`${id}-ia`} className={`flex gap-3 items-start rounded-xl border ${classeBorda} p-3 cursor-pointer`}>
        <input
          id={`${id}-ia`}
          type="checkbox"
          checked={marcouIa}
          onChange={(e) => setMarcouIa(e.target.checked)}
          className="mt-1 w-5 h-5 shrink-0"
        />
        <span>{TEXTO_CAIXA_CONSENTIMENTO_IA}</span>
      </label>
      {erro ? (
        <p className="text-red-600" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => void aceitar()}
          disabled={!pode || salvando}
          className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 ${classePrimario}`}
        >
          {salvando ? "Salvando…" : "Ativar a BION IA"}
        </button>
        <button type="button" onClick={() => void recusar()} disabled={salvando} className={`flex-1 py-3 rounded-xl border ${classeBorda} font-semibold disabled:opacity-50`}>
          Usar o app sem a IA
        </button>
      </div>
    </div>
  );
}

/** Folha (modal) do consentimento — página clássica da BION IA. */
export function ConsentimentoIA({ onAceito, onRecusar }: { onAceito: () => void; onRecusar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocoDialogo(true, onRecusar, ref);
  return (
    <div
      ref={ref}
      className="bpp-sheet-raiz absolute inset-0 z-[90] flex items-end justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-consentimento-ia"
      aria-describedby="texto-consentimento-ia"
    >
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Usar o app sem a IA" onClick={onRecusar} />
      <div className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden />
        <h2 id="titulo-consentimento-ia" className="text-lg font-bold inline-flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" aria-hidden /> Quer ativar a BION IA?
        </h2>
        <div id="texto-consentimento-ia" className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm bpp-sheet-suave">
          <FormConsentimentoIA
            onAceito={onAceito}
            onRecusar={onRecusar}
            classeBorda="bpp-sheet-borda"
            classePrimario="bpp-toque bpp-sheet-primario"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Card de consentimento NO TOPO do chat. Enquanto não houver consentimento,
 * a entrada fica bloqueada e o servidor recusa (403) — nada vai à NVIDIA.
 */
export function CardAceiteIA({ onAceito, onRecusar }: { onAceito: () => void; onRecusar: () => void }) {
  return (
    <section
      role="region"
      aria-labelledby="titulo-card-aceite-ia"
      className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-bion-ink dark:text-bion-paper space-y-2"
    >
      <h2 id="titulo-card-aceite-ia" className="font-bold inline-flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" aria-hidden /> Quer ativar a BION IA?
      </h2>
      <FormConsentimentoIA
        onAceito={onAceito}
        onRecusar={onRecusar}
        classeBorda="border-amber-500/40"
        classePrimario="bp-acao"
      />
    </section>
  );
}

/** Aviso curto depois da recusa, com botão para reabrir o consentimento. */
export function AvisoSemIA({ onAtivar }: { onAtivar: () => void }) {
  return (
    <section
      aria-label="BION IA desativada"
      className="rounded-2xl border border-bion-ink/15 dark:border-white/15 bp-glass p-4 text-sm text-bion-ink dark:text-bion-paper space-y-2"
    >
      <p>{TEXTO_RECUSA_IA}</p>
      <button type="button" onClick={onAtivar} className="w-full py-2.5 rounded-xl border border-bion-sea/40 font-semibold">
        Ativar a BION IA
      </button>
    </section>
  );
}
