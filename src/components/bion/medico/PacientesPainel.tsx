"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, History, MessageCircle, Search, Send, Users } from "lucide-react";
import { iniciais, janelaRespostaPaciente, rotuloStatusMedico, type PacienteDoMedico } from "./metricas";
import {
  SEGMENTOS_FILTRO,
  VAZIO_POR_SEGMENTO,
  diasDesdeUltimaConsulta,
  rotuloSemConsulta,
  segmentosDoPaciente,
  textoModeloRetorno,
  type FiltroSegmento,
} from "./fidelizacao";
import { definirRascunhoRetorno } from "./rascunho-retorno";
import { ResultadosRevisar } from "./ResultadosRevisar";
import type { DadosMedico } from "./useDadosMedico";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** "30/11/2026" (fuso da clínica) para um timestamp — mesmo formato da conversa. */
const fmtData = (ts: number) =>
  new Date(ts).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

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
  // Item 33 (fidelização): filtro por segmento do vínculo; "todos" é o padrão
  // e a lista se comporta como antes. `agora` congela na abertura do painel.
  const [segmento, setSegmento] = useState<FiltroSegmento>("todos");
  const [agora] = useState(() => Date.now());
  // Chave do paciente com o aviso de janela encerrada aberto (propor retorno).
  const [avisoRetorno, setAvisoRetorno] = useState<string | null>(null);

  const comSegmentos = useMemo(
    () =>
      listaPacientes.map((p) => ({
        paciente: p,
        segmentos: segmentosDoPaciente(p.consultas, Boolean(p.proxima), agora),
      })),
    [listaPacientes, agora],
  );

  const contagens = useMemo(() => {
    const c: Record<FiltroSegmento, number> = { todos: listaPacientes.length, retorno: 0, acompanhamento: 0, inativo: 0, novo: 0 };
    for (const { segmentos } of comSegmentos) for (const s of segmentos) c[s]++;
    return c;
  }, [comSegmentos, listaPacientes.length]);

  const filtrados = useMemo(() => {
    const t = normalizar(busca.trim());
    return comSegmentos.filter(({ paciente: p, segmentos }) => {
      if (segmento !== "todos" && !segmentos.includes(segmento)) return false;
      return !t || normalizar(p.nome).includes(t);
    });
  }, [busca, comSegmentos, segmento]);

  const totalNaoLidas = [...naoLidasPorPaciente.values()].reduce((a, b) => a + b, 0);

  /** Abre a conversa já com o modelo de retorno preenchido (nunca enviado daqui). */
  const abrirComModeloRetorno = (p: PacienteDoMedico) => {
    definirRascunhoRetorno(p.chave, textoModeloRetorno(p.nome));
    setAvisoRetorno(null);
    onAbrirPaciente(p);
  };

  /**
   * "Propor retorno": se a janela de resposta do paciente já encerrou
   * (regra dos 30 dias exibida na conversa), avisa ANTES de navegar — o
   * paciente não poderá responder por aqui e o retorno depende de ele
   * agendar. Com a janela aberta, vai direto para a conversa com o modelo.
   */
  const proporRetorno = (p: PacienteDoMedico) => {
    const janela = janelaRespostaPaciente(p.consultas, Date.now());
    if (janela?.encerrada) {
      setAvisoRetorno(p.chave);
      return;
    }
    abrirComModeloRetorno(p);
  };

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
        <div className="flex gap-1.5 overflow-x-auto mt-3 pb-0.5" role="group" aria-label="Filtrar pacientes por situação">
          {SEGMENTOS_FILTRO.map((s) => {
            const ativo = segmento === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setSegmento(s.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                  ativo
                    ? "bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                    : "bg-bion-ink/8 dark:bg-white/10"
                }`}
              >
                {s.rotulo}
                <span className={ativo ? "opacity-85" : "opacity-60"}>{contagens[s.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bp-coluna px-5 pb-20">
        <ResultadosRevisar
          onAbrirPaciente={(pacienteId) => {
            const p = listaPacientes.find((x) => x.pacienteId === pacienteId);
            if (p) onAbrirPaciente(p);
          }}
        />
        {listaPacientes.length === 0 ? (
          <div className="bp-glass p-6 text-center mt-4">
            <Users className="w-8 h-8 mx-auto opacity-70" aria-hidden />
            <p className="mt-2 text-sm font-bold">Nenhum paciente ainda</p>
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Quando alguém agendar com você, aparece aqui.</p>
          </div>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-center mt-6 text-bion-ink/75 dark:text-bion-paper/75">
            {busca.trim()
              ? `Nenhum paciente encontrado para “${busca}”${segmento !== "todos" ? " neste filtro" : ""}.`
              : VAZIO_POR_SEGMENTO[segmento]}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtrados.map(({ paciente: p, segmentos }) => {
              const naoLidas = p.pacienteId ? naoLidasPorPaciente.get(p.pacienteId) ?? 0 : 0;
              const ref = p.proxima ?? p.ultima;
              const linha = p.proxima
                ? `Próxima: ${p.proxima.data} às ${p.proxima.hora}`
                : ref
                  ? `Última: ${ref.data} · ${rotuloStatusMedico(ref)}`
                  : "";
              const inativo = segmentos.includes("inativo");
              const diasParado = inativo ? diasDesdeUltimaConsulta(p.consultas, agora) : null;
              const janela = avisoRetorno === p.chave ? janelaRespostaPaciente(p.consultas, Date.now()) : null;
              return (
                <li key={p.chave}>
                  <div className="bp-glass w-full p-3.5">
                    <button
                      type="button"
                      onClick={() => onAbrirPaciente(p)}
                      className="w-full flex items-center gap-3 text-left"
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
                    {inativo && diasParado !== null ? (
                      <div className="mt-3 pt-3 border-t border-bion-ink/10 dark:border-white/10">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100">
                            <History className="w-3 h-3" aria-hidden />
                            {rotuloSemConsulta(diasParado)}
                          </span>
                          {p.pacienteId ? (
                            <button
                              type="button"
                              onClick={() => proporRetorno(p)}
                              className="rounded-full px-3 py-1.5 text-xs font-bold bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950 inline-flex items-center gap-1"
                            >
                              <Send className="w-3.5 h-3.5" aria-hidden /> Propor retorno
                            </button>
                          ) : null}
                        </div>
                        {avisoRetorno === p.chave ? (
                          <div className="mt-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3" role="alert">
                            <div className="flex gap-2">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-800 dark:text-amber-200 mt-0.5" aria-hidden />
                              <p className="text-xs text-amber-900/90 dark:text-amber-100/90">
                                A janela de resposta deste paciente
                                {janela ? ` terminou em ${fmtData(janela.limite)}` : " já terminou"}: ele{" "}
                                <strong>não consegue responder por aqui</strong> — o retorno depende de ele agendar
                                uma nova consulta. Você ainda pode deixar a mensagem com o modelo preenchido.
                              </p>
                            </div>
                            <div className="flex gap-2 mt-2.5">
                              <button
                                type="button"
                                onClick={() => abrirComModeloRetorno(p)}
                                className="rounded-full px-3 py-1.5 text-xs font-bold bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                              >
                                Abrir a conversa mesmo assim
                              </button>
                              <button
                                type="button"
                                onClick={() => setAvisoRetorno(null)}
                                className="rounded-full px-3 py-1.5 text-xs font-bold bg-bion-ink/8 dark:bg-white/10"
                              >
                                Agora não
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
