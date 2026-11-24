"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { textoNota } from "@/lib/medico-exibicao";
import { DURACAO_SLOT_MIN } from "@/lib/teleconsulta-logica";
import { isoDia } from "../agenda-medico";
import { useVoltarFecha } from "../useVoltarFecha";
import { Avatar } from "../inicio/TelaInicioPaciente";
import { plural } from "../inicio/inicio-dados";
import { MiniCalendario } from "./AgendaPecas";
import { PassosAgendamento, ResumoAgendamento } from "./AssistenteAgendamento";
import {
  LETRAS_SEMANA,
  NOMES_SEMANA,
  faixaDaGrade,
  fimDoHorario,
  minutosDoHorario,
  nomeDiaLongo,
  passoDaAgenda,
  semanaDoDia,
  semanasDoCalendario,
  tituloMeses,
  type DiaCalendario,
} from "./consultas-dados";
import { useAgendamentoPaciente, type EscolhaAgendamento } from "./useAgendamentoPaciente";

/**
 * Agenda própria do paciente (etapa 2, rodada 2) — o desenho da agenda do
 * médico (ref. 07): grade da semana com os horários LIVRES do profissional
 * como blocos de evento, minicalendário e lista de profissionais na lateral
 * e o resumo antes de pagar. No celular, como a agenda do médico no 390:
 * faixa da semana + o dia escolhido.
 *
 * Mesma lógica do assistente da BION IA (useAgendamentoPaciente): mesma
 * agenda livre, mesmo POST /api/consultas e mesmo checkout Stripe.
 */

const ALTURA_HORA = 56; // px por hora, como a grade do médico
const TONS = ["azul", "lavanda", "pessego"] as const;
const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function minutosAgoraClinica(): number {
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export type InicioAgenda = { especialidade?: string | null; medico?: string | null };

export function TelaAgendaPaciente({
  inicial,
  onFechar,
  onAgendado,
  onAbrirChat,
}: {
  inicial?: InicioAgenda | null;
  onFechar: () => void;
  /** Consulta criada sem ida ao Stripe (modo demonstração): abre a triagem, como no chat. */
  onAgendado: (info: { consultaId: string; medico: string; especialidade: string; quando: string }) => void;
  /** Atalho para agendar conversando com a BION IA. */
  onAbrirChat?: () => void;
}) {
  const ag = useAgendamentoPaciente();
  useVoltarFecha(true, onFechar);
  const { escolha, setEscolha, setEtapa, medicosAtivos, agenda, stripeAtivo, pagando } = ag;
  const [aviso, setAviso] = useState<string | null>(null);
  const resumoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const hoje = isoDia(Date.now());

  const especialidades = useMemo(() => [...new Set(medicosAtivos.map((m) => m.especialidade))], [medicosAtivos]);
  const daEspecialidade = medicosAtivos.filter((m) => m.especialidade === escolha.especialidade);
  const medico = escolha.medico ? medicosAtivos.find((m) => m.nome === escolha.medico) : undefined;

  // Escolha inicial: a que veio do chat/oferta; senão, só o que não tem alternativa.
  const iniciou = useRef(false);
  useEffect(() => {
    if (iniciou.current || !medicosAtivos.length) return;
    iniciou.current = true;
    const pedidoMedico = inicial?.medico ? medicosAtivos.find((m) => m.nome === inicial.medico) : undefined;
    const esp = pedidoMedico?.especialidade ?? (inicial?.especialidade && especialidades.includes(inicial.especialidade) ? inicial.especialidade : especialidades.length === 1 ? especialidades[0] : undefined);
    const doEsp = esp ? medicosAtivos.filter((m) => m.especialidade === esp) : [];
    const med = pedidoMedico?.nome ?? (doEsp.length === 1 ? doEsp[0]!.nome : undefined);
    setEscolha({ especialidade: esp, medico: med });
    setEtapa(med ? "dia" : esp ? "medico" : "especialidade");
  }, [medicosAtivos.length]);

  useEffect(() => {
    tituloRef.current?.focus({ preventScroll: true });
  }, []);

  const passo = passoDaAgenda(escolha);

  const escolherEspecialidade = (esp: string) => {
    const doEsp = medicosAtivos.filter((m) => m.especialidade === esp);
    const med = doEsp.length === 1 ? doEsp[0]!.nome : undefined;
    setAviso(null);
    setEscolha({ especialidade: esp, medico: med });
    setEtapa(med ? "dia" : "medico");
  };
  const escolherMedico = (nome: string) => {
    setAviso(null);
    setEscolha((c) => ({ especialidade: c.especialidade, medico: nome }));
    setEtapa("dia");
  };
  const escolherDia = (iso: string) => {
    const d = agenda.find((x) => x.iso === iso);
    setAviso(null);
    setEscolha((c) => ({ ...c, diaIso: iso, dia: d?.rotulo, hora: c.diaIso === iso ? c.hora : undefined }));
    setEtapa("hora");
    const k = semanaDoDia(semanas, iso);
    if (k >= 0) setSemana(k);
  };
  const escolherHorario = (iso: string, h: string) => {
    const d = agenda.find((x) => x.iso === iso);
    if (!d) return;
    setAviso(null);
    setEscolha((c) => ({ ...c, diaIso: iso, dia: d.rotulo, hora: h }));
    setEtapa("confirmar");
    requestAnimationFrame(() => resumoRef.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const desfazerHorario = () => {
    setEscolha((c) => ({ ...c, hora: undefined }));
    setEtapa("hora");
  };

  const pagar = async () => {
    const r = await ag.pagarEAgendar("Agendamento pela agenda do app — Cartão");
    if (!r || r.tipo === "checkout") return;
    if (r.tipo === "erro") {
      setAviso(r.texto);
      return;
    }
    toast.success(
      stripeAtivo === false
        ? `Consulta marcada em modo de demonstração — nenhum valor foi cobrado. ${r.especialidade} com ${r.medico}, ${r.quando}.`
        : `Pagamento confirmado. ${r.especialidade} com ${r.medico}, ${r.quando}.`,
    );
    onAgendado({ consultaId: r.consultaId, medico: r.medico, especialidade: r.especialidade, quando: r.quando });
  };

  // Semanas do intervalo agendável (14 dias), como a grade semanal do médico.
  const ultimo = agenda.length ? agenda[agenda.length - 1]!.iso : hoje;
  const semanas = useMemo(() => semanasDoCalendario(hoje, ultimo), [hoje, ultimo]);
  const [semana, setSemana] = useState(0);
  const sem = semanas[Math.min(semana, semanas.length - 1)] ?? [];
  const titulo = tituloMeses([sem]);
  const livres = new Map(agenda.map((d) => [d.iso, d.horarios]));
  const faixa = faixaDaGrade(agenda.flatMap((d) => d.horarios), DURACAO_SLOT_MIN);
  const horas = Array.from({ length: faixa.fim - faixa.inicio }, (_, i) => faixa.inicio + i);
  // No celular a grade mostra um dia (o escolhido; senão o 1º livre da semana).
  const diaFoco = escolha.diaIso && sem.some((d) => d.iso === escolha.diaIso) ? escolha.diaIso : sem.find((d) => (livres.get(d.iso)?.length ?? 0) > 0)?.iso ?? sem[0]?.iso;
  const [agoraMin, setAgoraMin] = useState(minutosAgoraClinica);
  useEffect(() => {
    const id = setInterval(() => setAgoraMin(minutosAgoraClinica()), 60_000);
    return () => clearInterval(id);
  }, []);
  const topoAgora = (agoraMin - faixa.inicio * 60) * (ALTURA_HORA / 60);
  const mostraAgora = sem.some((d) => d.iso === hoje) && agoraMin >= faixa.inicio * 60 && agoraMin <= faixa.fim * 60;
  const colHoje = sem.findIndex((d) => d.iso === hoje);

  const rotuloSlot = (d: DiaCalendario, h: string) => `${nomeDiaLongo(d)}, ${h} até ${fimDoHorario(h, DURACAO_SLOT_MIN)}, livre`;

  return (
    <section className="bp2-agenda-pac bp2-v2" aria-labelledby="bp2-agp-t" data-agenda-paciente>
      <header className="bp2-agp-topo">
        <button type="button" onClick={onFechar} className="bp2-redondo bp2-redondo-topo" aria-label="Voltar ao início" title="Voltar">
          <ArrowLeft className="h-[1.05rem] w-[1.05rem]" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h2 id="bp2-agp-t" ref={tituloRef} tabIndex={-1} className="bp2-agp-titulo">
            Agendar consulta
          </h2>
          <p className="bp2-agp-sub truncate">
            {medico ? `${medico.nome} · ${medico.especialidade}` : "Escolha a especialidade, o profissional e o horário"}
          </p>
        </div>
        {onAbrirChat ? (
          <button type="button" onClick={onAbrirChat} className="bp2-agp-chat">
            <Sparkles className="h-4 w-4" aria-hidden /> <span className="bp2-agp-chat-texto">Agendar com a BION IA</span>
          </button>
        ) : null}
      </header>

      <div className="bp2-agp-pagina">
        <div className="bp2-agp-cartao">
          {/* ------------------------- grade principal ------------------------- */}
          <div className="bp2-agp-principal">
            <div className="bp2-agp-cab">
              <div className="bp2-agp-titulo-mes">
                <h3>
                  {titulo.mes}, <span>{titulo.ano}</span>
                </h3>
                <div className="bp2-agp-navega">
                  <button type="button" onClick={() => setSemana((s) => Math.max(0, s - 1))} disabled={semana === 0} aria-label="Semana anterior">
                    <ChevronLeft aria-hidden />
                  </button>
                  <button type="button" className="bp2-agp-hoje" onClick={() => setSemana(0)}>
                    Hoje
                  </button>
                  <button type="button" onClick={() => setSemana((s) => Math.min(semanas.length - 1, s + 1))} disabled={semana >= semanas.length - 1} aria-label="Próxima semana">
                    <ChevronRight aria-hidden />
                  </button>
                </div>
              </div>
              <div className="bp2-agp-vistas" role="group" aria-label="Especialidade">
                {especialidades.map((e) => (
                  <button key={e} type="button" data-especialidade={e} aria-pressed={escolha.especialidade === e} onClick={() => escolherEspecialidade(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Profissionais da especialidade (no celular, faixa rolável acima da semana) */}
            {escolha.especialidade ? (
              <ul className="bp2-agp-medicos-faixa" aria-label={`Profissionais de ${escolha.especialidade}`}>
                {daEspecialidade.map((m, k) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      data-medico={m.nome}
                      aria-pressed={escolha.medico === m.nome}
                      onClick={() => escolherMedico(m.nome)}
                      className={`bp2-agp-medico bp2-agp-${TONS[k % TONS.length]}`}
                    >
                      <strong>{m.nome}</strong>
                      <span className="tabular-nums">
                        {m.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · <Star className="inline h-3 w-3" aria-hidden /> {textoNota(m)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <PassosAgendamento etapa={passo} />

            {/* Faixa da semana (celular), como a agenda do médico no 390 */}
            <div className="bp2-agp-faixa" role="group" aria-label="Dias da semana">
              {sem.map((d) => {
                const n = livres.get(d.iso)?.length ?? 0;
                return (
                  <button
                    key={d.iso}
                    type="button"
                    disabled={!n}
                    onClick={() => escolherDia(d.iso)}
                    aria-pressed={n ? d.iso === diaFoco : undefined}
                    aria-label={`${nomeDiaLongo(d)}${n ? `: ${plural(n, "horário livre", "horários livres")}` : ": sem horário livre"}`}
                    className={d.iso === hoje ? "bp2-agp-faixa-hoje" : ""}
                  >
                    <span>{DIAS_CURTOS[d.semana]}</span>
                    <strong>{d.dia}</strong>
                    {n ? <i aria-hidden /> : null}
                  </button>
                );
              })}
            </div>

            {!medico ? (
              <div className="bp2-agp-vazio" role="status">
                {!medicosAtivos.length
                  ? "No momento não há profissionais disponíveis para agendar."
                  : !escolha.especialidade
                    ? "Escolha a especialidade para ver os horários livres."
                    : daEspecialidade.length
                      ? "Escolha o profissional para ver os horários livres."
                      : "Nenhum profissional desta especialidade no momento."}
              </div>
            ) : !agenda.length ? (
              <div className="bp2-agp-vazio" role="status">
                Este profissional não tem horários livres nos próximos 14 dias — escolha outro profissional, por favor.
              </div>
            ) : (
              <div className="bp2-agp-grade" data-foco-hoje={diaFoco === hoje ? "" : undefined} style={{ ["--bp2-agp-dias" as string]: sem.length }}>
                <div className="bp2-agp-dias" aria-hidden>
                  <span />
                  {sem.map((d) => (
                    <span key={d.iso} className={`bp2-agp-dia ${d.semana >= 5 ? "bp2-agp-fds" : ""} ${d.iso === hoje ? "bp2-agp-dia-hoje" : ""}`}>
                      <span className="bp2-agp-dia-nome">{DIAS_CURTOS[d.semana]}</span>
                      <span className="bp2-agp-dia-num">{d.dia}</span>
                    </span>
                  ))}
                </div>
                <div className="bp2-agp-rolagem" tabIndex={0} aria-label="Horários livres da semana">
                  <div className="bp2-agp-corpo" style={{ height: horas.length * ALTURA_HORA }}>
                    <div className="bp2-agp-horas" aria-hidden>
                      {horas.map((h, i) => (
                        <span key={h} style={{ top: i * ALTURA_HORA }}>
                          {String(h).padStart(2, "0")}:00
                        </span>
                      ))}
                    </div>
                    {sem.map((d) => {
                      const hs = livres.get(d.iso) ?? [];
                      const fora = d.iso < hoje || d.iso > ultimo;
                      return (
                        <ul
                          key={d.iso}
                          aria-label={`${NOMES_SEMANA[d.semana]}, ${d.dia}: ${hs.length ? plural(hs.length, "horário livre", "horários livres") : "sem horário livre"}`}
                          className={`bp2-agp-coluna ${d.semana >= 5 ? "bp2-agp-fds" : ""} ${!hs.length ? "bp2-agp-sem" : ""} ${d.iso === diaFoco ? "bp2-agp-col-foco" : ""}`}
                        >
                          {!hs.length ? <li className="bp2-agp-sem-rotulo">{fora ? "Fora do período" : "Sem horários"}</li> : null}
                          {hs.map((h) => {
                            const top = (minutosDoHorario(h) - faixa.inicio * 60) * (ALTURA_HORA / 60);
                            const sel = escolha.diaIso === d.iso && escolha.hora === h;
                            return (
                              <li key={h} className="bp2-agp-ev-pos" style={{ top: top + 1, height: DURACAO_SLOT_MIN * (ALTURA_HORA / 60) - 2 }}>
                                <button type="button" data-horario={`${d.iso} ${h}`} aria-pressed={sel} aria-label={rotuloSlot(d, h)} onClick={() => escolherHorario(d.iso, h)} className="bp2-agp-ev">
                                  <span className="bp2-agp-ev-nome tabular-nums">{h}</span>
                                  <span className="bp2-agp-ev-hora tabular-nums">– {fimDoHorario(h, DURACAO_SLOT_MIN)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })}
                    {mostraAgora ? (
                      <div className="bp2-agp-agora" style={{ top: topoAgora }} aria-hidden>
                        <span className="bp2-agp-agora-hoje" style={{ ["--bp2-agp-col" as string]: colHoje }} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ----------------------------- lateral ----------------------------- */}
          <div className="bp2-agp-lado" role="group" aria-label="Calendário, profissionais e resumo">
            <MiniCalendario dias={agenda} selecionado={escolha.diaIso} onEscolher={escolherDia} rotulo="Dias com horário livre do profissional" />
            {escolha.especialidade ? (
              <div className="bp2-agp-lista">
                <h3>
                  Profissionais <strong>{daEspecialidade.length}</strong>
                </h3>
                <ul>
                  {daEspecialidade.map((m, k) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        aria-pressed={escolha.medico === m.nome}
                        onClick={() => escolherMedico(m.nome)}
                        className={`bp2-agp-medico bp2-agp-${TONS[k % TONS.length]}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar nome={m.nome} foto={m.foto} />
                          <span className="min-w-0">
                            <strong className="block truncate">{m.nome}</strong>
                            <span className="block truncate tabular-nums">
                              {m.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {textoNota(m)}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {aviso ? (
              <p role="alert" className="bp2-agp-aviso">
                {aviso}
              </p>
            ) : null}
            <div ref={resumoRef}>
              {escolha.hora && escolha.diaIso && medico ? (
                <ResumoAgendamento
                  escolha={escolha as EscolhaAgendamento}
                  medico={medico}
                  valor={medico.valor ?? 0}
                  stripeAtivo={stripeAtivo}
                  pagando={pagando}
                  onPagar={() => void pagar()}
                  onCancelar={desfazerHorario}
                />
              ) : medico && agenda.length ? (
                <p className="bp2-agp-dica">{escolha.diaIso ? "Toque num horário livre da grade para ver o resumo." : "Escolha um dia no calendário ou um horário livre na grade."}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
