"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Inbox, Ruler } from "lucide-react";

type ItemResultado = {
  id: string;
  tipo: "medicao" | "exame";
  pacienteId: string;
  pacienteNome: string;
  titulo: string;
  detalhe: string;
  ts: number;
  foraDaReferencia: number;
};

const fmtQuando = (ts: number) =>
  new Date(ts).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Inbox "Resultados para revisar" (item 13 da auditoria de melhorias):
 * medições respondidas e exames postados pelos pacientes do médico, por
 * recência. Busca os próprios dados (GET /api/medico/resultados) — o
 * bootstrap não carrega medições/exames para o médico.
 *
 * "Visto" sem migração: ao exibir a lista, as notificações de resultado
 * não lidas são marcadas como lidas (PATCH /api/notificacoes), que é o
 * estado que o sino/contadores já leem.
 */
export function ResultadosRevisar({
  onAbrirPaciente,
}: {
  onAbrirPaciente: (pacienteId: string) => void;
}) {
  const [itens, setItens] = useState<ItemResultado[] | null>(null);
  const [novos, setNovos] = useState(0);
  const [erro, setErro] = useState(false);
  const marcouRef = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/medico/resultados", { credentials: "include" });
      if (!res.ok) throw new Error("resultados");
      const j = (await res.json()) as { itens?: ItemResultado[]; naoLidasIds?: string[] };
      setItens(j.itens ?? []);
      setErro(false);
      const ids = j.naoLidasIds ?? [];
      setNovos(ids.length);
      if (ids.length && !marcouRef.current) {
        marcouRef.current = true;
        for (const id of ids) {
          void fetch("/api/notificacoes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          }).catch(() => {});
        }
      }
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !itens) {
    return (
      <div className="bp-glass p-4 mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Não foi possível carregar os resultados recentes.</p>
        <button
          type="button"
          onClick={() => void carregar()}
          className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 shrink-0"
        >
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!itens || itens.length === 0) return null;

  return (
    <section aria-labelledby="bm-resultados-titulo" className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <Inbox className="w-4 h-4 text-bion-sea dark:text-sky-300" aria-hidden />
        <h3 id="bm-resultados-titulo" className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
          Resultados para revisar
        </h3>
        {novos > 0 ? (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
            {novos}
          </span>
        ) : null}
      </div>
      <ul className="space-y-2">
        {itens.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onAbrirPaciente(it.pacienteId)}
              className="bp-glass w-full p-3.5 flex items-start gap-3 text-left"
              aria-label={`${it.titulo} de ${it.pacienteNome}. ${it.detalhe}`}
            >
              <span className="w-9 h-9 rounded-xl bg-bion-sea/15 text-bion-sea dark:text-sky-300 inline-flex items-center justify-center shrink-0">
                {it.tipo === "medicao" ? <Ruler className="w-4 h-4" aria-hidden /> : <FlaskConical className="w-4 h-4" aria-hidden />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold truncate">
                  {it.pacienteNome} <span className="font-semibold text-bion-ink/75 dark:text-bion-paper/75">· {it.titulo}</span>
                </span>
                <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75 truncate">{it.detalhe}</span>
                {it.foraDaReferencia > 0 ? (
                  <span className="inline-block mt-1 text-[11px] font-bold rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-900 dark:text-amber-100">
                    {it.foraDaReferencia} {it.foraDaReferencia === 1 ? "valor fora" : "valores fora"} da referência
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] text-bion-ink/60 dark:text-bion-paper/60 shrink-0">{fmtQuando(it.ts)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
