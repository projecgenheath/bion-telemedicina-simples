"use client";

/* Coluna esquerda das mensagens (etapa 4, ref. 06): conversas reais do médico. */

import { useMemo, useRef, useState } from "react";
import { ListFilter, Search, X } from "lucide-react";
import type { Mensagem } from "@/lib/bion-tipos";
import { iniciais, type PacienteDoMedico } from "../metricas";
import { conversasDoMedico, filtrarConversas, horaCurta } from "./mensagens-dados";

export function ListaConversas({
  pacientes,
  mensagens,
  meuId,
  naoLidasPorPaciente,
  atualChave,
  agora,
  onAbrir,
}: {
  pacientes: PacienteDoMedico[];
  mensagens: Mensagem[];
  meuId: string;
  naoLidasPorPaciente: ReadonlyMap<string, number>;
  atualChave: string;
  agora: number;
  onAbrir?: (p: PacienteDoMedico) => void;
}) {
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);
  const itens = useMemo(
    () => conversasDoMedico(pacientes, mensagens, meuId, naoLidasPorPaciente, atualChave),
    [pacientes, mensagens, meuId, naoLidasPorPaciente, atualChave],
  );
  const visiveis = filtrarConversas(itens, busca, soNaoLidas);

  return (
    <section className="bm2-msg-lista" aria-label="Conversas">
      <div className="bm2-msg-lista-cab">
        <h3>{soNaoLidas ? "Não lidas" : "Todas as mensagens"}</h3>
        <div className="bm2-msg-redondos">
          <button
            type="button"
            className="bm2-agenda-redondo"
            aria-pressed={soNaoLidas}
            aria-label="Mostrar só conversas não lidas"
            onClick={() => setSoNaoLidas((v) => !v)}
          >
            <ListFilter aria-hidden />
          </button>
          <button
            type="button"
            className="bm2-agenda-redondo"
            aria-expanded={buscaAberta}
            aria-label={buscaAberta ? "Fechar busca de conversas" : "Buscar conversa"}
            onClick={() => {
              setBuscaAberta((v) => !v);
              setBusca("");
              setTimeout(() => buscaRef.current?.focus(), 0);
            }}
          >
            {buscaAberta ? <X aria-hidden /> : <Search aria-hidden />}
          </button>
        </div>
      </div>
      {buscaAberta ? (
        <label
          className="bm2-msg-lista-busca"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setBusca("");
              setBuscaAberta(false);
            }
          }}
        >
          <Search aria-hidden />
          <span className="sr-only">Buscar conversa pelo nome do paciente</span>
          <input ref={buscaRef} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do paciente…" autoComplete="off" />
        </label>
      ) : null}
      {visiveis.length === 0 ? (
        <p className="bm2-vazio px-4 py-3">{soNaoLidas ? "Nenhuma conversa não lida." : "Nenhuma conversa encontrada."}</p>
      ) : (
        <ul className="bm2-msg-itens">
          {visiveis.map(({ paciente: p, ultima, naoLidas }) => {
            const atual = p.chave === atualChave;
            const previa = ultima ? `${ultima.deId === meuId ? "Você: " : ""}${ultima.texto}` : "Sem mensagens ainda";
            return (
              <li key={p.chave}>
                <button
                  type="button"
                  className={`bm2-msg-item ${atual ? "bm2-msg-item-atual" : ""}`}
                  aria-current={atual ? "true" : undefined}
                  aria-label={`${p.nome}${naoLidas ? `, ${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : ""}. ${previa}`}
                  onClick={() => (atual ? undefined : onAbrir?.(p))}
                >
                  <span aria-hidden className="bm2-avatar bm2-msg-avatar">
                    {iniciais(p.nome)}
                  </span>
                  <span className="bm2-msg-item-texto">
                    <span className="bm2-msg-item-nome">{p.nome}</span>
                    <span className="bm2-msg-item-previa">{previa}</span>
                  </span>
                  <span className="bm2-msg-item-lado">
                    {naoLidas ? <span className="bm2-msg-selo">{naoLidas}</span> : <span aria-hidden className="bm2-msg-selo-vazio" />}
                    {ultima ? <span className="bm2-msg-item-hora">{horaCurta(ultima.ts, agora)}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
