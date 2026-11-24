"use client";

/* ==================================================================== */
/* Agenda do médico (etapa 4, ref. 07): semana com as consultas reais,  */
/* mini calendário e "Consultas de hoje". Só apresentação: os horários */
/* e bloqueios continuam sendo editados no AgendaSheet de sempre (botão */
/* "Horários e bloqueios"). Regra: nada entre 23:00 e 00:00 — a grade   */
/* termina às 23:00.                                                    */
/* ==================================================================== */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarCog, ChevronLeft, ChevronRight, ListFilter, Search, X } from "lucide-react";
import { MensagensTopo, SinoTopo } from "../TopoMedico";
import { TelaSobreposta } from "../TelaSobreposta";
import { BuscaPacienteTopo, PerfilMedicoTopo } from "../ficha/TopoFicha";
import { chavePaciente, rotuloStatusMedico, type PacienteDoMedico } from "../metricas";
import { rotuloTipoAtendimento } from "@/lib/atendimento-tipo";
import type { DadosMedico } from "../useDadosMedico";
import { useBloqueiosAgenda } from "../useDadosMedico";
import {
  LETRAS_SEMANA,
  NOMES_MES,
  NOMES_SEMANA,
  colunasSobrepostas,
  diaDe,
  diaDeParede,
  eventosAgenda,
  faixaHoras,
  fmtMin,
  gradeMes,
  proximoDia,
  semanaDe,
  type DiaAgenda,
  type EventoAgenda,
} from "./agenda-dados";

type Vista = "dia" | "semana" | "mes";
/**
 * Altura de 1 hora na grade (px). A ref. 07 corrigida usa 46,5 px para
 * consultas de 1 h; as reais duram 30 min, então 56 px deixa o bloco com
 * 28 px — o mínimo para nome e horário em duas linhas, como na ref.
 */
/** Altura de uma hora na grade. 72 px: a consulta de 30 min fica com 36 px e cabem nome e horário em duas linhas. */
const PX_HORA = 72;
/** Altura mínima do bloco (eventos curtos ou cortados em 23:00 continuam legíveis). */
const MIN_BLOCO = 34;
const TELA_LARGA = "(min-width: 1024px)";
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const nomeDiaLongo = (d: DiaAgenda) =>
  `${["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.semana]}, ${d.dia} de ${NOMES_MES[d.mes].toLowerCase()}`;

export function AgendaSemanal({
  dados,
  onFechar,
  onAbrirPaciente,
  onHorarios,
  onAbrirPerfil,
  barra,
}: {
  dados: DadosMedico;
  onFechar: () => void;
  onAbrirPaciente: (p: PacienteDoMedico) => void;
  /** Abre o AgendaSheet (grade de horários, dias bloqueados e ações do dia). */
  onHorarios: () => void;
  onAbrirPerfil?: () => void;
  /** Etapa 5, rodada 2: barra inferior do celular dentro da agenda. */
  barra?: ReactNode;
}) {
  const { minhas, agora, listaPacientes, sessao, medico } = dados;
  const bloqueios = useBloqueiosAgenda();
  const hoje = diaDe(agora);
  const [selecionado, setSelecionado] = useState<DiaAgenda>(hoje);
  const [vista, setVista] = useState<Vista>(() =>
    typeof window !== "undefined" && !window.matchMedia(TELA_LARGA).matches ? "dia" : "semana",
  );
  const [mesCal, setMesCal] = useState({ ano: hoje.ano, mes: hoje.mes });
  const [comCanceladas, setComCanceladas] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const idFiltro = useId();

  const eventos = useMemo(() => eventosAgenda(minhas, comCanceladas), [minhas, comCanceladas]);
  const porDia = useMemo(() => {
    const m = new Map<string, EventoAgenda[]>();
    for (const e of eventos) m.set(e.diaIso, [...(m.get(e.diaIso) ?? []), e]);
    return m;
  }, [eventos]);
  const semana = useMemo(() => semanaDe(selecionado.inicio + 12 * 3_600_000), [selecionado]);
  const dias = vista === "dia" ? [selecionado] : semana;
  const visiveis = useMemo(() => dias.flatMap((d) => porDia.get(d.iso) ?? []), [dias, porDia]);
  const faixa = faixaHoras(visiveis);
  const horas = Array.from({ length: faixa.fim - faixa.inicio }, (_, i) => faixa.inicio + i);
  const q = semAcento(busca.trim());
  const combina = (e: EventoAgenda) => !q || semAcento(e.consulta.paciente).includes(q);
  const deHoje = (porDia.get(hoje.iso) ?? []).filter((e) => e.consulta.status !== "cancelada");

  // Abre a grade perto da hora atual (ou da 1ª consulta do período).
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el || vista === "mes") return;
    const agoraMin = (agora - hoje.inicio) / 60_000;
    const alvoMin = dias.some((d) => d.iso === hoje.iso) ? agoraMin - 90 : (visiveis[0]?.inicioMin ?? faixa.inicio * 60) - 30;
    el.scrollTop = Math.max(0, ((alvoMin - faixa.inicio * 60) / 60) * PX_HORA);
    // só ao trocar de período/vista
  }, [vista, selecionado.iso]);

  const abrirConsulta = (e: EventoAgenda) => {
    const k = chavePaciente(e.consulta);
    const p = listaPacientes.find((x) => x.chave === k);
    if (p) onAbrirPaciente(p);
  };

  const irPeriodo = (n: number) => {
    const d =
      vista === "mes"
        ? diaDeParede(selecionado.ano, selecionado.mes + n, 1)
        : proximoDia(selecionado, n * (vista === "dia" ? 1 : 7));
    setSelecionado(d);
    setMesCal({ ano: d.ano, mes: d.mes });
  };
  const escolherDia = (d: DiaAgenda) => {
    setSelecionado(d);
    setMesCal({ ano: d.ano, mes: d.mes });
  };

  const rotuloEvento = (e: EventoAgenda) =>
    `${e.consulta.paciente}, ${fmtMin(e.inicioMin)} às ${fmtMin(e.fimMin)}, ${rotuloTipoAtendimento(e.consulta.tipoAtendimento) ?? "Consulta"}, ${rotuloStatusMedico(e.consulta)}`;

  const agoraMin = (agora - hoje.inicio) / 60_000;
  const linhaAgora = agoraMin >= faixa.inicio * 60 && agoraMin <= faixa.fim * 60 && dias.some((d) => d.iso === hoje.iso);

  const topoUi = (
    <>
      <BuscaPacienteTopo pacientes={listaPacientes} atualChave="" onAbrir={onAbrirPaciente} />
      <PerfilMedicoTopo nome={sessao.nome} especialidade={medico?.especialidade} foto={medico?.foto} onAbrir={onAbrirPerfil} />
    </>
  );

  const vistas: { id: Vista; r: string }[] = [
    { id: "dia", r: "Dia" },
    { id: "semana", r: "Semana" },
    { id: "mes", r: "Mês" },
  ];

  const cabecalho = (
    <div className="bm2-agenda-cab">
      <div className="bm2-agenda-titulo">
        <h3>
          {NOMES_MES[selecionado.mes]}, <span>{selecionado.ano}</span>
        </h3>
        <div className="bm2-agenda-navega">
          <button type="button" onClick={() => irPeriodo(-1)} aria-label={vista === "mes" ? "Mês anterior" : vista === "dia" ? "Dia anterior" : "Semana anterior"}>
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" onClick={() => escolherDia(hoje)} className="bm2-agenda-hoje">
            Hoje
          </button>
          <button type="button" onClick={() => irPeriodo(1)} aria-label={vista === "mes" ? "Próximo mês" : vista === "dia" ? "Próximo dia" : "Próxima semana"}>
            <ChevronRight aria-hidden />
          </button>
        </div>
      </div>
      <div className="bm2-agenda-ferramentas">
        <div className="bm2-agenda-vistas" role="group" aria-label="Visualização">
          {vistas.map((v) => (
            <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => setVista(v.id)}>
              {v.r}
            </button>
          ))}
        </div>
        <div
          className="relative"
          onKeyDown={(e) => {
            if (e.key === "Escape" && filtroAberto) {
              e.preventDefault();
              e.stopPropagation();
              setFiltroAberto(false);
            }
          }}
        >
          <button
            type="button"
            className="bm2-agenda-redondo"
            aria-label="Filtrar consultas"
            aria-expanded={filtroAberto}
            aria-controls={filtroAberto ? idFiltro : undefined}
            onClick={() => setFiltroAberto((v) => !v)}
          >
            <ListFilter aria-hidden />
          </button>
          {filtroAberto ? (
            <div id={idFiltro} className="bm2-agenda-menu">
              <label>
                <input type="checkbox" checked={comCanceladas} onChange={(e) => setComCanceladas(e.target.checked)} />
                Mostrar canceladas
              </label>
            </div>
          ) : null}
        </div>
        {buscaAberta ? (
          <label
            className="bm2-agenda-busca"
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
            <span className="sr-only">Destacar paciente na agenda</span>
            <input ref={buscaRef} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Paciente…" autoComplete="off" />
            <button type="button" aria-label="Fechar busca" onClick={() => { setBusca(""); setBuscaAberta(false); }}>
              <X aria-hidden />
            </button>
          </label>
        ) : (
          <button
            type="button"
            className="bm2-agenda-redondo"
            aria-label="Buscar paciente na agenda"
            onClick={() => {
              setBuscaAberta(true);
              setTimeout(() => buscaRef.current?.focus(), 0);
            }}
          >
            <Search aria-hidden />
          </button>
        )}
      </div>
    </div>
  );

  const evento = (e: EventoAgenda, pos?: { col: number; de: number }) => {
    const topo = ((e.inicioMin - faixa.inicio * 60) / 60) * PX_HORA;
    const altura = Math.max(MIN_BLOCO, ((e.fimMin - e.inicioMin) / 60) * PX_HORA - 3);
    const de = pos?.de ?? 1;
    const col = pos?.col ?? 0;
    // Sem conflito o bloco ocupa a coluna toda; com conflito divide a coluna e mostra o primeiro nome + início
    // (o nome completo e o intervalo ficam no rótulo acessível e na dica).
    const dividido = de > 1;
    const nome = dividido ? e.consulta.paciente.trim().split(/\s+/)[0] : e.consulta.paciente;
    return (
      <li
        key={e.consulta.id}
        className="bm2-agenda-ev-pos"
        style={{ top: topo + 1, height: altura, left: `calc(${(col / de) * 100}% + 3px)`, width: `calc(${100 / de}% - 6px)` }}
      >
        <button
          type="button"
          onClick={() => abrirConsulta(e)}
          aria-label={rotuloEvento(e)}
          title={`${e.consulta.paciente} · ${fmtMin(e.inicioMin)} – ${fmtMin(e.fimMin)}`}
          className={`bm2-agenda-ev ${dividido ? "bm2-agenda-ev-dividido" : ""} bm2-agenda-${e.tom} ${e.passada ? "bm2-agenda-passada" : ""} ${combina(e) ? "" : "bm2-agenda-apagado"} ${e.consulta.status === "cancelada" ? "bm2-agenda-cancelada" : ""}`}
        >
          <span className="bm2-agenda-ev-nome">
            <span className="bm2-agenda-ev-nome-longo">{nome}</span>
            <span className="bm2-agenda-ev-nome-curto">{e.consulta.paciente.trim().split(/\s+/)[0]}</span>
          </span>
          <span className="bm2-agenda-ev-hora">{dividido ? fmtMin(e.inicioMin) : `${fmtMin(e.inicioMin)} – ${fmtMin(e.fimMin)}`}</span>
        </button>
      </li>
    );
  };

  const grade = (
    <div className={`bm2-agenda-grade ${vista === "dia" ? "bm2-agenda-grade-dia" : ""}`} style={{ ["--bm2-dias" as string]: dias.length }}>
      <div className="bm2-agenda-dias" role="presentation">
        <span aria-hidden />
        {dias.map((d) => {
          const ehHoje = d.iso === hoje.iso;
          return (
            <button
              key={d.iso}
              type="button"
              className={`bm2-agenda-dia ${ehHoje ? "bm2-agenda-dia-hoje" : ""} ${d.semana === 0 || d.semana === 6 ? "bm2-agenda-fds" : ""}`}
              aria-label={`${nomeDiaLongo(d)}${ehHoje ? " (hoje)" : ""}: ver o dia`}
              aria-current={ehHoje ? "date" : undefined}
              onClick={() => {
                escolherDia(d);
                setVista("dia");
              }}
            >
              <span className="bm2-agenda-dia-nome">{NOMES_SEMANA[d.semana]}</span>
              <span className="bm2-agenda-dia-num">{d.dia}</span>
            </button>
          );
        })}
      </div>
      <div ref={rolagemRef} className="bm2-agenda-rolagem">
        <div className="bm2-agenda-corpo-grade" style={{ height: horas.length * PX_HORA, ["--bm2-px-hora" as string]: `${PX_HORA}px` }}>
          <div className="bm2-agenda-horas" aria-hidden>
            {horas.map((h) => (
              <span key={h} style={{ top: (h - faixa.inicio) * PX_HORA }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {dias.map((d) => {
            const lista = porDia.get(d.iso) ?? [];
            const pos = colunasSobrepostas(lista);
            const bloqueio = bloqueios.porDia.get(d.iso);
            return (
              <section
                key={d.iso}
                aria-label={`${nomeDiaLongo(d)}: ${lista.length === 0 ? "sem consultas" : `${lista.length} consulta${lista.length > 1 ? "s" : ""}`}${bloqueio ? ", dia bloqueado" : ""}`}
                className={`bm2-agenda-coluna ${d.semana === 0 || d.semana === 6 ? "bm2-agenda-fds" : ""} ${bloqueio ? "bm2-agenda-bloqueado" : ""}`}
              >
                {bloqueio ? <p className="bm2-agenda-bloqueio">Dia bloqueado</p> : null}
                {lista.length ? <ul className="contents">{lista.map((e) => evento(e, pos.get(e)))}</ul> : null}
              </section>
            );
          })}
          {linhaAgora ? (
            <div className="bm2-agenda-agora" style={{ top: ((agoraMin - faixa.inicio * 60) / 60) * PX_HORA }} aria-hidden>
              <span className="bm2-agenda-agora-rotulo">{fmtMin(Math.floor(agoraMin))}</span>
              <span
                className="bm2-agenda-agora-hoje"
                style={{
                  left: `calc(100% * ${dias.findIndex((d) => d.iso === hoje.iso)} / ${dias.length})`,
                  width: `calc(100% / ${dias.length})`,
                }}
              />
            </div>
          ) : null}
        </div>
        <p className="bm2-agenda-vedado">Sem atendimento entre 23:00 e 00:00.</p>
      </div>
    </div>
  );

  const mesSel = gradeMes(selecionado.ano, selecionado.mes);
  const gradeMensal = (
    <div className="bm2-agenda-mes" role="grid" aria-label={`${NOMES_MES[selecionado.mes]} de ${selecionado.ano}`}>
      <div role="row" className="bm2-agenda-mes-semana">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((n) => (
          <span role="columnheader" key={n}>
            {n}
          </span>
        ))}
      </div>
      {mesSel.map((sem) => (
        <div role="row" key={sem[0].iso} className="bm2-agenda-mes-linha">
          {sem.map((d) => {
            const lista = (porDia.get(d.iso) ?? []).filter(combina);
            return (
              <div role="gridcell" key={d.iso} className={`bm2-agenda-mes-dia ${d.mes !== selecionado.mes ? "bm2-agenda-fora" : ""} ${d.iso === hoje.iso ? "bm2-agenda-dia-hoje" : ""}`}>
                <button
                  type="button"
                  className="bm2-agenda-mes-num"
                  aria-label={`${nomeDiaLongo(d)}: ${lista.length} consulta${lista.length === 1 ? "" : "s"}. Ver o dia`}
                  onClick={() => {
                    escolherDia(d);
                    setVista("dia");
                  }}
                >
                  {d.dia}
                </button>
                {lista.slice(0, 3).map((e) => (
                  <button key={e.consulta.id} type="button" onClick={() => abrirConsulta(e)} aria-label={rotuloEvento(e)} className={`bm2-agenda-mes-ev bm2-agenda-${e.tom}`}>
                    {fmtMin(e.inicioMin)} {e.consulta.paciente}
                  </button>
                ))}
                {lista.length > 3 ? <span className="bm2-agenda-mais">+{lista.length - 3}</span> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const miniCal = (
    <div className="bm2-agenda-mini">
      <div className="bm2-agenda-mini-cab">
        <h3>
          {NOMES_MES[mesCal.mes]} <span className="sr-only">{mesCal.ano}</span>
        </h3>
        <div>
          <button type="button" aria-label="Mês anterior no calendário" onClick={() => setMesCal((m) => ({ ano: m.mes === 0 ? m.ano - 1 : m.ano, mes: (m.mes + 11) % 12 }))}>
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" aria-label="Próximo mês no calendário" onClick={() => setMesCal((m) => ({ ano: m.mes === 11 ? m.ano + 1 : m.ano, mes: (m.mes + 1) % 12 }))}>
            <ChevronRight aria-hidden />
          </button>
        </div>
      </div>
      <table className="bm2-agenda-mini-tab">
        <thead>
          <tr>
            {LETRAS_SEMANA.map((l, i) => (
              <th key={i} scope="col" abbr={["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][i]} className={i >= 5 ? "bm2-agenda-fds" : ""}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gradeMes(mesCal.ano, mesCal.mes).map((sem) => (
            <tr key={sem[0].iso}>
              {sem.map((d, i) => {
                const n = (porDia.get(d.iso) ?? []).length;
                const naSemana = vista !== "mes" && semana.some((s) => s.iso === d.iso);
                return (
                  <td key={d.iso}>
                    <button
                      type="button"
                      onClick={() => escolherDia(d)}
                      aria-label={`${nomeDiaLongo(d)}${n ? `: ${n} consulta${n > 1 ? "s" : ""}` : ""}`}
                      aria-current={d.iso === hoje.iso ? "date" : undefined}
                      aria-pressed={d.iso === selecionado.iso}
                      className={`${d.mes !== mesCal.mes ? "bm2-agenda-fora" : ""} ${i >= 5 ? "bm2-agenda-fds" : ""} ${d.iso === hoje.iso ? "bm2-agenda-mini-hoje" : ""} ${naSemana ? "bm2-agenda-mini-semana" : ""} ${bloqueios.porDia.has(d.iso) ? "bm2-agenda-mini-bloq" : ""}`}
                    >
                      {d.dia}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const consultasHoje = (
    <section className="bm2-agenda-hojelista" aria-label="Consultas de hoje">
      <h3>
        <span>Consultas de hoje</span>
        <strong>{deHoje.length}</strong>
      </h3>
      {deHoje.length === 0 ? (
        <p className="bm2-vazio">Nenhuma consulta hoje.</p>
      ) : (
        <ul>
          {deHoje.map((e) => (
            <li key={e.consulta.id}>
              <button type="button" onClick={() => abrirConsulta(e)} aria-label={rotuloEvento(e)} className={`bm2-agenda-hoje-item bm2-agenda-${e.tom} ${e.passada ? "bm2-agenda-passada" : ""}`}>
                <span className="bm2-agenda-ev-nome">{e.consulta.paciente}</span>
                <span className="bm2-agenda-ev-hora">
                  {fmtMin(e.inicioMin)} – {fmtMin(e.fimMin)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <TelaSobreposta
      classe="bm2-ficha bm2-agenda bm-v2"
      extraCabecalho={topoUi}
      titulo="Agenda"
      subtitulo="Suas consultas da semana"
      onFechar={onFechar}
      acoes={
        <>
          <button type="button" onClick={onHorarios} className="bm2-agenda-horarios">
            <CalendarCog aria-hidden /> <span className="max-sm:sr-only">Horários e bloqueios</span>
          </button>
          <MensagensTopo className="lg:hidden" />
          <SinoTopo className="lg:hidden" />
        </>
      }
      topoPadrao={false}
      barra={barra}
    >
      <div className="bm2-agenda-pagina">
        <div className="bm2-agenda-cartao">
          <div className="bm2-agenda-principal">
            {cabecalho}
            {vista === "dia" ? (
              <div className="bm2-agenda-faixa" role="group" aria-label="Dias da semana">
                {semana.map((d) => (
                  <button
                    key={d.iso}
                    type="button"
                    aria-pressed={d.iso === selecionado.iso}
                    aria-current={d.iso === hoje.iso ? "date" : undefined}
                    aria-label={`${nomeDiaLongo(d)}${(porDia.get(d.iso) ?? []).length ? `: ${(porDia.get(d.iso) ?? []).length} consultas` : ""}`}
                    onClick={() => escolherDia(d)}
                    className={d.iso === hoje.iso ? "bm2-agenda-faixa-hoje" : ""}
                  >
                    <span>{NOMES_SEMANA[d.semana]}</span>
                    <strong>{d.dia}</strong>
                    {(porDia.get(d.iso) ?? []).length ? <i aria-hidden /> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {vista === "mes" ? gradeMensal : grade}
          </div>
          <aside className="bm2-agenda-lado" aria-label="Calendário e consultas de hoje">
            {miniCal}
            {consultasHoje}
          </aside>
        </div>
      </div>
    </TelaSobreposta>
  );
}
