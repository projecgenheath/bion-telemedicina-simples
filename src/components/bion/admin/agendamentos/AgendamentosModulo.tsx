"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CalendarX2, Info, Pencil, Search } from "lucide-react";
import { useBion, type Consulta } from "@/lib/bion-store";
import { TelaModulo } from "../ui/TelaModulo";
import { TabelaAdmin, type ColunaAdmin } from "../ui/TabelaAdmin";
import { CardDeslizavel } from "../ui/CardDeslizavel";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { useLargo } from "../ui/preferencias";
import { useDadosAdmin } from "../dados";
import { estadoConsulta } from "../rotulos";
import { brl, hora as horaDe, rotuloDia } from "../tempo";
import { centavosDoValor } from "../metricas";
import { DetalheConsulta } from "./DetalheConsulta";
import { ReembolsosPainel } from "./ReembolsosPainel";
import { FILTROS_PADRAO, STATUS_FILTRO, agruparPorDia, chipsConsulta, filtrarConsultas, podeCancelar, resumoAgenda, type Filtros, type Periodo } from "./agenda";

type Aba = "agenda" | "reembolsos";
const PAGINA = 60;
/** O bootstrap do admin traz no máximo 500 consultas (dados.ts). */
const LIMITE_BOOTSTRAP = 500;
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "proximas", rotulo: "Próximas" },
  { id: "passadas", rotulo: "Passadas" },
  { id: "todas", rotulo: "Todas" },
];

/**
 * Agendamentos do admin (Torre BION): agenda real do app (linha do tempo no
 * celular, tabela no desktop), editar/remarcar com médico por id e horários
 * livres, cancelar com confirmação e a aba de pedidos de reembolso.
 * ?aba=reembolsos abre a aba; ?consulta=ID abre o detalhe (com &acao=desfecho,
 * direto no "Corrigir desfecho").
 */
export function AgendamentosModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const { consultas, medicos } = useBion();
  const { agora, atualizar, atualizando, reembolsos } = useDadosAdmin();
  const largo = useLargo();
  const aba: Aba = params.get("aba") === "reembolsos" ? "reembolsos" : "agenda";
  const idAberto = params.get("consulta");
  // ?acao=desfecho (vindo da Fila "Sem desfecho") abre direto o "Corrigir desfecho".
  const acaoUrl = params.get("acao") === "desfecho" ? "desfecho" : null;
  const [modoEscolhido, setModoInicial] = useState<"detalhe" | "editar" | "cancelar">("detalhe");
  const modoInicial = acaoUrl ?? modoEscolhido;
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [limite, setLimite] = useState(PAGINA);

  const irPara = (p: { aba?: Aba; consulta?: string | null }) => {
    const q = new URLSearchParams();
    const a = p.aba ?? aba;
    if (a === "reembolsos") q.set("aba", "reembolsos");
    const c = p.consulta === undefined ? idAberto : p.consulta;
    if (c) q.set("consulta", c);
    const s = q.toString();
    router.replace(`/admin-agendamentos${s ? `?${s}` : ""}`, { scroll: false });
  };
  const abrir = (c: Consulta, modo: "detalhe" | "editar" | "cancelar" = "detalhe") => {
    setModoInicial(modo);
    irPara({ consulta: c.id });
  };
  const mudarFiltro = (f: Partial<Filtros>) => {
    setFiltros((x) => ({ ...x, ...f }));
    setLimite(PAGINA);
  };

  const lista = useMemo(() => filtrarConsultas(consultas, filtros, agora), [consultas, filtros, agora]);
  const resumo = useMemo(() => resumoAgenda(consultas, agora), [consultas, agora]);
  const visiveis = lista.slice(0, limite);
  const medicosOrdenados = useMemo(() => [...medicos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [medicos]);
  const emAnalise = reembolsos.dados?.total ?? 0;

  const teclaAbas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nova: Aba = aba === "agenda" ? "reembolsos" : "agenda";
    irPara({ aba: nova, consulta: null });
    document.getElementById(`aba-${nova}`)?.focus();
  };

  return (
    <TelaModulo
      titulo="Agendamentos"
      icone={CalendarDays}
      subtitulo={`${resumo.hoje} ${resumo.hoje === 1 ? "consulta" : "consultas"} hoje · ${resumo.total} carregadas`}
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      ferramentas={
        <div className="space-y-3">
          <div role="tablist" aria-label="Agendamentos" className="ba-abas" onKeyDown={teclaAbas}>
            {(["agenda", "reembolsos"] as Aba[]).map((a) => (
              <button
                key={a}
                id={`aba-${a}`}
                type="button"
                role="tab"
                aria-selected={aba === a}
                aria-controls={`painel-${a}`}
                tabIndex={aba === a ? 0 : -1}
                onClick={() => irPara({ aba: a, consulta: null })}
                className="ba-aba"
              >
                {a === "agenda" ? "Agenda" : "Reembolsos"}
                {a === "reembolsos" && emAnalise ? <span className="ml-1 tabular-nums opacity-80">· {emAnalise}</span> : null}
              </button>
            ))}
          </div>
          {aba === "agenda" ? (
            <BarraFiltros filtros={filtros} onMudar={mudarFiltro} medicos={medicosOrdenados} />
          ) : null}
        </div>
      }
    >
      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="mt-4 space-y-4">
        {aba === "reembolsos" ? (
          <ReembolsosPainel agora={agora} onMudou={() => void atualizar()} />
        ) : (
          <>
            <div className="flex lg:grid lg:grid-cols-5 gap-2 lg:gap-3 overflow-x-auto -mx-1 px-1 pb-1 snap-x" role="list" aria-label="Resumo da agenda">
              <Kpi rotulo="Hoje" valor={resumo.hoje} tom="sinal" />
              <Kpi rotulo="Confirmadas" valor={resumo.confirmadas} tom="ok" />
              <Kpi rotulo="Aguardando" valor={resumo.aguardando} tom={resumo.aguardando ? "atencao" : undefined} titulo="Aguardando reagendamento" />
              <Kpi rotulo="Concluídas" valor={resumo.concluidas} />
              <Kpi rotulo="Canceladas" valor={resumo.canceladas} tom={resumo.canceladas ? "critico" : undefined} />
            </div>
            {consultas.length >= LIMITE_BOOTSTRAP ? (
              <div className="ba-aviso" data-tom="atencao">
                <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <p>O servidor carrega no máximo {LIMITE_BOOTSTRAP} consultas para o admin. Pode haver consultas que não aparecem aqui.</p>
              </div>
            ) : null}
            <p className="text-sm ba-texto-2" aria-live="polite">
              {lista.length} {lista.length === 1 ? "consulta" : "consultas"}
              {lista.length > visiveis.length ? ` · mostrando ${visiveis.length}` : ""}
            </p>
            {lista.length === 0 ? (
              <div className="ba-card" data-denso="true">
                <EstadoVazio icone={CalendarDays} titulo="Nenhuma consulta com esses filtros" texto="Mude o período ou limpe a busca." />
              </div>
            ) : largo ? (
              <TabelaAgenda linhas={visiveis} agora={agora} selecionada={idAberto} onAbrir={(c) => abrir(c)} />
            ) : (
              <LinhaDoTempo lista={visiveis} agora={agora} onAbrir={abrir} />
            )}
            {lista.length > visiveis.length ? (
              <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="ba-botao ba-botao-secundario w-full">
                Mostrar mais {Math.min(PAGINA, lista.length - visiveis.length)}
              </button>
            ) : null}
          </>
        )}
      </div>
      <DetalheConsulta id={aba === "agenda" ? idAberto : null} agora={agora} modoInicial={modoInicial} onFechar={() => irPara({ consulta: null })} />
    </TelaModulo>
  );
}

function Kpi({ rotulo, valor, tom, titulo }: { rotulo: string; valor: number; tom?: string; titulo?: string }) {
  return (
    <div role="listitem" title={titulo} className="ba-card shrink-0 min-w-[7.25rem] lg:min-w-0 snap-start" data-tom={tom} data-denso="true">
      <p className="ba-rotulo">{rotulo}</p>
      <p className="ba-numero text-2xl lg:text-3xl tabular-nums">{valor}</p>
    </div>
  );
}

function BarraFiltros({ filtros, onMudar, medicos }: { filtros: Filtros; onMudar: (f: Partial<Filtros>) => void; medicos: { id: string; nome: string }[] }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col lg:flex-row gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Buscar por paciente, médico ou especialidade</span>
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
          <input
            type="search"
            value={filtros.busca}
            onChange={(e) => onMudar({ busca: e.target.value })}
            placeholder="Buscar paciente, médico ou especialidade"
            className="ba-entrada !pl-10"
          />
        </label>
        <div role="group" aria-label="Período" className="ba-abas self-start overflow-x-auto max-w-full">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={filtros.periodo === p.id} onClick={() => onMudar({ periodo: p.id })} className="ba-aba">
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:flex gap-2">
        <Seletor rotulo="Status" valor={filtros.status} onMudar={(v) => onMudar({ status: v as Filtros["status"] })}>
          <option value="todos">Todos os status</option>
          {STATUS_FILTRO.map((s) => (
            <option key={s} value={s}>
              {estadoConsulta(s).rotulo}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Pagamento" valor={filtros.pago} onMudar={(v) => onMudar({ pago: v as Filtros["pago"] })}>
          <option value="todos">Pagas e não pagas</option>
          <option value="pago">Só pagas</option>
          <option value="nao_pago">Só não pagas</option>
        </Seletor>
        <Seletor rotulo="Médico" valor={filtros.medicoId} onMudar={(v) => onMudar({ medicoId: v })} className="col-span-2 lg:min-w-64">
          <option value="">Todos os médicos</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Seletor>
      </div>
    </div>
  );
}

function Seletor({ rotulo, valor, onMudar, children, className = "" }: { rotulo: string; valor: string; onMudar: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="sr-only">{rotulo}</span>
      <select value={valor} onChange={(e) => onMudar(e.target.value)} className="ba-entrada w-full" aria-label={rotulo}>
        {children}
      </select>
    </label>
  );
}

/** Celular/tablet: linha do tempo por dia, cabeçalho do dia fixo no topo. */
function LinhaDoTempo({ lista, agora, onAbrir }: { lista: Consulta[]; agora: number; onAbrir: (c: Consulta, modo?: "detalhe" | "editar" | "cancelar") => void }) {
  return (
    <div className="space-y-4">
      {agruparPorDia(lista).map((g) => (
        <section key={g.dia} aria-label={rotuloDia(g.ts, agora)}>
          <h2 className="ba-dia-fixo">
            <span>{rotuloDia(g.ts, agora)}</span>
            <span className="tabular-nums">
              {g.itens.length} {g.itens.length === 1 ? "consulta" : "consultas"}
            </span>
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {g.itens.map((c) => {
              const chips = chipsConsulta(c, agora);
              return (
                <CardDeslizavel
                  key={c.id}
                  rotulo={`Consulta de ${c.paciente} às ${horaDe(c.ts)}`}
                  tom={chips[0].tom}
                  denso
                  onAbrir={() => onAbrir(c)}
                  direita={{ id: "editar", rotulo: "Editar ou remarcar", icone: Pencil, tom: "sinal", modo: "confirmar", executar: () => onAbrir(c, "editar") }}
                  esquerda={
                    podeCancelar(c)
                      ? { id: "cancelar", rotulo: "Cancelar…", icone: CalendarX2, tom: "critico", modo: "confirmar", executar: () => onAbrir(c, "cancelar") }
                      : undefined
                  }
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 w-14">
                      <p className="ba-numero text-xl tabular-nums leading-none">{horaDe(c.ts)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold leading-snug break-words">{c.paciente}</p>
                      <p className="text-xs ba-texto-2 break-words">
                        {c.medico} · {c.especialidade}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {chips.map((e) => (
                          <ChipEstado key={e.rotulo} estado={e} />
                        ))}
                      </div>
                      {c.motivoCancelamento ? (
                        <p className="text-xs mt-1 break-words" style={{ color: "var(--ba-critico)" }}>
                          Motivo: {c.motivoCancelamento}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardDeslizavel>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Desktop: tabela densa; o detalhe abre no painel à direita. */
function TabelaAgenda({ linhas, agora, selecionada, onAbrir }: { linhas: Consulta[]; agora: number; selecionada: string | null; onAbrir: (c: Consulta) => void }) {
  const colunas: ColunaAdmin<Consulta>[] = [
    {
      id: "quando",
      titulo: "Quando",
      largura: "9.5rem",
      render: (c) => (
        <span className="whitespace-nowrap">
          <span className="ba-texto-2">{rotuloDia(c.ts, agora)}</span> <b className="tabular-nums">{horaDe(c.ts)}</b>
        </span>
      ),
    },
    { id: "paciente", titulo: "Paciente", render: (c) => <span className="font-bold whitespace-nowrap">{c.paciente}</span> },
    { id: "medico", titulo: "Médico", render: (c) => <span className="whitespace-nowrap">{c.medico}</span> },
    { id: "esp", titulo: "Especialidade", secundaria: true, render: (c) => <span className="ba-texto-2">{c.especialidade}</span> },
    {
      id: "status",
      titulo: "Status",
      render: (c) => (
        <span className="flex flex-wrap gap-1 py-1">
          {chipsConsulta(c, agora)
            .filter((e) => e.rotulo !== "Pago" && e.rotulo !== "Não pago")
            .map((e) => (
              <ChipEstado key={e.rotulo} estado={e} />
            ))}
        </span>
      ),
    },
    {
      id: "pago",
      titulo: "Pago",
      largura: "6.5rem",
      render: (c) => (c.status === "cancelada" ? <span className="ba-texto-3">—</span> : <ChipEstado estado={c.pago ? { rotulo: "Pago", tom: "ok" } : { rotulo: "Não pago", tom: "atencao" }} />),
    },
    { id: "valor", titulo: "Valor", tipo: "num", largura: "7rem", render: (c) => (c.valor ? brl(centavosDoValor(c.valor)) : "—") },
  ];
  return <TabelaAdmin rotulo="Consultas" colunas={colunas} linhas={linhas} chave={(c) => c.id} onAbrir={onAbrir} selecionada={selecionada} alturaMax="none" />;
}
