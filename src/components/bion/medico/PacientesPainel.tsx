"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Search, Users } from "lucide-react";
import { iniciais, ROTULO_STATUS, type PacienteDoMedico } from "./metricas";
import type { DadosMedico } from "./useDadosMedico";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Página à DIREITA do carrossel — pacientes agendados/atendidos. */
export function PacientesPainel({
  dados,
  onAbrirPaciente,
}: {
  dados: DadosMedico;
  onAbrirPaciente: (p: PacienteDoMedico) => void;
}) {
  const { listaPacientes, naoLidasPorPaciente } = dados;
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const t = normalizar(busca.trim());
    if (!t) return listaPacientes;
    return listaPacientes.filter((p) => normalizar(p.nome).includes(t));
  }, [busca, listaPacientes]);

  const totalNaoLidas = [...naoLidasPorPaciente.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="bm-painel h-full flex flex-col bp-safe-top" aria-labelledby="bm-pac-titulo">
      <div className="px-5 pt-8 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 id="bm-pac-titulo" className="text-2xl font-black">
            Pacientes
          </h2>
          {totalNaoLidas > 0 ? (
            <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950">
              {totalNaoLidas} não {totalNaoLidas === 1 ? "lida" : "lidas"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Ordenados pela próxima consulta.</p>
        <label className="mt-3 relative block">
          <span className="sr-only">Buscar paciente</span>
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            className="bp-entrada w-full pl-10 pr-4 py-2.5 text-sm"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto bp-coluna px-5 pb-20">
        {listaPacientes.length === 0 ? (
          <div className="bp-glass p-6 text-center mt-4">
            <Users className="w-8 h-8 mx-auto opacity-70" aria-hidden />
            <p className="mt-2 text-sm font-bold">Nenhum paciente ainda</p>
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Quando alguém agendar com você, aparece aqui.</p>
          </div>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-center mt-6 text-bion-ink/75 dark:text-bion-paper/75">Nenhum paciente encontrado para “{busca}”.</p>
        ) : (
          <ul className="space-y-2">
            {filtrados.map((p) => {
              const naoLidas = p.pacienteId ? naoLidasPorPaciente.get(p.pacienteId) ?? 0 : 0;
              const ref = p.proxima ?? p.ultima;
              const linha = p.proxima
                ? `Próxima: ${p.proxima.data} às ${p.proxima.hora}`
                : ref
                  ? `Última: ${ref.data} · ${ROTULO_STATUS[ref.status]}`
                  : "";
              return (
                <li key={p.chave}>
                  <button
                    type="button"
                    onClick={() => onAbrirPaciente(p)}
                    className="bp-glass w-full p-3.5 flex items-center gap-3 text-left"
                    aria-label={`${p.nome}. ${linha}${naoLidas ? `. ${naoLidas} mensagens não lidas` : ""}`}
                  >
                    <span className="w-11 h-11 rounded-2xl bg-bion-sea text-white inline-flex items-center justify-center text-sm font-black shrink-0">
                      {iniciais(p.nome)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate">{p.nome}</span>
                      <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75 truncate">{linha}</span>
                    </span>
                    {naoLidas > 0 ? (
                      <span className="min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold inline-flex items-center justify-center" aria-hidden>
                        {naoLidas}
                      </span>
                    ) : (
                      <MessageCircle className="w-4 h-4 opacity-60" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
