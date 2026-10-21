"use client";

import { useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { useFocoDialogo } from "./useFocoDialogo";

/**
 * Aviso de consentimento mostrado ANTES de cada envio de laudo à BION IA.
 * Só "Concordo e enviar" envia; "Cancelar" (ou ESC/fundo) descarta o arquivo.
 * O texto corresponde a VERSAO_CONSENTIMENTO_IA_EXAME
 * (lib/consentimento-ia-exame.ts): mudou o texto, troque a versão.
 */
export function ConsentimentoLaudoIA({
  nomeArquivo,
  onConcordar,
  onCancelar,
}: {
  nomeArquivo: string;
  onConcordar: () => void;
  onCancelar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocoDialogo(true, onCancelar, ref);

  return (
    <div
      ref={ref}
      className="bpp-sheet-raiz absolute inset-0 z-[90] flex items-end justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-consentimento-laudo"
      aria-describedby="texto-consentimento-laudo"
    >
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Cancelar envio" onClick={onCancelar} />
      <div className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden />
        <h2 id="titulo-consentimento-laudo" className="text-lg font-bold inline-flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" aria-hidden /> Antes de enviar o laudo
        </h2>
        <p className="text-sm bpp-sheet-suave mt-1 break-all">Arquivo: {nomeArquivo}</p>

        <div id="texto-consentimento-laudo" className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm bpp-sheet-suave space-y-2">
          <p>
            Para ler os resultados, a BION envia <strong className="bpp-sheet-forte">o arquivo inteiro</strong> para o
            Google (serviço de IA Gemini). Isso inclui <strong className="bpp-sheet-forte">o seu nome e qualquer outro dado impresso</strong> no
            laudo, além dos resultados, que são dados de saúde.
          </p>
          <p>O Google pode processar o arquivo em servidores fora do Brasil.</p>
          <p>
            A BION guarda só os valores extraídos (nome do exame, data e resultados) e o registro do envio. O arquivo
            enviado para leitura não fica guardado na BION.
          </p>
          <p>Se não concordar, cancele. Você pode mostrar o laudo ao médico durante a consulta.</p>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancelar}
            className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConcordar}
            className="bpp-toque flex-1 py-3 rounded-xl bpp-sheet-primario text-sm font-bold"
          >
            Concordo e enviar
          </button>
        </div>
      </div>
    </div>
  );
}
