"use client";

import { useMemo, useRef, useState, type Ref } from "react";
import { ArrowLeft, ArrowUpRight, CalendarClock, CalendarPlus, ClipboardList, FileText, Plus, Search, Video, X } from "lucide-react";
import type { Consulta } from "@/lib/bion-tipos";
import { DURACAO_SLOT_MIN } from "@/lib/teleconsulta-logica";
import { useBion } from "@/lib/bion-store";
import { useVoltarFecha } from "../useVoltarFecha";
import { useFocoDialogo } from "../useFocoDialogo";
import { BotaoPagarStripe } from "../BotaoPagarStripe";
import { ehRetornoGratis, rotaNotaFiscal, textoPagamento, type ConsultaComNota } from "../LinhaConsultaPagamento";
import { rotuloHistorico, type EtiquetaConsulta, type StatusTriagem } from "../etiqueta-consulta";
import type { AcaoSala } from "../entrada-sala";
import { tipoDaConsulta } from "../tipo-atendimento-ui";
import { Avatar, Estado } from "../inicio/TelaInicioPaciente";
import { dataHora, iniciaisNome, plural } from "../inicio/inicio-dados";
import { consultaEmFoco, filtrarConsultas, fimDoHorario, podeMexer, proximasConsultas } from "./consultas-dados";

/**
 * "Minhas consultas" (etapa 2 do redesign): a lista de consultas e
 * pagamentos com o desenho da Ficha do paciente do médico (ref. 16/17):
 * cartão em degradê com a consulta escolhida, cartão de pagamento, tabela do
 * histórico e o cartão lavanda das próximas. Tudo com os dados reais do
 * estado; pagar usa o mesmo BotaoPagarStripe (lógica intacta).
 */
export type PropsTelaConsultas = {
  onFechar: () => void;
  onAgendar: () => void;
  onRemarcar: (id: string) => void;
  onCancelar: (id: string) => void;
  onTriagem: (id: string) => void;
  onEntrar: (c: Consulta) => void;
  etiquetaDe: (c: Consulta) => EtiquetaConsulta;
  janelaTriagem: (c: Consulta) => boolean;
  statusTriagem: (id: string) => StatusTriagem;
  acaoSala: (c: Consulta) => AcaoSala;
};

const ENCERRADAS = new Set(["concluida", "cancelada", "falta_paciente", "aguardando_reagendamento"]);

function AnelPagamento({ estado }: { estado: "pago" | "pendente" | "nada" }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const rotulo = estado === "pago" ? "Pago" : estado === "pendente" ? "Pagamento pendente" : "Sem cobrança";
  return (
    <div className="bp2-anel" role="img" aria-label={rotulo} title={rotulo}>
      <svg viewBox="0 0 57 57" width="57" height="57" aria-hidden>
        <circle cx="28.5" cy="28.5" r={r} className="bp2-anel-trilho" />
        {estado === "pago" ? (
          <circle cx="28.5" cy="28.5" r={r} fill="none" stroke="var(--bp2-anel-verde)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c} ${c}`} transform="rotate(-90 28.5 28.5)" />
        ) : estado === "pendente" ? (
          <circle cx="28.5" cy="28.5" r={r} fill="none" stroke="var(--bp2-anel-azul)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * 0.25} ${c}`} transform="rotate(-90 28.5 28.5)" />
        ) : null}
      </svg>
      <span className={`bp2-anel-centro ${estado === "pago" ? "bp2-anel-centro-ok" : ""}`} aria-hidden>
        {estado === "pago" ? "✓" : estado === "pendente" ? "R$" : "—"}
      </span>
    </div>
  );
}

export function TelaConsultasPaciente(p: PropsTelaConsultas) {
  const { consultas, sessao } = useBion();
  const raizRef = useRef<HTMLDivElement>(null);
  const detalheRef = useRef<HTMLElement>(null);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  useVoltarFecha(true, p.onFechar);
  useFocoDialogo(true, p.onFechar, raizRef);

  const agora = Date.now();
  const minhas = useMemo(() => consultas.filter((c) => c.paciente === sessao.nome).sort((a, b) => b.ts - a.ts), [consultas, sessao.nome]);
  const filtradas = useMemo(() => filtrarConsultas(minhas, busca), [minhas, busca]);
  const proximas = useMemo(() => proximasConsultas(minhas, agora), [minhas, agora]);
  const foco: ConsultaComNota | null = (escolhida ? minhas.find((c) => c.id === escolhida) : null) ?? consultaEmFoco(minhas, agora);

  const etiqueta = (c: Consulta): EtiquetaConsulta => (ENCERRADAS.has(c.status) ? rotuloHistorico(c.status, c.pago) : p.etiquetaDe(c));

  const escolher = (id: string) => {
    setEscolhida(id);
    // Celular: o cartão da consulta fica no topo — leva o foco até ele.
    requestAnimationFrame(() => {
      const el = detalheRef.current;
      if (!el) return;
      if (window.matchMedia("(max-width: 1023.98px)").matches) {
        const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "start" });
      }
      el.focus({ preventScroll: true });
    });
  };

  const topo = (
    <header className="bp2-consultas-topo">
      <button type="button" onClick={p.onFechar} aria-label="Voltar ao início" title="Voltar" className="bp2-redondo bp2-redondo-topo">
        <ArrowLeft className="h-[1.05rem] w-[1.05rem]" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h2 id="bp2-consultas-t" className="truncate text-[17px] font-medium lg:text-[18px]">
          Minhas consultas
        </h2>
        <p className="truncate text-[12px] bp2-t-2">
          {plural(minhas.length, "consulta", "consultas")} · {plural(proximas.length, "próxima", "próximas")}
        </p>
      </div>
      <button type="button" onClick={p.onAgendar} className="bp2-botao-azul inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium">
        <CalendarPlus className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Agendar consulta</span>
      </button>
    </header>
  );

  if (minhas.length === 0) {
    return (
      <div ref={raizRef} className="bpp-sobreposicao bp2-consultas bp2-v2 absolute inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="bp2-consultas-t">
        {topo}
        <div className="bp2-consultas-corpo">
          <section className="bp2-cartao flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="bp2-assist-icone" aria-hidden>
              <CalendarClock className="h-5 w-5" />
            </span>
            <h3 className="text-[15px] font-medium">Nenhuma consulta ainda</h3>
            <p className="max-w-xs text-[13px] bp2-t-2">Quando você agendar, a consulta e o pagamento aparecem aqui.</p>
            <button type="button" onClick={p.onAgendar} className="bp2-botao-azul mt-1 inline-flex h-11 items-center rounded-[0.6rem] px-5 text-[13px] font-medium">
              Agendar com a BION IA
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div ref={raizRef} className="bpp-sobreposicao bp2-consultas bp2-v2 absolute inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="bp2-consultas-t">
      {topo}
      <div className="bp2-consultas-corpo">
        <div className="bp2-consultas-grade">
          {foco ? <CartaoConsulta ref={detalheRef} c={foco} etiqueta={etiqueta(foco)} agora={agora} {...p} /> : null}
          {foco ? <CartaoPagamento c={foco} /> : null}

          {/* Histórico: tabela no computador, lista no celular */}
          <section className="bp2-cartao bp2-consultas-hist bp2-animar bp2-animar-d2" aria-labelledby="bp2-hist2-t">
            <div className="bp2-ficha-cab bp2-ficha-cab-hist">
              <h3 id="bp2-hist2-t" className="bp2-ficha-titulo">
                Histórico <span className="bp2-t-2">· {minhas.length}</span>
              </h3>
              <label className="bp2-busca bp2-ficha-busca">
                <Search className="h-4 w-4 bp2-t-2" aria-hidden />
                <span className="sr-only">Buscar por médico, especialidade ou situação</span>
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" />
              </label>
            </div>
            {filtradas.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] bp2-t-2">Nenhuma consulta encontrada para “{busca}”.</p>
            ) : (
              <div className="bp2-ficha-rolagem">
                <table className="bp2-ficha-tabela">
                  <caption className="sr-only">Todas as suas consultas, da mais recente para a mais antiga. Escolha uma para ver os detalhes.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Horário</th>
                      <th scope="col">Especialidade</th>
                      <th scope="col">Profissional</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Pagamento</th>
                      <th scope="col">
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((c) => {
                      const e = etiqueta(c);
                      const aguardando = e.tom === "pagamento" && e.texto === "Aguardando pagamento";
                      const pag = textoPagamento(c, aguardando);
                      const dh = dataHora(c.ts);
                      const ativa = foco?.id === c.id;
                      return (
                        <tr key={c.id} className={`bp2-ficha-linha ${ativa ? "bp2-ficha-linha-aberta" : ""}`} onClick={() => escolher(c.id)}>
                          <td className="tabular-nums">{dh.data}</td>
                          <td className="tabular-nums">{dh.hora}</td>
                          <td>{c.especialidade}</td>
                          <td>{c.medico}</td>
                          <td>
                            <Estado e={e} tamanho="text-[12.5px]" />
                          </td>
                          <td className="bp2-t-2">{pag ?? "—"}</td>
                          <td>
                            <button
                              type="button"
                              data-abrir-consulta={c.id}
                              aria-pressed={ativa}
                              aria-label={`Ver ${c.especialidade} com ${c.medico}, ${dh.data} às ${dh.hora}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                escolher(c.id);
                              }}
                              className="bp2-icone-linha"
                            >
                              <ArrowUpRight className="h-4 w-4" aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Próximas (lavanda, como "Exames e documentos" da ficha) */}
          <section className="bp2-consultas-proximas bp2-animar bp2-animar-d3" aria-labelledby="bp2-prox-t">
            <div className="bp2-ficha-cab">
              <h3 id="bp2-prox-t" className="bp2-ficha-titulo">
                Próximas
                <br />
                consultas
              </h3>
              <button type="button" onClick={p.onAgendar} aria-label="Agendar nova consulta" title="Agendar" className="bp2-redondo bp2-redondo-preto">
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {proximas.length === 0 ? (
              <p className="bp2-vazio">Nenhuma consulta marcada.</p>
            ) : (
              <ul>
                {proximas.map((c) => {
                  const e = etiqueta(c);
                  return (
                    <li key={c.id} className="bp2-prox-item">
                      <button
                        type="button"
                        onClick={() => escolher(c.id)}
                        aria-pressed={foco?.id === c.id}
                        aria-label={`Ver ${c.especialidade} com ${c.medico}, ${c.data} às ${c.hora}: ${e.texto}`}
                        className="bp2-prox-botao"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate bp2-prox-nome">{c.especialidade}</span>
                          <span className="block truncate bp2-prox-sub">
                            {c.data} às {c.hora} · {e.texto}
                          </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

type PropsCartao = PropsTelaConsultas & { c: ConsultaComNota; etiqueta: EtiquetaConsulta; agora: number; ref?: Ref<HTMLElement> };

/** Cartão em degradê da consulta escolhida (desenho da "Ficha do paciente"). */
function CartaoConsulta({ c, etiqueta, agora, ref, ...p }: PropsCartao) {
  const dh = dataHora(c.ts);
  const tipo = tipoDaConsulta(c) ?? "Consulta";
  const mexe = podeMexer(c, agora);
  const triagem = p.janelaTriagem(c) ? p.statusTriagem(c.id) : null;
  const sala = p.acaoSala(c);
  const valorTexto = ehRetornoGratis(c) ? "Sem custo" : c.valor ?? "—";
  const [moeda, numero] = /^R\$\s*/.test(valorTexto) ? ["R$", valorTexto.replace(/^R\$\s*/, "")] : ["", valorTexto];
  return (
    <section ref={ref} tabIndex={-1} className="bp2-ficha-cartao bp2-consultas-detalhe bp2-animar" aria-labelledby="bp2-det-t" aria-live="polite">
      <div className="bp2-ficha-topo">
        <h3 id="bp2-det-t" className="bp2-ficha-titulo">
          Detalhe da
          <br />
          consulta
        </h3>
        <div className="bp2-ficha-redondos">
          {triagem && triagem !== "feita" ? (
            <button type="button" className="bp2-redondo" onClick={() => p.onTriagem(c.id)} aria-label={triagem === "andamento" ? "Continuar triagem" : "Fazer triagem"} title="Triagem">
              <ClipboardList className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {mexe ? (
            <>
              <button type="button" className="bp2-redondo" onClick={() => p.onRemarcar(c.id)} aria-label="Remarcar consulta" title="Remarcar">
                <CalendarClock className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="bp2-redondo" onClick={() => p.onCancelar(c.id)} aria-label="Cancelar consulta" title="Cancelar">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="bp2-ficha-pessoa">
        <span className="bp2-ficha-avatar" aria-hidden>
          {iniciaisNome(c.medico)}
        </span>
        <div className="bp2-ficha-nome">
          <strong>{c.medico}</strong>
          <span>{c.especialidade}</span>
        </div>
      </div>
      <dl className="bp2-ficha-campos">
        <div>
          <dt>Data</dt>
          <dd className="tabular-nums">
            {c.data} · {dh.data}
          </dd>
        </div>
        <div>
          <dt>Horário</dt>
          <dd className="tabular-nums">
            {dh.hora} – {fimDoHorario(dh.hora, DURACAO_SLOT_MIN)}
          </dd>
        </div>
        <div>
          <dt>Atendimento</dt>
          <dd>{tipo}</dd>
        </div>
      </dl>
      <dl className="bp2-ficha-sinais">
        <div>
          <dt>Situação</dt>
          <dd>
            <span className="bp2-ficha-valor bp2-ficha-valor-texto">{etiqueta.texto}</span>
          </dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>
            {moeda ? <span className="bp2-ficha-unidade">{moeda} </span> : null}
            <span className="bp2-ficha-valor tabular-nums">{numero}</span>
          </dd>
        </div>
      </dl>
      {sala.tipo === "entrar" ? (
        <button type="button" onClick={() => p.onEntrar(c)} className="bp2-ficha-acao">
          <Video className="h-4 w-4" aria-hidden /> Entrar na sala
        </button>
      ) : null}
    </section>
  );
}

/** Pagamento da consulta escolhida (desenho de "Medicamentos em uso", com anel). */
function CartaoPagamento({ c }: { c: ConsultaComNota }) {
  const e = rotuloHistorico(c.status, c.pago);
  const aguardando = e.tom === "pagamento" && e.texto === "Aguardando pagamento";
  const pag = textoPagamento(c, aguardando);
  const gratis = ehRetornoGratis(c);
  const estado: "pago" | "pendente" | "nada" = gratis || c.status === "cancelada" || c.status === "falta_paciente" ? (c.pago ? "pago" : "nada") : c.pago ? "pago" : "pendente";
  const mostraNota = c.status === "concluida" && c.pago === true && !gratis && c.temNotaFiscal === true;
  const podePagar = aguardando && c.status !== "cancelada" && !gratis;
  const situacao =
    c.status === "cancelada"
      ? c.pago
        ? "Paga · consulta cancelada"
        : "Consulta cancelada"
      : c.status === "falta_paciente"
        ? "Falta registrada"
        : gratis
          ? "Retorno sem custo"
          : aguardando
            ? "Aguardando pagamento"
            : c.pago
              ? "Pago"
              : (pag ?? "Pendente");
  return (
    <section className="bp2-cartao bp2-consultas-pag bp2-animar bp2-animar-d1" aria-labelledby="bp2-pag-t">
      <div className="bp2-ficha-cab">
        <h3 id="bp2-pag-t" className="bp2-ficha-titulo">
          Pagamento
          <br />
          da consulta
        </h3>
      </div>
      <div className="bp2-item bp2-pag-linha">
        <div className="min-w-0 flex-1">
          <div className="bp2-pag-nome truncate">
            {c.especialidade}
            {c.valor && !gratis ? <span> · {c.valor}</span> : null}
          </div>
          <div className="bp2-pag-info bp2-t-2">
            <span>
              Situação – {situacao}
              <br />
              Consulta – {dataHora(c.ts).data} às {dataHora(c.ts).hora}
            </span>
          </div>
        </div>
        <AnelPagamento estado={estado} />
      </div>
      {podePagar ? (
        <div className="bp2-pag-acao">
          <BotaoPagarStripe consultaId={c.id} />
        </div>
      ) : null}
      {mostraNota ? (
        <a href={rotaNotaFiscal(c.id)} target="_blank" rel="noopener" className="bp2-pag-nota">
          <FileText className="h-3.5 w-3.5" aria-hidden /> Nota fiscal / recibo do médico
        </a>
      ) : null}
      <div className="bp2-pag-rodape">
        <Avatar nome={c.medico} tamanho="md" />
        <span className="min-w-0 text-[12px] bp2-t-2">
          O pagamento vai para a consulta com <span className="bp2-pag-medico">{c.medico}</span>.
        </span>
      </div>
    </section>
  );
}
