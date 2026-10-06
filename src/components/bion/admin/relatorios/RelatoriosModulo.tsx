"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2, ChevronRight, FileDown, FileText, Handshake, Paperclip, Star, Stethoscope, TrendingUp, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useBion, type Avaliacao, type Consulta } from "@/lib/bion-store";
import { TelaModulo } from "../ui/TelaModulo";
import { CardAdmin, KpiAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { SheetAdmin } from "../ui/SheetAdmin";
import { useDadosAdmin } from "../dados";
import { estadoConsulta } from "../rotulos";
import { hora, rotuloDia } from "../tempo";
import { exportarCsvRelatorio, exportarPdfRelatorio, type EntradaExportacao } from "./exportar";
import {
  FILTROS_RELATORIO_PADRAO,
  PERIODOS,
  calcularRelatorio,
  filtrarAvaliacoesRelatorio,
  filtrarConsultasRelatorio,
  notaMedia,
  opcoesRelatorio,
  pacientesDoRecorte,
  textoFiltro,
  type FiltrosRelatorio,
} from "./relatorio";

type Drill = null | "consultas" | "concluidas" | "canceladas" | "avaliacoes" | "pacientes";
const TITULO_DRILL: Record<Exclude<Drill, null>, string> = {
  consultas: "Consultas do recorte",
  concluidas: "Consultas concluídas",
  canceladas: "Consultas canceladas",
  avaliacoes: "Avaliações do recorte",
  pacientes: "Pacientes com consulta",
};
const PAGINA = 50;

/**
 * Relatórios do admin (Torre BION): tudo o que a tela antiga tinha —
 * filtros (período, especialidade, médico), indicadores com detalhe por
 * trás de cada número, documentos/arquivos/consentimentos, especialidades,
 * desempenho por médico, avaliações recentes e as exportações CSV/PDF com a
 * mesma lógica (e o mesmo registro na auditoria). Dados reais do store.
 */
export function RelatoriosModulo() {
  const router = useRouter();
  const { consultas, documentos, avaliacoes, arquivos, consentimentos, registrarAudit } = useBion();
  const { agora, atualizar, atualizando } = useDadosAdmin();
  const [filtros, setFiltros] = useState<FiltrosRelatorio>(FILTROS_RELATORIO_PADRAO);
  const [drill, setDrill] = useState<Drill>(null);

  const opcoes = useMemo(() => opcoesRelatorio(consultas, avaliacoes), [consultas, avaliacoes]);
  const consultasFiltradas = useMemo(() => filtrarConsultasRelatorio(consultas, filtros, agora), [consultas, filtros, agora]);
  const avaliacoesFiltradas = useMemo(() => filtrarAvaliacoesRelatorio(avaliacoes, filtros, agora), [avaliacoes, filtros, agora]);
  const dados = useMemo(() => calcularRelatorio(consultasFiltradas, avaliacoesFiltradas), [consultasFiltradas, avaliacoesFiltradas]);
  const filtroTexto = textoFiltro(filtros);
  const maxEsp = Math.max(1, ...dados.especialidades.map(([, n]) => n));
  const padrao = filtros.periodo === "todos" && filtros.especialidade === "todas" && filtros.medico === "todos";

  const mudar = (f: Partial<FiltrosRelatorio>) => setFiltros((x) => ({ ...x, ...f }));
  const limpar = () => {
    const antes = filtros;
    setFiltros(FILTROS_RELATORIO_PADRAO);
    toast("Filtros limpos", { action: { label: "Desfazer", onClick: () => setFiltros(antes) }, duration: 5000 });
  };

  const entrada: EntradaExportacao = {
    filtroTexto,
    dados,
    consultas: consultasFiltradas,
    avaliacoes: avaliacoesFiltradas,
    documentos: documentos.length,
    arquivos: arquivos.length,
    consentimentos: consentimentos.length,
  };
  const exportarCsv = () => {
    exportarCsvRelatorio(entrada, registrarAudit);
    toast.success("Relatório CSV gerado.");
  };
  const exportarPdf = () => {
    const paginas = exportarPdfRelatorio(entrada, registrarAudit);
    toast.success(`Relatório PDF gerado (${paginas} ${paginas === 1 ? "página" : "páginas"}).`);
  };

  return (
    <TelaModulo
      titulo="Relatórios"
      icone={TrendingUp}
      subtitulo="Indicadores em tempo real. Toque num número para ver o que há por trás dele."
      onAtualizar={() => void atualizar()}
      atualizando={atualizando}
      acoes={<BotoesExportar onCsv={exportarCsv} onPdf={exportarPdf} className="hidden sm:flex" />}
      ferramentas={
        <div className="space-y-2 w-full">
          <BotoesExportar onCsv={exportarCsv} onPdf={exportarPdf} className="grid grid-cols-2 sm:hidden" />
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Período" className="ba-abas overflow-x-auto max-w-full">
              {PERIODOS.map((p) => (
                <button key={p.k} type="button" aria-pressed={filtros.periodo === p.k} onClick={() => mudar({ periodo: p.k })} className="ba-aba">
                  {p.label}
                </button>
              ))}
            </div>
            {!padrao ? (
              <button type="button" onClick={limpar} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
                Limpar filtros
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-2">
            <label className="block min-w-0 lg:min-w-64">
              <span className="sr-only">Especialidade</span>
              <select value={filtros.especialidade} onChange={(e) => mudar({ especialidade: e.target.value })} className="ba-entrada w-full" aria-label="Especialidade">
                <option value="todas">Todas as especialidades</option>
                {opcoes.esp.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 lg:min-w-64">
              <span className="sr-only">Médico</span>
              <select value={filtros.medico} onChange={(e) => mudar({ medico: e.target.value })} className="ba-entrada w-full" aria-label="Médico">
                <option value="todos">Todos os médicos</option>
                {opcoes.med.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm ba-texto-2" aria-live="polite">
          {filtroTexto}
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiAdmin rotulo="Consultas" icone={CalendarCheck} valor={dados.total} detalhe={`${dados.concluidas} concluída(s)`} onAbrir={() => setDrill("consultas")} denso />
          <KpiAdmin rotulo="Concluídas" icone={CheckCircle2} valor={dados.concluidas} tom={dados.concluidas ? "ok" : undefined} detalhe="consultas realizadas" onAbrir={() => setDrill("concluidas")} denso />
          <KpiAdmin
            rotulo="Cancelamento"
            icone={XCircle}
            valor={`${dados.taxaCancelamento}%`}
            tom={dados.canceladas ? "critico" : undefined}
            detalhe={`${dados.canceladas} cancelada(s)`}
            onAbrir={() => setDrill("canceladas")}
            denso
          />
          <KpiAdmin
            rotulo="Satisfação"
            icone={Star}
            valor={dados.media ? virgula(dados.media.toFixed(1)) : "—"}
            detalhe={`${avaliacoesFiltradas.length} avaliação(ões)`}
            onAbrir={() => setDrill("avaliacoes")}
            denso
          />
          <KpiAdmin rotulo="Pacientes ativos" icone={Users} valor={dados.pacientes} detalhe="com consulta registrada" onAbrir={() => setDrill("pacientes")} denso className="col-span-2 lg:col-span-1" />
        </div>

        <CardAdmin titulo="Registros da plataforma" icone={FileText} denso>
          <ul className="grid grid-cols-3 gap-2 text-center">
            <Registro icone={FileText} valor={documentos.length} rotulo="Documentos emitidos" detalhe="receitas e atestados" />
            <Registro icone={Paperclip} valor={arquivos.length} rotulo="Arquivos trocados" detalhe="exames e anexos" />
            <Registro icone={Handshake} valor={consentimentos.length} rotulo="Consentimentos" detalhe="acessos ao PDF" />
          </ul>
          <p className="text-xs ba-texto-3 mt-3">Total carregado: estes três não seguem os filtros (como na tela antiga).</p>
        </CardAdmin>

        <div className="grid gap-3 lg:grid-cols-2">
          <CardAdmin titulo="Consultas por especialidade" icone={Stethoscope}>
            {dados.especialidades.length === 0 ? (
              <p className="text-sm ba-texto-2">Sem dados para os filtros atuais.</p>
            ) : (
              <ul className="space-y-1">
                {dados.especialidades.map(([esp, n]) => (
                  <li key={esp}>
                    <button
                      type="button"
                      onClick={() => {
                        mudar({ especialidade: esp });
                        setDrill("consultas");
                      }}
                      className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-[color:color-mix(in_srgb,var(--ba-sinal)_8%,transparent)]"
                      aria-label={`${esp}: ${n} consultas. Filtrar e ver`}
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-bold truncate">{esp}</span>
                        <span className="ba-texto-2 tabular-nums shrink-0">
                          {n} · {Math.round((n / Math.max(1, dados.total)) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full mt-1" style={{ background: "color-mix(in srgb, var(--ba-texto) 10%, transparent)" }} aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${(n / maxEsp) * 100}%`, background: "var(--ba-sinal)" }} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardAdmin>

          <CardAdmin titulo="Desempenho por médico" icone={Users}>
            {dados.medicos.length === 0 ? (
              <p className="text-sm ba-texto-2">Sem dados para os filtros atuais.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--ba-borda)]">
                {dados.medicos.map(([m, v]) => (
                  <li key={m}>
                    <button
                      type="button"
                      onClick={() => {
                        mudar({ medico: m });
                        setDrill("consultas");
                      }}
                      className="w-full flex items-center gap-3 py-2 text-left"
                      aria-label={`${m}: ${v.total} consultas, nota ${virgula(notaMedia(v))}. Filtrar e ver`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{m}</p>
                        <p className="text-xs ba-texto-2">{v.total} consulta(s)</p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums shrink-0">
                        <Star className="w-4 h-4" style={{ color: v.n ? "var(--ba-atencao)" : "var(--ba-texto-3)", fill: v.n ? "currentColor" : "none" }} aria-hidden />
                        {virgula(notaMedia(v))}
                      </span>
                      <ChevronRight className="w-4 h-4 ba-texto-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardAdmin>

          <CardAdmin titulo="Avaliações recentes" icone={Star}>
            {avaliacoesFiltradas.length === 0 ? (
              <p className="text-sm ba-texto-2">Nenhuma avaliação no período.</p>
            ) : (
              <ul className="space-y-2">
                {avaliacoesFiltradas.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <ItemAvaliacao a={a} agora={agora} />
                  </li>
                ))}
              </ul>
            )}
          </CardAdmin>

          <CardAdmin titulo="Exportar relatório" icone={FileDown} tom="sinal">
            <p className="text-sm">O PDF e o CSV levam exatamente o recorte desta tela:</p>
            <p className="text-xs ba-texto-2 mt-1 break-words">{filtroTexto}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Previa rotulo="Indicadores" valor="5 + 3" />
              <Previa rotulo="Especialidades" valor={dados.especialidades.length} />
              <Previa rotulo="Médicos" valor={dados.medicos.length} />
              <Previa rotulo="Avaliações" valor={avaliacoesFiltradas.length} />
              <Previa rotulo="Consultas (só no CSV)" valor={consultasFiltradas.length} />
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={exportarCsv} className="ba-botao ba-botao-secundario">
                <FileDown className="w-4 h-4" aria-hidden /> Baixar CSV
              </button>
              <button type="button" onClick={exportarPdf} className="ba-botao ba-botao-primario">
                <FileDown className="w-4 h-4" aria-hidden /> Gerar PDF
              </button>
            </div>
            <p className="text-xs ba-texto-3 mt-2">Cada exportação fica registrada na Auditoria.</p>
          </CardAdmin>
        </div>
      </div>

      <DetalheDrill
        drill={drill}
        onFechar={() => setDrill(null)}
        consultas={consultasFiltradas}
        avaliacoes={avaliacoesFiltradas}
        agora={agora}
        filtroTexto={filtroTexto}
        onAbrirConsulta={(c) => router.push(`/admin-agendamentos?consulta=${encodeURIComponent(c.id)}`)}
      />
    </TelaModulo>
  );
}

/** Nota com vírgula na tela (o PDF/CSV mantêm o formato antigo). */
const virgula = (s: string) => s.replace(".", ",");

function BotoesExportar({ onCsv, onPdf, className }: { onCsv: () => void; onPdf: () => void; className: string }) {
  return (
    <div className={`gap-2 ${className}`}>
      <button type="button" onClick={onCsv} className="ba-botao ba-botao-secundario !min-h-11 !px-3" aria-label="Exportar relatório em CSV">
        <FileDown className="w-4 h-4" aria-hidden /> CSV
      </button>
      <button type="button" onClick={onPdf} className="ba-botao ba-botao-primario !min-h-11 !px-3" aria-label="Gerar relatório em PDF">
        <FileDown className="w-4 h-4" aria-hidden /> PDF
      </button>
    </div>
  );
}

function Registro({ icone: Ic, valor, rotulo, detalhe }: { icone: typeof FileText; valor: number; rotulo: string; detalhe: string }) {
  return (
    <li className="min-w-0">
      <Ic className="w-4 h-4 mx-auto ba-texto-3" aria-hidden />
      <p className="ba-numero text-2xl mt-1">{valor}</p>
      <p className="text-xs font-bold leading-tight break-words">{rotulo}</p>
      <p className="text-[11px] ba-texto-3 leading-tight hidden sm:block">{detalhe}</p>
    </li>
  );
}

function Previa({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--ba-texto) 5%, transparent)" }}>
      <span className="ba-texto-2 text-xs">{rotulo}</span>
      <b className="tabular-nums">{valor}</b>
    </li>
  );
}

function quandoAvaliacao(a: Avaliacao, agora: number) {
  return Number.isFinite(a.ts) && a.ts > 0 ? `${rotuloDia(a.ts, agora)} às ${hora(a.ts)}` : a.quando;
}

function ItemAvaliacao({ a, agora }: { a: Avaliacao; agora: number }) {
  return (
    <div className="ba-card" data-denso="true">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Nota ${a.nota} de 5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="w-3.5 h-3.5" style={{ color: i < a.nota ? "var(--ba-atencao)" : "var(--ba-texto-3)", fill: i < a.nota ? "currentColor" : "none" }} aria-hidden />
          ))}
        </span>
        <span className="text-xs ba-texto-3 shrink-0">{quandoAvaliacao(a, agora)}</span>
      </div>
      <p className="text-sm font-bold mt-1 break-words">
        {a.medico} · <span className="font-normal ba-texto-2">{a.especialidade}</span>
      </p>
      <p className="text-xs ba-texto-2">{a.paciente}</p>
      {a.comentario ? <p className="text-sm mt-1 break-words">“{a.comentario}”</p> : null}
    </div>
  );
}

function DetalheDrill({
  drill,
  onFechar,
  consultas,
  avaliacoes,
  agora,
  filtroTexto,
  onAbrirConsulta,
}: {
  drill: Drill;
  onFechar: () => void;
  consultas: Consulta[];
  avaliacoes: Avaliacao[];
  agora: number;
  filtroTexto: string;
  onAbrirConsulta: (c: Consulta) => void;
}) {
  const [limite, setLimite] = useState(PAGINA);
  const [drillAntes, setDrillAntes] = useState(drill);
  if (drill !== drillAntes) {
    setDrillAntes(drill);
    setLimite(PAGINA);
  }
  const lista =
    drill === "consultas"
      ? consultas
      : drill === "concluidas"
        ? consultas.filter((c) => c.status === "concluida")
        : drill === "canceladas"
          ? consultas.filter((c) => c.status === "cancelada")
          : [];
  const ordenada = [...lista].sort((a, b) => b.ts - a.ts);
  const pacientes = drill === "pacientes" ? pacientesDoRecorte(consultas) : [];
  const total = drill === "avaliacoes" ? avaliacoes.length : drill === "pacientes" ? pacientes.length : ordenada.length;

  return (
    <SheetAdmin aberto={drill !== null} onFechar={onFechar} titulo={drill ? TITULO_DRILL[drill] : "Detalhe"} descricao={`${total} ${total === 1 ? "registro" : "registros"} · ${filtroTexto}`}>
      {total === 0 ? (
        <EstadoVazio titulo="Nenhum registro para os filtros atuais" texto="Mude o período, a especialidade ou o médico." />
      ) : drill === "avaliacoes" ? (
        <ul className="space-y-2">
          {avaliacoes.slice(0, limite).map((a) => (
            <li key={a.id}>
              <ItemAvaliacao a={a} agora={agora} />
            </li>
          ))}
        </ul>
      ) : drill === "pacientes" ? (
        <ul className="space-y-2">
          {pacientes.slice(0, limite).map((p) => (
            <li key={p.nome} className="ba-card flex items-center justify-between gap-3" data-denso="true">
              <div className="min-w-0">
                <p className="text-sm font-bold break-words">{p.nome}</p>
                <p className="text-xs ba-texto-2">Última: {rotuloDia(p.ultima, agora)} às {hora(p.ultima)}</p>
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0">
                {p.consultas} {p.consultas === 1 ? "consulta" : "consultas"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {ordenada.slice(0, limite).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onAbrirConsulta(c)} className="ba-card" data-denso="true" data-tom={estadoConsulta(c.status).tom} aria-label={`${c.paciente}, ${c.especialidade}, ${rotuloDia(c.ts, agora)} às ${hora(c.ts)}. Abrir em Agendamentos`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold break-words">
                      {c.paciente} · <span className="font-normal ba-texto-2">{c.especialidade}</span>
                    </p>
                    <p className="text-xs ba-texto-2 break-words">
                      {c.medico} · {rotuloDia(c.ts, agora)} às {hora(c.ts)}
                    </p>
                  </div>
                  <ChipEstado estado={estadoConsulta(c.status)} className="shrink-0" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > limite ? (
        <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="ba-botao ba-botao-secundario w-full mt-3">
          Mostrar mais {Math.min(PAGINA, total - limite)}
        </button>
      ) : null}
    </SheetAdmin>
  );
}
