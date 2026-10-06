"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Cpu,
  FileDown,
  FileSearch,
  FileText,
  Handshake,
  Info,
  KeyRound,
  LifeBuoy,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useBion, type AuditLog } from "@/lib/bion-store";
import { TelaModulo } from "../ui/TelaModulo";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio, Esqueleto } from "../ui/Estados";
import { useDadosAdmin } from "../dados";
import { estadoSeveridade } from "../rotulos";
import { rotuloDia } from "../tempo";
import { DetalheEvento } from "./DetalheEvento";
import { FiltrosAuditoriaSheet } from "./FiltrosAuditoria";
import { exportarCsvAuditoria, exportarPdfAuditoria } from "./exportar";
import {
  CATEGORIAS,
  FILTROS_VAZIOS,
  SEVERIDADES,
  agruparPorDiaEHora,
  contarPor,
  filtrarEventos,
  filtrosAtivos,
  horaSegundos,
  jsonFormatado,
  opcoesFiltro,
  resumo24h,
  rotuloAcao,
  rotuloCategoria,
  rotuloHora,
  rotuloPerfil,
  type FiltrosAuditoria,
} from "./trilha";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
const PAGINA = 60;
/** O bootstrap do admin traz os 300 eventos mais recentes (lib/server/dados.ts). */
const LIMITE_BOOTSTRAP = 300;

export const ICONE_CATEGORIA: Record<string, Icone> = {
  autenticacao: KeyRound,
  consulta: CalendarDays,
  documento: FileText,
  prontuario: ClipboardList,
  usuario: UserRound,
  admin: ShieldCheck,
  suporte: LifeBuoy,
  consentimento: Handshake,
  sistema: Cpu,
};

/**
 * Auditoria do admin (Torre BION): linha do tempo agrupada por dia e hora,
 * severidade visível (faixa + chip com texto), filtros (busca, severidade e
 * categoria à mão; perfil, usuário, entidade e período no sheet) e as
 * exportações CSV/PDF com a mesma lógica do AuditTrail antigo.
 * ?evento=ID abre o detalhe (a Fila do Centro de Comando leva direto a ele).
 * Dados: os eventos reais que o bootstrap do admin já traz (auditLogs).
 */
export function AuditoriaModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const { auditLogs, registrarAudit } = useBion();
  const { agora, atualizar, atualizando } = useDadosAdmin();
  const idAberto = params.get("evento");
  const [filtros, setFiltros] = useState<FiltrosAuditoria>(FILTROS_VAZIOS);
  const [limite, setLimite] = useState(PAGINA);
  const [sheetFiltros, setSheetFiltros] = useState(false);

  const mudar = (f: Partial<FiltrosAuditoria>) => {
    setFiltros((x) => ({ ...x, ...f }));
    setLimite(PAGINA);
  };
  const limpar = () => {
    const antes = filtros;
    setFiltros(FILTROS_VAZIOS);
    setLimite(PAGINA);
    toast("Filtros limpos", { action: { label: "Desfazer", onClick: () => setFiltros(antes) }, duration: 5000 });
  };
  const abrir = (id: string | null) => router.replace(id ? `/auditoria?evento=${encodeURIComponent(id)}` : "/auditoria", { scroll: false });

  const lista = useMemo(() => filtrarEventos(auditLogs, filtros), [auditLogs, filtros]);
  // Contagens dos chips: cada grupo ignora o próprio filtro (dá para ver o que há nas outras opções).
  const porSeveridade = useMemo(() => contarPor(filtrarEventos(auditLogs, { ...filtros, severidade: "todas" }), "severidade"), [auditLogs, filtros]);
  const porCategoria = useMemo(() => contarPor(filtrarEventos(auditLogs, { ...filtros, categoria: "todas" }), "categoria"), [auditLogs, filtros]);
  const opcoes = useMemo(() => opcoesFiltro(auditLogs), [auditLogs]);
  const r24 = useMemo(() => resumo24h(auditLogs, agora), [auditLogs, agora]);
  const visiveis = lista.slice(0, limite);
  const grupos = useMemo(() => agruparPorDiaEHora(visiveis), [visiveis]);
  const nAtivos = filtrosAtivos(filtros);
  const algumFiltro = nAtivos > 0 || filtros.busca.trim() !== "";
  const pessoas = useMemo(() => new Set(lista.map((l) => l.usuario)).size, [lista]);

  const exportarCsv = () => {
    exportarCsvAuditoria(lista, registrarAudit);
    toast.success(`CSV gerado com ${lista.length} ${lista.length === 1 ? "registro" : "registros"}.`);
  };
  const exportarPdf = () => {
    const paginas = exportarPdfAuditoria(lista, registrarAudit);
    toast.success(`PDF gerado: ${lista.length} ${lista.length === 1 ? "registro" : "registros"}, ${paginas} ${paginas === 1 ? "página" : "páginas"}.`);
  };

  const carregandoInicio = atualizando && auditLogs.length === 0;

  return (
    <TelaModulo
      titulo="Auditoria"
      icone={FileSearch}
      subtitulo={`${auditLogs.length} ${auditLogs.length === 1 ? "evento carregado" : "eventos carregados"} · ${r24.criticos} ${r24.criticos === 1 ? "crítico" : "críticos"} nas últimas 24 h`}
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      acoes={<BotoesExportar n={lista.length} onCsv={exportarCsv} onPdf={exportarPdf} className="hidden sm:flex" />}
      ferramentas={
        <div className="space-y-2 w-full">
          <BotoesExportar n={lista.length} onCsv={exportarCsv} onPdf={exportarPdf} className="grid grid-cols-2 sm:hidden" />
          <div className="flex gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Pesquisar ações, usuários, entidades e detalhes</span>
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ba-texto-3" aria-hidden />
              <input
                type="search"
                value={filtros.busca}
                onChange={(e) => mudar({ busca: e.target.value })}
                placeholder="Pesquisar ações, usuários, detalhes…"
                className="ba-entrada !pl-10"
              />
            </label>
            <button type="button" onClick={() => setSheetFiltros(true)} className="ba-botao ba-botao-secundario shrink-0" aria-label={`Filtros${nAtivos ? ` (${nAtivos} ligados)` : ""}`}>
              <SlidersHorizontal className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Filtros</span>
              {nAtivos ? <span className="tabular-nums">· {nAtivos}</span> : null}
            </button>
          </div>
          <div role="group" aria-label="Severidade" className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <ChipFiltro ativo={filtros.severidade === "todas"} onClick={() => mudar({ severidade: "todas" })}>
              Todas as severidades
            </ChipFiltro>
            {SEVERIDADES.map((s) => (
              <ChipFiltro key={s.k} ativo={filtros.severidade === s.k} tom={s.tom} contagem={porSeveridade[s.k] ?? 0} onClick={() => mudar({ severidade: filtros.severidade === s.k ? "todas" : s.k })}>
                {s.label}
              </ChipFiltro>
            ))}
          </div>
          <div role="group" aria-label="Categoria" className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            {CATEGORIAS.map((c) => {
              const Ic = ICONE_CATEGORIA[c.k] ?? Info;
              return (
                <ChipFiltro key={c.k} ativo={filtros.categoria === c.k} contagem={porCategoria[c.k] ?? 0} onClick={() => mudar({ categoria: filtros.categoria === c.k ? "todas" : c.k })}>
                  <Ic className="w-3.5 h-3.5" aria-hidden /> {c.label}
                </ChipFiltro>
              );
            })}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex lg:grid lg:grid-cols-4 gap-2 lg:gap-3 overflow-x-auto -mx-1 px-1 pb-1" role="list" aria-label="Resumo da auditoria">
          <Kpi rotulo="Na seleção" valor={lista.length} detalhe={lista.length === auditLogs.length ? "todos os carregados" : `de ${auditLogs.length}`} />
          <Kpi rotulo="Críticos · 24 h" valor={r24.criticos} tom={r24.criticos ? "critico" : undefined} onClick={() => mudar({ severidade: "critical" })} />
          <Kpi rotulo="Atenção · 24 h" valor={r24.avisos} tom={r24.avisos ? "atencao" : undefined} onClick={() => mudar({ severidade: "warning" })} />
          <Kpi rotulo="Pessoas" valor={pessoas} detalhe="na seleção" />
        </div>

        {auditLogs.length >= LIMITE_BOOTSTRAP ? (
          <div className="ba-aviso" data-tom="atencao">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>O servidor carrega os {LIMITE_BOOTSTRAP} eventos mais recentes para o admin. Eventos mais antigos não aparecem aqui nem nas exportações.</p>
          </div>
        ) : null}

        {algumFiltro ? (
          <ResumoFiltros filtros={filtros} onMudar={mudar} onLimpar={limpar} />
        ) : null}

        <p className="text-sm ba-texto-2" aria-live="polite">
          {lista.length} {lista.length === 1 ? "registro encontrado" : "registros encontrados"}
          {lista.length > visiveis.length ? ` · mostrando ${visiveis.length}` : ""}
        </p>

        {carregandoInicio ? (
          <Esqueleto variante="lista" quantidade={4} rotulo="Carregando a auditoria…" />
        ) : lista.length === 0 ? (
          <div className="ba-card" data-denso="true">
            <EstadoVazio
              icone={FileSearch}
              titulo={auditLogs.length ? "Nenhum registro com esses filtros" : "Nenhum evento registrado ainda"}
              texto={auditLogs.length ? "Ajuste a categoria, a severidade, o período ou a busca." : "Os eventos aparecem aqui assim que alguém usar o app."}
              acao={
                algumFiltro ? (
                  <button type="button" onClick={limpar} className="ba-botao ba-botao-secundario">
                    Limpar filtros
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <LinhaDoTempo grupos={grupos} agora={agora} selecionado={idAberto} onAbrir={(l) => abrir(l.id)} />
        )}

        {lista.length > visiveis.length ? (
          <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="ba-botao ba-botao-secundario w-full">
            Mostrar mais {Math.min(PAGINA, lista.length - visiveis.length)}
          </button>
        ) : null}
      </div>

      <FiltrosAuditoriaSheet
        aberto={sheetFiltros}
        onFechar={() => setSheetFiltros(false)}
        filtros={filtros}
        opcoes={opcoes}
        onAplicar={(f) => {
          mudar(f);
          setSheetFiltros(false);
        }}
      />
      <DetalheEvento
        id={idAberto}
        agora={agora}
        onFechar={() => abrir(null)}
        onFiltrarEntidade={(entidade) => {
          mudar({ entidade });
          abrir(null);
        }}
        onFiltrarUsuario={(usuario) => {
          mudar({ usuario });
          abrir(null);
        }}
      />
    </TelaModulo>
  );
}

/** CSV e PDF: no cabeçalho a partir de 640 px; no celular, uma linha própria (o título não quebra). */
function BotoesExportar({ n, onCsv, onPdf, className }: { n: number; onCsv: () => void; onPdf: () => void; className: string }) {
  return (
    <div className={`gap-2 ${className}`}>
      <button type="button" onClick={onCsv} className="ba-botao ba-botao-secundario !min-h-11 !px-3" aria-label={`Exportar CSV (${n} registros)`}>
        <FileDown className="w-4 h-4" aria-hidden /> CSV
      </button>
      <button type="button" onClick={onPdf} className="ba-botao ba-botao-primario !min-h-11 !px-3" aria-label={`Exportar PDF (${n} registros)`}>
        <FileDown className="w-4 h-4" aria-hidden /> PDF
      </button>
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, tom, onClick }: { rotulo: string; valor: number; detalhe?: string; tom?: string; onClick?: () => void }) {
  const conteudo = (
    <>
      <p className="ba-rotulo">{rotulo}</p>
      <p className="ba-numero text-2xl lg:text-3xl tabular-nums" style={tom ? { color: "var(--ba-tom)" } : undefined}>
        {valor}
      </p>
      {detalhe ? <p className="text-xs ba-texto-2">{detalhe}</p> : null}
    </>
  );
  const cls = "ba-card shrink-0 min-w-[8rem] lg:min-w-0";
  return onClick ? (
    <div role="listitem" className="shrink-0 min-w-[8rem] lg:min-w-0">
      <button type="button" onClick={onClick} className={`${cls} h-full`} data-tom={tom} data-denso="true" aria-label={`${rotulo}: ${valor}. Filtrar`}>
        {conteudo}
      </button>
    </div>
  ) : (
    <div role="listitem" className={cls} data-tom={tom} data-denso="true">
      {conteudo}
    </div>
  );
}

function ChipFiltro({ ativo, tom, contagem, onClick, children }: { ativo: boolean; tom?: string; contagem?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} className="ba-filtro" data-tom={tom}>
      {tom ? <span className="ba-chip-ponto" aria-hidden /> : null}
      {children}
      {contagem != null ? <span className="tabular-nums opacity-80">{contagem}</span> : null}
    </button>
  );
}

function ResumoFiltros({ filtros: f, onMudar, onLimpar }: { filtros: FiltrosAuditoria; onMudar: (f: Partial<FiltrosAuditoria>) => void; onLimpar: () => void }) {
  const itens: { rotulo: string; tirar: Partial<FiltrosAuditoria> }[] = [];
  if (f.busca.trim()) itens.push({ rotulo: `“${f.busca.trim()}”`, tirar: { busca: "" } });
  if (f.severidade !== "todas") itens.push({ rotulo: estadoSeveridade(f.severidade).rotulo, tirar: { severidade: "todas" } });
  if (f.categoria !== "todas") itens.push({ rotulo: rotuloCategoria(f.categoria), tirar: { categoria: "todas" } });
  if (f.perfil !== "todos") itens.push({ rotulo: `Perfil: ${rotuloPerfil(f.perfil)}`, tirar: { perfil: "todos" } });
  if (f.usuario !== "todos") itens.push({ rotulo: `Usuário: ${f.usuario}`, tirar: { usuario: "todos" } });
  if (f.entidade !== "todas") itens.push({ rotulo: `Entidade: ${f.entidade}`, tirar: { entidade: "todas" } });
  if (f.de) itens.push({ rotulo: `De ${f.de.split("-").reverse().join("/")}`, tirar: { de: "" } });
  if (f.ate) itens.push({ rotulo: `Até ${f.ate.split("-").reverse().join("/")}`, tirar: { ate: "" } });
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ligados">
      {itens.map((i) => (
        <button key={i.rotulo} type="button" onClick={() => onMudar(i.tirar)} className="ba-filtro" aria-pressed="true" aria-label={`Tirar filtro ${i.rotulo}`}>
          <span className="truncate max-w-[14rem]">{i.rotulo}</span>
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      ))}
      <button type="button" onClick={onLimpar} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
        Limpar filtros
      </button>
    </div>
  );
}

/** Linha do tempo: dia (cabeçalho fixo) → hora cheia (marcador na trilha, na cor da pior severidade) → eventos. */
function LinhaDoTempo({ grupos, agora, selecionado, onAbrir }: { grupos: ReturnType<typeof agruparPorDiaEHora>; agora: number; selecionado: string | null; onAbrir: (l: AuditLog) => void }) {
  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g.dia} className="scroll-mt-20" aria-label={`${rotuloDia(g.ts, agora)}: ${g.total} ${g.total === 1 ? "evento" : "eventos"}`}>
          <h2 className="ba-dia-fixo">
            <span>{rotuloDia(g.ts, agora)}</span>
            <span className="tabular-nums">
              {g.total} {g.total === 1 ? "evento" : "eventos"}
            </span>
          </h2>
          <ol className="space-y-3">
            {g.horas.map((h) => {
              const sev = estadoSeveridade(h.pior);
              return (
                <li key={h.chave} className="ba-trilha-hora" data-tom={sev.tom}>
                  <p className="ba-trilha-marco">
                    <span className="ba-trilha-ponto" aria-hidden />
                    <span className="tabular-nums">{rotuloHora(h.hora)}</span>
                    <span className="ba-texto-3 font-semibold normal-case tracking-normal">
                      · {h.itens.length} {h.itens.length === 1 ? "evento" : "eventos"}
                      {h.pior !== "info" ? ` · ${sev.rotulo.toLowerCase()}` : ""}
                    </span>
                  </p>
                  <ul className="grid gap-2 xl:grid-cols-2">
                    {h.itens.map((l) => (
                      <li key={l.id}>
                        <CartaoEvento l={l} selecionado={selecionado === l.id} onAbrir={() => onAbrir(l)} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function CartaoEvento({ l, selecionado, onAbrir }: { l: AuditLog; selecionado: boolean; onAbrir: () => void }) {
  const sev = estadoSeveridade(l.severidade);
  const Ic = ICONE_CATEGORIA[l.categoria] ?? Info;
  const json = jsonFormatado(l.detalhes);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="ba-card"
      data-denso="true"
      data-tom={sev.tom}
      aria-current={selecionado || undefined}
      aria-label={`${rotuloAcao(l.acao)}, ${sev.rotulo}, ${horaSegundos(l.ts)}, por ${l.usuario}. Abrir detalhe`}
    >
      <div className="flex gap-3">
        <span className="ba-estado-icone !w-9 !h-9 shrink-0" data-tom={sev.tom === "neutro" ? "sinal" : sev.tom} aria-hidden>
          <Ic className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-sm leading-snug break-words">{rotuloAcao(l.acao)}</p>
            <span className="text-xs ba-texto-3 tabular-nums shrink-0">{horaSegundos(l.ts)}</span>
          </div>
          <p className="text-xs ba-texto-2 break-words mt-0.5">
            {l.usuario} ({rotuloPerfil(l.role)})
            {l.entidade ? (
              <>
                {" · "}
                <span className="font-semibold">{l.entidade}</span>
                {l.entidadeId ? <span className="ba-texto-3"> #{l.entidadeId.length > 12 ? `${l.entidadeId.slice(0, 10)}…` : l.entidadeId}</span> : null}
              </>
            ) : null}
          </p>
          {l.detalhes ? (
            <p className="text-xs ba-texto-2 mt-1 line-clamp-2 break-words">{json ? "Detalhes técnicos (JSON) — toque para ver" : l.detalhes}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <ChipEstado estado={sev} />
            <ChipEstado tom="neutro" ponto={false}>
              {rotuloCategoria(l.categoria)}
            </ChipEstado>
          </div>
        </div>
      </div>
    </button>
  );
}
