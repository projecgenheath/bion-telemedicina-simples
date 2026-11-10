"use client";

import { AlertCircle } from "lucide-react";
import { useAppNativo } from "@/lib/useAppNativo";

/** Banner acessível quando câmera/microfone falham na teleconsulta. */
export function AlertaMidia({ mensagem }: { mensagem: string }) {
  // No app de loja não há barra de endereço nem cadeado: a permissão fica nas
  // configurações do Android/iOS (e, se o paciente negou com "não perguntar de
  // novo", o sistema não pergunta mais sozinho).
  const noApp = useAppNativo();
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
    >
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" aria-hidden />
      <div className="space-y-1">
        <p className="font-bold text-amber-50">Problema com câmera ou microfone</p>
        <p className="text-xs text-amber-100/90 leading-relaxed">{mensagem}</p>
        <p className="text-xs text-amber-100/80">
          {noApp
            ? "Libere câmera e microfone para o BION nas configurações do celular (Configurações → Apps → BION → Permissões) e veja se outro app não está usando o dispositivo."
            : "Verifique as permissões do navegador (ícone de cadeado na barra de endereço) e se outro app não está usando o dispositivo."} Você pode continuar a consulta e tocar nos botões de
          microfone e câmera abaixo para tentar de novo — eles pedem o acesso outra vez, sem precisar
          sair da sala.
        </p>
      </div>
    </div>
  );
}
