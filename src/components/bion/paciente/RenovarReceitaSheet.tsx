"use client";

import { useRef, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { fmtValorBRL } from "@/lib/bion-tipos";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { useArrastarFechar } from "./useArrastarFechar";
import type { CobrancaRenovacao } from "./usePedidosRenovacao";

/**
 * "Renovar receita": é um PEDIDO, sem horário. Custa o valor de uma consulta
 * com o médico, pago com cartão — o pedido só vai para o médico DEPOIS do
 * pagamento, e aí ele decide se renova por mensagem ou se marca uma chamada
 * curta. Nunca aparece para controlado (a tela não oferece e o servidor
 * recusa).
 */
export function RenovarReceitaSheet({
  medicamento,
  medico,
  valor,
  onPedir,
  onFechar,
}: {
  medicamento: string;
  medico: string;
  /** Preço da consulta do médico (o que a renovação cobra). C17: sem um
   *  valor válido a folha NÃO deixa criar o pedido — ninguém pede (e paga)
   *  uma renovação sem ver o preço antes. */
  valor?: number;
  onPedir: (observacao: string) => Promise<{ ok: boolean; erro?: string; cobranca?: CobrancaRenovacao }>;
  onFechar: () => void;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Durante o envio a folha não fecha (padrão de CancelarRemarcarSheet):
  // fechar "às cegas" criaria o pedido + a cobrança sem o paciente saber.
  // B21: com observação digitada e não enviada, fechar por voltar/ESC/
  // arrastar pede confirmação — antes o texto era descartado em silêncio.
  const fechar = () => {
    if (enviando) return;
    if (obs.trim() && !window.confirm("Descartar a observação digitada?")) return;
    onFechar();
  };
  useVoltarFecha(true, fechar);
  useFocoDialogo(true, fechar, raizRef);
  const painelRef = useRef<HTMLDivElement>(null);
  useArrastarFechar(painelRef, fechar);

  const valorValido = typeof valor === "number" && Number.isFinite(valor);

  async function enviar() {
    if (!valorValido) return;
    setEnviando(true);
    const r = await onPedir(obs);
    setEnviando(false);
    if (r.ok) {
      if (r.cobranca?.status === "falhou") {
        // C19: cobrança falhou/desconhecida — nada de "pague com cartão".
        toast.error("O pedido foi criado, mas a cobrança não foi confirmada.", {
          description: "Confira o pedido aqui em Documentos antes de tentar de novo.",
        });
      } else if (r.cobranca?.status === "pendente") {
        // Ainda NÃO foi ao médico: só vai depois do pagamento com cartão.
        toast.success(`Pedido criado. Pague ${fmtValorBRL(r.cobranca.valorCentavos / 100)} com cartão para o pedido ir ao médico.`, {
          description: "O botão \"Pagar com cartão\" aparece no pedido, aqui em Documentos.",
        });
      } else if (r.cobranca) {
        toast.success("Pedido enviado. Avisamos quando o médico responder.");
      } else {
        toast.success("Pedido criado. Acompanhe o andamento aqui em Documentos.");
      }
      onFechar();
    } else toast.error(r.erro ?? "Não foi possível enviar o pedido.");
  }

  return (
    <div ref={raizRef} className="bpp-sheet-raiz absolute inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-renovar">
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Fechar" onClick={fechar} />
      <div
        ref={painelRef} className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div data-arrastar className="-mx-5 -mt-3 mb-1 pt-3 pb-3 touch-none"><div className="mx-auto h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden /></div>
        <h2 data-arrastar id="titulo-renovar" className="text-lg font-bold">Renovar receita</h2>
        <p className="text-sm bpp-sheet-suave mt-1">{medicamento} · {medico}</p>
        <p className="mt-4 text-sm leading-relaxed">
          A renovação custa o valor de uma consulta com este médico, pago com cartão. O pedido só vai para o médico depois do pagamento — ele pode renovar por mensagem ou marcar uma chamada curta com você. Você não precisa escolher horário agora.
        </p>
        {valorValido ? (
          <p className="mt-3 text-sm font-semibold">
            Valor da renovação: {fmtValorBRL(valor)} <span className="font-normal bpp-sheet-suave">(pago com cartão)</span>
          </p>
        ) : (
          <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
            Não consegui carregar o valor da consulta deste médico. Feche e tente de novo — o pedido só é criado com o valor na tela.
          </p>
        )}
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
          disabled={enviando || !valorValido}
          onClick={enviar}
          className="bpp-toque bp-acao mt-5 w-full min-h-12 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <MessageSquare className="w-4 h-4" aria-hidden />}
          Criar pedido de renovação
        </button>
      </div>
    </div>
  );
}
