"use client";

import { useMemo, useRef } from "react";
import { CalendarDays, FileUp, X } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { LinhaConsultaPagamento } from "./LinhaConsultaPagamento";
import { EstadoVazio } from "./EstadosPaciente";

/**
 * "Ver tudo" do Perfil (fase 3): consultas e pagamentos (lista única) ou
 * uploads em tela cheia. Substitui as listas com rolagem dentro da rolagem.
 */
export type ListaPerfil = "consultas" | "uploads";

const TITULO: Record<ListaPerfil, { titulo: string; descricao: string }> = {
  consultas: { titulo: "Consultas e pagamentos", descricao: "Todas as suas consultas com o pagamento de cada uma, da mais recente para a mais antiga." },
  uploads: { titulo: "Uploads na BION IA", descricao: "Laudos e exames que você enviou." },
};

export function TelaListaCompleta({ lista, onFechar, onAgendar }: { lista: ListaPerfil; onFechar: () => void; onAgendar: () => void }) {
  const { consultas, sessao, arquivos } = useBion();
  const raizRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, raizRef);

  const doPaciente = useMemo(
    () => consultas.filter((c) => c.paciente === sessao.nome).sort((a, b) => b.ts - a.ts),
    [consultas, sessao.nome],
  );
  const uploads = useMemo(
    () => arquivos.filter((a) => a.enviadoPor === "paciente" || a.consulta === "BION IA"),
    [arquivos],
  );
  const { titulo, descricao } = TITULO[lista];

  return (
    <div ref={raizRef} className="bpp-sobreposicao absolute inset-0 z-50 overflow-y-auto bp-coluna" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="min-h-full bp-painel">
        <div className="bpp-surgir mx-auto w-full max-w-xl px-5 bp-safe-top pb-16">
          <div className="flex items-start justify-between gap-4 pt-2">
            <div>
              <h2 className="text-xl font-bold text-bion-ink dark:text-bion-paper">{titulo}</h2>
              <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">{descricao}</p>
            </div>
            <button type="button" onClick={onFechar} aria-label="Fechar lista" className="bpp-toque mt-1 w-11 h-11 inline-flex items-center justify-center rounded-full bp-glass text-bion-ink dark:text-bion-paper shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5">
            {lista === "consultas" ? (
              doPaciente.length === 0 ? (
                <EstadoVazio icone={<CalendarDays className="w-6 h-6" />} titulo="Nenhuma consulta ainda" texto="Quando você agendar, ela aparece aqui." acao={{ rotulo: "Agendar com a BION IA", onClick: onAgendar }} />
              ) : (
                <ul className="bp-glass p-2">
                  {doPaciente.map((c) => (
                    <li key={c.id}>
                      <LinhaConsultaPagamento c={c} detalhada />
                    </li>
                  ))}
                </ul>
              )
            ) : uploads.length === 0 ? (
              <EstadoVazio icone={<FileUp className="w-6 h-6" />} titulo="Nenhum upload ainda" texto="Envie um laudo pela BION IA e os resultados aparecem em Exames." acao={{ rotulo: "Enviar pela BION IA", onClick: onAgendar }} />
            ) : (
              <ul className="bp-glass p-2">
                {uploads.map((a) => (
                  <li key={a.id} className="bpp-linha">
                    <FileUp className="w-4 h-4 shrink-0 text-bion-ink/75 dark:text-bion-paper/75" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm font-semibold text-bion-ink dark:text-bion-paper truncate">{a.nome}</span>
                    <span className="text-xs text-bion-ink/75 dark:text-bion-paper/75 shrink-0">{a.data} · {a.tamanhoKb} KB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
