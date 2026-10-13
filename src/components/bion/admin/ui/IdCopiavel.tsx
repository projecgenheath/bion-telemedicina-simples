"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/** ID em fonte mono, selecionável, com botão de copiar (44 px no toque, 36 px aqui por ser secundário). */
export function IdCopiavel({ id, rotulo = "Copiar ID" }: { id: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiado(true);
      toast.success("ID copiado");
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o ID e copie manualmente.");
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-xs ba-texto-2 break-all select-all">#{id}</span>
      <button type="button" onClick={() => void copiar()} className="ba-icone-botao !w-9 !h-9 shrink-0" aria-label={rotulo}>
        {copiado ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      </button>
    </span>
  );
}
