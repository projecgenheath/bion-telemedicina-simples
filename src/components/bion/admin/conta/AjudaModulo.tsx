"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, CircleHelp, LifeBuoy, Search } from "lucide-react";
import { urlDa } from "@/lib/rotas";
import { TelaModulo } from "../ui/TelaModulo";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { FAQ_ADMIN, buscarFaq } from "./ajuda";

/** Ajuda do admin no visual Torre BION: perguntas frequentes com atalho para o módulo. */
export function AjudaModulo() {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const faqs = useMemo(() => buscarFaq(FAQ_ADMIN, busca), [busca]);

  return (
    <TelaModulo
      titulo="Ajuda"
      icone={CircleHelp}
      subtitulo="Respostas rápidas sobre a gestão do app"
      ferramentas={
        <label className="relative flex-1 min-w-0 max-w-2xl">
          <span className="sr-only">Buscar na ajuda</span>
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por repasse, médico, LGPD…" className="ba-entrada !pl-10" />
        </label>
      }
    >
      <div className="max-w-3xl space-y-2">
        {faqs.length === 0 ? (
          <div className="ba-card" data-denso="true">
            <EstadoVazio icone={Search} titulo="Nada encontrado" texto={`Nenhuma resposta para “${busca.trim()}”. Tente outra palavra.`} />
          </div>
        ) : (
          faqs.map((f) => {
            const aberto = aberta === f.pergunta;
            const id = `faq-${FAQ_ADMIN.indexOf(f)}`;
            return (
              <div key={f.pergunta} className="ba-card" data-denso="true">
                <button type="button" onClick={() => setAberta(aberto ? null : f.pergunta)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={aberto} aria-controls={id}>
                  <div className="min-w-0">
                    <ChipEstado tom="neutro" ponto={false}>
                      {f.categoria}
                    </ChipEstado>
                    <p className="font-bold text-sm mt-1 break-words">{f.pergunta}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 shrink-0 ba-texto-3 motion-safe:transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {aberto ? (
                  <div id={id} className="mt-2 space-y-2">
                    <p className="text-sm ba-texto-2 leading-relaxed">{f.resposta}</p>
                    {f.destino ? (
                      <button type="button" onClick={() => router.push(urlDa(f.destino!))} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
                        Abrir <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        <div className="ba-aviso" data-tom="sinal">
          <LifeBuoy className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>Dúvida técnica ou algo fora do lugar? Fale com a equipe de desenvolvimento.</p>
        </div>
      </div>
    </TelaModulo>
  );
}
