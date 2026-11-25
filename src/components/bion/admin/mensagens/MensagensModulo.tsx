"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { contatosMensagensAdmin } from "../contatos-mensagens";
import { EstadoVazio } from "../ui/Estados";
import { CampoBusca } from "../ui/CampoBusca";
import { TelaModulo } from "../ui/TelaModulo";
import { useLargo } from "../ui/preferencias";

const iniciais = (nome: string) => {
  const partes = nome.split(" ").filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return (partes[0]?.[0] ?? "?").toUpperCase();
  return `${partes[0]?.[0] ?? ""}${partes[partes.length - 1]?.[0] ?? ""}`.toUpperCase() || "?";
};

/**
 * Mensagens do admin no visual da Torre. Mesmos contatos e o mesmo envio
 * da tela antiga: médico arquivado ou suspenso e paciente que não está
 * ativo ficam de fora. Paciente e médico não usam este módulo.
 */
export function MensagensModulo() {
  const { sessao, medicos, pacientes, mensagens, suporte, enviarMensagem, marcarConversaLida } = useBion();
  const largo = useLargo();
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);

  const contatos = useMemo(() => {
    const lista = contatosMensagensAdmin(medicos, pacientes, sessao.id);
    if (suporte.id && suporte.id !== sessao.id && !lista.some((c) => c.id === suporte.id)) {
      lista.push({ id: suporte.id, nome: suporte.nome, detalhe: "Atendimento BION", suporte: false });
    }
    return lista;
  }, [medicos, pacientes, sessao.id, suporte.id, suporte.nome]);

  const conversas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return contatos
      .map((contato) => {
        const thread = mensagens.filter((m) => m.deId === contato.id || m.paraId === contato.id);
        const ultima = thread[thread.length - 1];
        const naoLidas = thread.filter((m) => !m.minha && !m.lida).length;
        return { contato, ultima, naoLidas, atividade: ultima?.ts ?? 0 };
      })
      .filter((c) => !termo || `${c.contato.nome} ${c.contato.detalhe}`.toLocaleLowerCase("pt-BR").includes(termo))
      .sort((a, b) => {
        if (a.atividade && b.atividade) return b.atividade - a.atividade;
        if (a.atividade) return -1;
        if (b.atividade) return 1;
        return a.contato.nome.localeCompare(b.contato.nome, "pt-BR");
      });
  }, [contatos, mensagens, busca]);

  const ativa = conversas.find((c) => c.contato.id === ativaId)?.contato ?? (largo ? conversas[0]?.contato ?? null : null);
  const threadAtiva = useMemo(() => {
    if (!ativa) return [];
    return mensagens.filter((m) => m.deId === ativa.id || m.paraId === ativa.id).sort((a, b) => a.ts - b.ts);
  }, [mensagens, ativa]);
  const naoLidasAtivas = threadAtiva.filter((m) => !m.minha && !m.lida).length;

  useEffect(() => {
    if (ativa && naoLidasAtivas > 0) marcarConversaLida(ativa.id);
  }, [ativa, naoLidasAtivas, marcarConversaLida]);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadAtiva.length, ativa?.id]);

  const enviar = useCallback(async () => {
    const t = texto.trim();
    if (!t || !ativa) return;
    const ok = await enviarMensagem(ativa.id, t);
    if (ok) setTexto("");
  }, [texto, ativa, enviarMensagem]);

  const mostrarLista = largo || !ativa;
  const mostrarConversa = largo || !!ativa;

  return (
    <TelaModulo titulo="Mensagens" icone={MessageSquare} subtitulo="Fale com médicos e pacientes pelo suporte BION.">
      {contatos.length === 0 ? (
        <EstadoVazio icone={MessageSquare} titulo="Nenhuma conversa disponível" texto="Não há médicos nem pacientes ativos para conversar." />
      ) : (
        <div className={largo ? "grid grid-cols-[280px_1fr] gap-4 min-h-[28rem]" : "min-h-[24rem]"}>
          {mostrarLista ? (
            <div className="space-y-2 min-w-0">
              <CampoBusca valor={busca} onChange={setBusca} dica="Buscar nome" rotulo="Buscar conversa" />
              {conversas.length === 0 ? (
                <p className="text-sm ba-texto-2 px-1">Ninguém com esse nome.</p>
              ) : (
                <ul className="space-y-2 md:max-h-[32rem] md:overflow-y-auto" aria-label="Conversas">
                  {conversas.map(({ contato, ultima, naoLidas }) => (
                    <li key={contato.id}>
                      <button
                        type="button"
                        onClick={() => setAtivaId(contato.id)}
                        aria-current={ativa?.id === contato.id ? "true" : undefined}
                        className={`ba-card w-full text-left ${ativa?.id === contato.id ? "" : ""}`}
                        data-denso="true"
                        data-tom={ativa?.id === contato.id ? "sinal" : undefined}
                      >
                        <span className="flex items-center gap-3">
                          <span className="ba2-avatar grid w-10 h-10 shrink-0 place-items-center rounded-full font-medium text-xs">
                            {iniciais(contato.nome)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold leading-snug">{contato.nome}</span>
                            <span className="block text-xs ba-texto-2 leading-snug">
                              {ultima ? ultima.texto : "Comece a conversa"}
                            </span>
                          </span>
                          {naoLidas > 0 ? (
                            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--ba-sinal)" }}>
                              {naoLidas}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {mostrarConversa && ativa ? (
            <div className="ba-card flex flex-col min-h-[24rem] md:max-h-[36rem] min-w-0 overflow-hidden !p-0">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-[color:var(--ba-borda)]">
                {!largo ? (
                  <button type="button" className="ba-icone-botao" aria-label="Voltar às conversas" onClick={() => setAtivaId(null)}>
                    <ArrowLeft className="w-5 h-5" aria-hidden />
                  </button>
                ) : null}
                <span className="grid w-9 h-9 shrink-0 place-items-center rounded-xl font-bold text-xs" style={{ background: "var(--ba-sinal)", color: "white" }}>
                  {iniciais(ativa.nome)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-snug">{ativa.nome}</span>
                  <span className="block text-xs ba-texto-2 leading-snug">{ativa.detalhe}</span>
                </span>
              </div>
              <div ref={listaRef} className="flex-1 p-4 space-y-3 overflow-y-auto" aria-live="polite">
                {threadAtiva.length === 0 ? (
                  <p className="text-sm ba-texto-2 text-center py-8">
                    Nenhuma mensagem ainda. A primeira mensagem para {ativa.nome} fica registrada aqui.
                  </p>
                ) : (
                  threadAtiva.map((m) => (
                    <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
                        style={
                          m.minha
                            ? { background: "var(--ba-sinal)", color: "white" }
                            : { background: "color-mix(in srgb, var(--ba-texto) 8%, transparent)" }
                        }
                      >
                        <p className="leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className={`text-[11px] mt-1 text-right ${m.minha ? "opacity-80" : "ba-texto-3"}`}>{m.quando}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form
                className="p-3 border-t border-[color:var(--ba-borda)] flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void enviar();
                }}
              >
                <CampoBusca
                  icone={false}
                  className="flex-1"
                  valor={texto}
                  onChange={setTexto}
                  dica={`Mensagem para ${ativa.nome}`}
                  rotulo="Mensagem"
                  maxLength={4000}
                />
                <button type="submit" disabled={!texto.trim()} className="ba-botao ba-botao-primario !px-4" aria-label="Enviar mensagem">
                  <Send className="w-4 h-4" aria-hidden />
                </button>
              </form>
            </div>
          ) : null}
        </div>
      )}
      <p className="flex items-center justify-center gap-1.5 text-xs ba-texto-3 mt-4">
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
        Conversas registradas com trilha de auditoria.
      </p>
    </TelaModulo>
  );
}
