"use client";

import { useRef, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";

/**
 * "Renovar receita": é um PEDIDO, sem horário. O médico decide se renova por
 * mensagem ou se marca uma chamada curta. Nunca aparece para controlado
 * (a tela não oferece e o servidor recusa).
 */
export function RenovarReceitaSheet({
  medicamento,
  medico,
  onPedir,
  onFechar,
}: {
  medicamento: string;
  medico: string;
  onPedir: (observacao: string) => Promise<{ ok: boolean; erro?: string }>;
  onFechar: () => void;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, raizRef);
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    const r = await onPedir(obs);
    setEnviando(false);
    if (r.ok) {
      toast.success("Pedido enviado. Avisamos quando o médico responder.");
      onFechar();
    } else toast.error(r.erro ?? "Não foi possível enviar o pedido.");
  }

  return (
    <div ref={raizRef} className="bpp-sheet-raiz absolute inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-renovar">
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Fechar" onClick={onFechar} />
      <div className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden />
        <h2 id="titulo-renovar" className="text-lg font-bold">Renovar receita</h2>
        <p className="text-sm bpp-sheet-suave mt-1">{medicamento} · {medico}</p>
        <p className="mt-4 text-sm leading-relaxed">
          O pedido vai para o médico. Ele pode renovar por mensagem ou marcar uma chamada curta com você. Você não precisa escolher horário agora.
        </p>
        <label htmlFor="obs-renovar" className="block mt-4 text-xs font-bold uppercase tracking-wider bpp-sheet-suave">
          Algo mudou? (opcional)
        </label>
        <textarea
          id="obs-renovar"
          value={obs}
          onChange={(e) => setObs(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Ex.: estou tomando certinho, sem efeitos colaterais."
          className="mt-2 w-full rounded-2xl bp-glass p-3 text-sm"
        />
        <button
          type="button"
          disabled={enviando}
          onClick={enviar}
          className="bpp-toque bp-acao mt-5 w-full min-h-12 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <MessageSquare className="w-4 h-4" aria-hidden />}
          Enviar pedido ao médico
        </button>
      </div>
    </div>
  );
}
