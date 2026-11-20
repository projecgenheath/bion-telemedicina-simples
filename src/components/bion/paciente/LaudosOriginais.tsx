"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import type { Arquivo, ExameLab } from "@/lib/bion-tipos";
import { abrirArquivoOriginal, laudoTemResultado } from "./laudos-originais";

/** Arquivos enviados à BION IA. Se a leitura não extraiu valores, o original continua aqui. */
export function LaudosOriginais({ arquivos, exames }: { arquivos: Arquivo[]; exames: ExameLab[] }) {
  const [abrindo, setAbrindo] = useState<string | null>(null);
  if (arquivos.length === 0) return null;

  const ver = async (a: Arquivo) => {
    if (!a.storagePath) return;
    setAbrindo(a.id);
    const r = await abrirArquivoOriginal(a.id, a.nome);
    setAbrindo(null);
    if (!r.ok) toast.error(r.erro);
  };

  return (
    <section aria-label="Arquivos originais dos laudos" className="mt-5 flex flex-col gap-3">
      <h3 className="text-sm font-bold">Arquivos enviados</h3>
      <ul className="flex flex-col gap-2">
        {arquivos.map((a) => {
          const leu = laudoTemResultado(a.nome, exames);
          return (
            <li key={a.id} className="bp-glass-marinho p-4 flex items-center gap-3">
              <FileText className="w-5 h-5 shrink-0 text-white/80" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate">{a.nome}</span>
                <span className="block text-xs text-white/75">
                  {a.storagePath
                    ? leu
                      ? "Resultados acima. O arquivo original continua aqui."
                      : "A leitura não extraiu resultados. O arquivo original continua aqui."
                    : "A leitura não guardou o arquivo. Envie de novo para poder abri-lo."}
                </span>
              </span>
              {a.storagePath ? (
                <button
                  type="button"
                  onClick={() => void ver(a)}
                  disabled={abrindo === a.id}
                  className="bion-toque shrink-0 min-h-11 rounded-full bg-white/15 px-3 text-xs font-bold disabled:opacity-60"
                >
                  {abrindo === a.id ? "Abrindo…" : "Ver arquivo"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
