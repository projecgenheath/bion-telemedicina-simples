"use client";

/* ==================================================================== */
/* Mensagens do paciente (etapa 3) no desenho das mensagens do médico   */
/* (ref. 06): lista de conversas, conversa e resumo do médico em três   */
/* colunas a partir de 1024 px; no celular, a lista e a conversa em     */
/* tela cheia. Mesmas regras de antes: conversa com o médico de uma     */
/* consulta não cancelada, aberta até 30 dias depois da última consulta */
/* (o servidor também confere), envio pelo POST /api/mensagens do store */
/* e o texto só sai do campo com a confirmação do servidor.            */
/* ==================================================================== */

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, CalendarPlus, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, FileText, FlaskConical, ListFilter, MessageCircle, Pill, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { useVoltarFecha } from "../useVoltarFecha";
import { contarDocumentos, horaCurta, horaMensagem, iniciaisNome, linhasDaConversa, previaMensagem, rotuloDia } from "./etapa3-dados";

const JANELA_DIAS = 30;
const MAX_TEXTO = 4000; // limite do POST /api/mensagens
const TELA_LARGA = "(min-width: 1024px)";

function useTelaLarga() {
  return useSyncExternalStore(
    (aviso) => {
      const mq = window.matchMedia(TELA_LARGA);
      mq.addEventListener("change", aviso);
      return () => mq.removeEventListener("change", aviso);
    },
    () => window.matchMedia(TELA_LARGA).matches,
    () => false,
  );
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function TelaMensagensPaciente({
  ativo = true,
  conversaAtiva,
  onConversa,
  onDocumentos,
  onAgendar,
}: {
  /** Tela à vista (o painel da direita aberto). */
  ativo?: boolean;
  conversaAtiva: string | null;
  onConversa: (medicoId: string | null) => void;
  onDocumentos: () => void;
  onAgendar: () => void;
}) {
  const { consultas, documentos, medicos, sessao, mensagens, enviarMensagem, marcarConversaLida } = useBion();
  const larga = useTelaLarga();
  const agora = Date.now();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaConversa, setBuscaConversa] = useState("");
  const [resumoRecolhido, setResumoRecolhido] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  /* Contatos: médicos das consultas não canceladas (mesma regra de antes). */
  const contatos = useMemo(() => {
    const porMedico = new Map<string, { id: string; nome: string; especialidade: string; ultima: number }>();
    for (const c of consultas.filter((x) => x.paciente === sessao.nome && x.status !== "cancelada")) {
      if (!c.medicoId) continue;
      const atual = porMedico.get(c.medicoId);
      if (!atual || c.ts > atual.ultima) porMedico.set(c.medicoId, { id: c.medicoId, nome: c.medico, especialidade: c.especialidade, ultima: c.ts });
    }
    return [...porMedico.values()]
      .map((m) => {
        const fim = m.ultima + JANELA_DIAS * 86_400_000;
        const daConversa = mensagens.filter((msg) => (msg.deId === m.id && msg.paraId === sessao.id) || (msg.deId === sessao.id && msg.paraId === m.id));
        const ultimaMsg = daConversa.reduce<(typeof daConversa)[number] | undefined>((u, x) => (!u || x.ts > u.ts ? x : u), undefined);
        return {
          ...m,
          aberta: Date.now() <= fim,
          fimDias: Math.max(0, Math.ceil((fim - Date.now()) / 86_400_000)),
          naoLidas: daConversa.filter((msg) => msg.deId === m.id && !msg.lida).length,
          ultimaMsg,
        };
      })
      .sort((a, b) => (b.ultimaMsg?.ts ?? b.ultima) - (a.ultimaMsg?.ts ?? a.ultima));
  }, [consultas, sessao.nome, sessao.id, mensagens]);

  const visiveis = contatos.filter((c) => (!soNaoLidas || c.naoLidas > 0) && (!busca.trim() || semAcento(c.nome).includes(semAcento(busca.trim()))));
  const contatoAtivo = contatos.find((c) => c.id === conversaAtiva);

  const conversa = useMemo(() => {
    if (!conversaAtiva) return [];
    return mensagens
      .filter((m) => (m.deId === conversaAtiva && m.paraId === sessao.id) || (m.deId === sessao.id && m.paraId === conversaAtiva))
      .sort((a, b) => a.ts - b.ts);
  }, [mensagens, conversaAtiva, sessao.id]);
  const qConversa = semAcento(buscaConversa.trim());
  const conversaVisivel = larga && qConversa ? conversa.filter((m) => semAcento(m.texto).includes(qConversa)) : conversa;

  /* Conversa em tela cheia abaixo de 1024 px: trava a rolagem da página, acompanha o teclado e fecha com o "voltar". */
  const conversaAberta = Boolean(conversaAtiva && contatoAtivo);
  const telaCheia = conversaAberta && !larga;
  useVoltarFecha(telaCheia, () => onConversa(null));
  const [alturaVisivel, setAlturaVisivel] = useState<number | null>(null);
  useEffect(() => {
    if (!telaCheia) return;
    const html = document.documentElement;
    const antes = { body: document.body.style.overflow, html: html.style.overflow };
    document.body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    const vv = window.visualViewport;
    const ajustar = () => setAlturaVisivel(vv ? vv.height : null);
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);
    return () => {
      document.body.style.overflow = antes.body;
      html.style.overflow = antes.html;
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      setAlturaVisivel(null);
    };
  }, [telaCheia]);

  const fimListaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fimListaRef.current?.scrollIntoView({ block: "end" });
  }, [conversa.length, conversaAtiva, alturaVisivel]);
  useEffect(() => {
    setBuscaConversa("");
  }, [conversaAtiva]);

  const abrir = (id: string) => {
    onConversa(id);
    marcarConversaLida(id);
  };

  /* No computador (≥ 1024 px), a conversa mais recente abre sozinha e é marcada
     como lida, como nas mensagens do médico. No celular a lista vem primeiro. */
  const maisRecente = contatos[0]?.id;
  useEffect(() => {
    if (!ativo || !larga || conversaAtiva || !maisRecente) return;
    onConversa(maisRecente);
    marcarConversaLida(maisRecente);
  }, [ativo, larga, conversaAtiva, maisRecente, onConversa, marcarConversaLida]);

  const enviar = async () => {
    if (!contatoAtivo || enviando) return;
    if (!contatoAtivo.aberta) {
      toast.error("A janela de 30 dias desta conversa já encerrou.");
      return;
    }
    const t = texto.trim().slice(0, MAX_TEXTO);
    if (!t) return;
    setEnviando(true);
    // A8: só limpa o campo com a confirmação do servidor; em falha, o texto fica.
    const ok = await enviarMensagem(contatoAtivo.id, t);
    setEnviando(false);
    if (ok) setTexto("");
  };

  /* ----------------------------- Lista ----------------------------- */
  const lista = (
    <section className="bp2-msg-lista" aria-labelledby="bp2-msg-lista-t">
      <div className="bp2-msg-lista-cab">
        <h3 id="bp2-msg-lista-t">{soNaoLidas ? "Não lidas" : "Todas as mensagens"}</h3>
        <div className="bp2-msg-redondos">
          <button type="button" className="bp2-redondo" aria-pressed={soNaoLidas} aria-label="Mostrar só conversas não lidas" onClick={() => setSoNaoLidas((v) => !v)}>
            <ListFilter aria-hidden />
          </button>
          <button
            type="button"
            className="bp2-redondo"
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
          className="bp2-msg-lista-busca"
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
          <span className="sr-only">Buscar conversa pelo nome do médico</span>
          <input ref={buscaRef} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do médico…" autoComplete="off" />
        </label>
      ) : null}
      {contatos.length === 0 ? (
        <div className="bp2-msg-vazio">
          <span className="bp2-assist-icone" aria-hidden>
            <MessageCircle className="h-5 w-5" />
          </span>
          <p className="text-[14px] font-medium">Nenhuma conversa ainda</p>
          <p className="text-[12.5px] bp2-t-2">Ao agendar uma consulta, você pode falar com o médico por aqui até 30 dias depois dela.</p>
          <button type="button" onClick={onAgendar} className="bp2-botao-azul mt-1 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium">
            <CalendarPlus className="h-4 w-4" aria-hidden /> Agendar consulta
          </button>
        </div>
      ) : visiveis.length === 0 ? (
        <p className="bp2-vazio px-3 py-3">{soNaoLidas ? "Nenhuma conversa não lida." : "Nenhuma conversa encontrada."}</p>
      ) : (
        <ul className="bp2-msg-itens">
          {visiveis.map((c) => {
            const atual = larga && c.id === conversaAtiva;
            const previa = previaMensagem(c.ultimaMsg);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-conversa={c.id}
                  className={`bp2-msg-item ${atual ? "bp2-msg-item-atual" : ""}`}
                  aria-current={atual ? "true" : undefined}
                  aria-label={`${c.nome}, ${c.especialidade}${c.naoLidas ? `, ${c.naoLidas} não lida${c.naoLidas > 1 ? "s" : ""}` : ""}. ${previa}${c.aberta ? "" : ". Janela de 30 dias encerrada"}`}
                  onClick={() => (atual ? undefined : abrir(c.id))}
                >
                  <span aria-hidden className="bp2-avatar bp2-msg-avatar">
                    {iniciaisNome(c.nome)}
                  </span>
                  <span className="bp2-msg-item-texto">
                    <span className="bp2-msg-item-nome">{c.nome}</span>
                    <span className="bp2-msg-item-previa">{previa}</span>
                  </span>
                  <span className="bp2-msg-item-lado">
                    {c.naoLidas ? <span className="bp2-msg-selo">{c.naoLidas}</span> : <span aria-hidden className="bp2-msg-selo-vazio" />}
                    {c.ultimaMsg ? <span className="bp2-msg-item-hora">{horaCurta(c.ultimaMsg.ts, agora)}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="bp2-msg-nota">Converse com o médico da sua consulta, do agendamento até 30 dias depois dela.</p>
    </section>
  );

  if (!contatoAtivo) {
    return (
      <div className={`bp2-msg-grade ${larga ? "bp2-msg-sem-conversa" : ""}`}>
        {lista}
        {larga && contatos.length > 0 ? (
          <section className="bp2-msg-chat bp2-msg-chat-vazio" aria-label="Conversa">
            <span className="bp2-assist-icone" aria-hidden>
              <MessageCircle className="h-5 w-5" />
            </span>
            <p className="text-[14px] font-medium">Escolha uma conversa</p>
            <p className="text-[12.5px] bp2-t-2">As mensagens com o médico aparecem aqui.</p>
          </section>
        ) : null}
      </div>
    );
  }

  /* --------------------------- Conversa ---------------------------- */
  const sub = contatoAtivo.aberta ? `Conversa aberta por ${contatoAtivo.fimDias} dia${contatoAtivo.fimDias === 1 ? "" : "s"}` : "Janela de 30 dias encerrada";
  const linhas = linhasDaConversa(conversaVisivel);
  const log = (
    <div className="bp2-msg-log" role="log" aria-live="polite" aria-label={`Mensagens com ${contatoAtivo.nome}`} tabIndex={0}>
      {conversa.length === 0 ? (
        <p className="bp2-msg-primeira">Envie a primeira mensagem para {contatoAtivo.nome.replace(/\.$/, "")}.</p>
      ) : linhas.length === 0 ? (
        <p className="bp2-msg-primeira">Nenhuma mensagem com “{buscaConversa}”.</p>
      ) : (
        linhas.map(({ m, novoDia, juntaComProxima }) => (
          <Fragment key={m.id}>
            {novoDia ? (
              <p className="bp2-msg-dia">
                <span>{rotuloDia(m.ts, agora)}</span>
              </p>
            ) : null}
            <div className={`bp2-msg-linha ${m.minha ? "bp2-msg-minha" : "bp2-msg-dele"} ${juntaComProxima ? "bp2-msg-junta" : ""}`}>
              <div className="bp2-msg-balao">
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              </div>
              <p className={`bp2-msg-hora ${juntaComProxima ? "sr-only" : ""}`}>
                <span className="sr-only">{m.minha ? "Você, " : `${contatoAtivo.nome}, `}{m.quando}</span>
                <span aria-hidden>{horaMensagem(m.ts)}</span>
                {m.minha ? (m.lida ? " · lida" : " · enviada") : ""}
              </p>
            </div>
          </Fragment>
        ))
      )}
      <div ref={fimListaRef} />
    </div>
  );

  const compositor = contatoAtivo.aberta ? (
    <form
      className="bp2-msg-compositor"
      data-compositor
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Mensagem para {contatoAtivo.nome}</span>
        <textarea
          ref={campoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={1}
          maxLength={MAX_TEXTO}
          placeholder="Escreva uma mensagem"
          className="bp2-msg-campo"
        />
      </label>
      <button type="submit" disabled={enviando || !texto.trim()} aria-label={enviando ? "Enviando mensagem…" : "Enviar mensagem"} className="bp2-msg-enviar">
        {enviando ? <span className="text-[11px] font-medium">…</span> : <Send aria-hidden />}
      </button>
    </form>
  ) : (
    <div className="bp2-msg-compositor bp2-msg-encerrada" data-compositor>
      <p className="text-[12.5px] bp2-t-2">A janela de 30 dias desta conversa encerrou. Para falar com {contatoAtivo.nome}, agende um retorno.</p>
      <button type="button" onClick={onAgendar} className="bp2-botao-azul inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium">
        <CalendarPlus className="h-4 w-4" aria-hidden /> Agendar
      </button>
    </div>
  );

  if (telaCheia) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bp2-msg-conversa-t"
        className="bp2-msg-cheia bp2-v2"
        style={{ height: alturaVisivel ? `${alturaVisivel}px` : "100dvh" }}
      >
        <header className="bp2-msg-cheia-topo">
          <button type="button" onClick={() => onConversa(null)} aria-label="Voltar para as conversas" title="Voltar" className="bp2-redondo bp2-redondo-topo">
            <ArrowLeft className="h-[1.05rem] w-[1.05rem]" aria-hidden />
          </button>
          <span aria-hidden className="bp2-avatar bp2-msg-chat-avatar">
            {iniciaisNome(contatoAtivo.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="bp2-msg-conversa-t" className="bp2-msg-chat-nome">{contatoAtivo.nome}</h2>
            <p className="bp2-msg-chat-sub">{sub}</p>
          </div>
        </header>
        {log}
        {compositor}
      </div>
    );
  }

  /* ---------------------- Três colunas (≥ 1024) ---------------------- */
  const docsDoMedico = documentos.filter((d) => d.medicoId === contatoAtivo.id || (!d.medicoId && d.medico === contatoAtivo.nome));
  const n = contarDocumentos(docsDoMedico);
  const proxima = consultas
    .filter((c) => c.medicoId === contatoAtivo.id && c.paciente === sessao.nome && c.ts > agora && c.status !== "cancelada")
    .sort((a, b) => a.ts - b.ts)[0];
  const especialidade = medicos.find((m) => m.id === contatoAtivo.id)?.especialidade ?? contatoAtivo.especialidade;
  const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
  const registros = [
    { rotulo: "Receitas", Icone: Pill, tom: "lavanda", sub: plural(n.receitas, "receita", "receitas") },
    { rotulo: "Pedidos de exame", Icone: FlaskConical, tom: "pessego", sub: plural(n.pedidos, "pedido", "pedidos") },
    { rotulo: "Atestados", Icone: FileText, tom: "azul", sub: plural(n.atestados, "atestado", "atestados") },
  ];

  return (
    <div className={`bp2-msg-grade ${resumoRecolhido ? "bp2-msg-sem-resumo" : ""}`}>
      {lista}
      <section className="bp2-msg-chat" aria-labelledby="bp2-msg-chat-t">
        <div className="bp2-msg-chat-cab">
          <span aria-hidden className="bp2-avatar bp2-msg-chat-avatar">
            {iniciaisNome(contatoAtivo.nome)}
          </span>
          <span className="min-w-0 flex-1">
            <h3 id="bp2-msg-chat-t" className="bp2-msg-chat-nome">{contatoAtivo.nome}</h3>
            <span className="bp2-msg-chat-sub">{sub}</span>
          </span>
          <label className="bp2-msg-chat-busca">
            <Search aria-hidden />
            <span className="sr-only">Buscar nesta conversa</span>
            <input type="search" value={buscaConversa} onChange={(e) => setBuscaConversa(e.target.value)} placeholder="Buscar…" autoComplete="off" />
          </label>
          {resumoRecolhido ? (
            <button type="button" className="bp2-msg-icone" aria-label="Mostrar o resumo do médico" onClick={() => setResumoRecolhido(false)}>
              <ChevronsLeft aria-hidden />
            </button>
          ) : null}
        </div>
        {log}
        {compositor}
      </section>
      {!resumoRecolhido ? (
        <section className="bp2-msg-resumo" aria-label={`Resumo de ${contatoAtivo.nome}`}>
          <div className="bp2-msg-resumo-topo">
            <button type="button" className="bp2-msg-icone" aria-label="Recolher o resumo do médico" onClick={() => setResumoRecolhido(true)}>
              <ChevronsRight aria-hidden />
            </button>
          </div>
          <div className="bp2-msg-resumo-pessoa">
            <span aria-hidden className="bp2-avatar bp2-msg-resumo-avatar">
              {iniciaisNome(contatoAtivo.nome)}
            </span>
            <strong>{contatoAtivo.nome}</strong>
            <span>{especialidade}</span>
          </div>
          <dl className="bp2-msg-blocos">
            <div>
              <dd>{proxima ? `${proxima.data} às ${proxima.hora}` : "Sem consulta marcada"}</dd>
              <dt>Próxima consulta</dt>
            </div>
            <div>
              <dd>{contatoAtivo.aberta ? `Aberta por ${contatoAtivo.fimDias} dia${contatoAtivo.fimDias === 1 ? "" : "s"}` : "Encerrada"}</dd>
              <dt>Janela de 30 dias</dt>
            </div>
          </dl>
          <section className="bp2-msg-registros" aria-labelledby="bp2-msg-reg-t">
            <h4 id="bp2-msg-reg-t">Documentos deste médico</h4>
            <ul>
              {registros.map((r) => (
                <li key={r.rotulo}>
                  <button type="button" onClick={onDocumentos} aria-label={`${r.rotulo}: ${r.sub}. Abrir os documentos`}>
                    <span aria-hidden className={`bp2-msg-registro-icone bp2-msg-tom-${r.tom}`}>
                      <r.Icone />
                    </span>
                    <span className="bp2-msg-registro-texto">
                      <span>{r.rotulo}</span>
                      <span>{r.sub}</span>
                    </span>
                    <ChevronRight aria-hidden className="bp2-msg-seta" />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={onDocumentos} aria-label="Abrir todos os documentos">
                  <span aria-hidden className="bp2-msg-registro-icone bp2-msg-tom-forte">
                    <ClipboardList />
                  </span>
                  <span className="bp2-msg-registro-texto">
                    <span>Todos os documentos</span>
                    <span>Receitas, atestados e pedidos</span>
                  </span>
                  <ChevronRight aria-hidden className="bp2-msg-seta" />
                </button>
              </li>
            </ul>
          </section>
        </section>
      ) : null}
    </div>
  );
}
