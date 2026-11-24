"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Ban,
  ChevronDown,
  ClipboardList,
  Download,
  ListFilter,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Arquivo, Consulta, Documento } from "@/lib/bion-store";
import { gerarDocumentoPDF, gerarReceitaCombinadaPDF } from "@/lib/receita-pdf";
import { agruparEmissoes } from "@/lib/documentos-agrupados";
import { rotuloStatusMedico } from "./metricas";
import { documentoCancelado, documentoEmitidoPor } from "./cancelar-documento";
import { AvisoConsentimentoHistorico, CartaoHistoricoClinico } from "./cartao-historico-clinico";
import { itensDeOutrosProfissionais, lerHistoricoClinico, type ItemHistoricoClinico } from "./historico-outros";
import {
  dataCurta,
  filtrarHistorico,
  frequenciaPosologia,
  legendaPaciente,
  linhasHistorico,
  medicamentosAtuais,
  situacaoExame,
  ultimasMedicoes,
  type MedicamentoEmUsoFicha,
  type ProgressoTratamento,
} from "./ficha/ficha-dados";

/** Selo "Cancelado" (20261103a): o documento continua no prontuário. */
function SeloCancelado({ d }: { d: Documento }) {
  if (!documentoCancelado(d)) return null;
  const data = d.canceladoEm ? new Date(d.canceladoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-600/15 text-red-800 dark:text-red-200 align-middle">
      <Ban className="w-3 h-3" aria-hidden /> Cancelado{data ? ` em ${data}` : ""}
    </span>
  );
}

/* Séries do paciente (item 13 da auditoria de melhorias): o bootstrap só
 * carrega Medicao/ExameLaboratorial para o próprio paciente, então o
 * prontuário do médico busca as séries no GET da evolução de uma consulta
 * dele com este paciente — a mesma fonte que a sala usa, com a mesma
 * permissão (só consulta do próprio médico). */
type MedicaoSerie = { id: string; tipo: string; valor1: number; valor2: number | null; criadoEm: string; origem: string };
type ItemExameSerie = { nome: string; valor: number; unidade?: string; refMin?: number; refMax?: number };
type ExameSerie = { id: string; titulo: string; dataColeta: string; itens: ItemExameSerie[]; origem: string };

const ROTULO_MEDICAO: Record<string, { rotulo: string; unidade: string }> = {
  peso: { rotulo: "Peso", unidade: "kg" },
  altura: { rotulo: "Altura", unidade: "cm" },
  pressao: { rotulo: "Pressão", unidade: "mmHg" },
  pa: { rotulo: "Pressão", unidade: "mmHg" },
};

function valorMedicao(m: MedicaoSerie): string {
  const u = ROTULO_MEDICAO[m.tipo]?.unidade ?? "";
  const base = m.valor2 != null ? `${m.valor1}/${m.valor2}` : `${m.valor1}`;
  return u ? `${base} ${u}` : base;
}

const numOuNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function lerMedicamentos(bruto: unknown): MedicamentoEmUsoFicha[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (m): m is MedicamentoEmUsoFicha =>
      !!m && typeof m === "object" && typeof (m as MedicamentoEmUsoFicha).id === "string" && typeof (m as MedicamentoEmUsoFicha).nome === "string" && typeof (m as MedicamentoEmUsoFicha).inicio === "string",
  );
}

function itensValidosSerie(bruto: unknown): ItemExameSerie[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (i): i is ItemExameSerie =>
      !!i && typeof i === "object" && typeof (i as ItemExameSerie).nome === "string" && Number.isFinite(Number((i as ItemExameSerie).valor)),
  );
}

function foraDaFaixaSerie(it: ItemExameSerie): boolean {
  if (typeof it.refMin === "number" && it.valor < it.refMin) return true;
  if (typeof it.refMax === "number" && it.valor > it.refMax) return true;
  return false;
}

const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const diaMes = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

// B-15: "exame" é aceito pelo servidor (tipo legado) — sem a chave, o rótulo
// de documentos antigos desse tipo ficava indefinido.
const ROTULO_DOC: Record<Documento["tipo"], string> = {
  receita: "Receita",
  atestado: "Atestado",
  exame: "Exame",
  exame_solicitado: "Exame solicitado",
};

function rotuloEmissor(d: Documento, medicoIdAtual: string): string {
  const nome = d.medico || "Médico";
  return documentoEmitidoPor(d, medicoIdAtual) ? nome : `${nome} (outro médico)`;
}

/** Dados de cabeçalho do cartão do paciente (todos reais, da ficha atual). */
export type CabecalhoFicha = {
  nome: string;
  idade: number | null;
  genero: string;
  /** Próxima consulta ou, sem ela, a última. */
  referencia: { rotulo: string; quando: string; motivo: string; atendimento: string } | null;
  nomeMedico: string;
};

type Perfil = { peso: number | null; altura: number | null };

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Anel do tratamento: verde = dias que faltam, azul = dias já passados. */
function AnelTratamento({ p }: { p: ProgressoTratamento }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const folga = 5; // espaço entre os dois arcos, como na referência
  let rotulo: string;
  let centro: string;
  let arcos: { cor: string; inicio: number; fim: number }[];
  if (p.tipo === "periodo") {
    // Verde = dias que faltam (a partir do topo, sentido horário); azul =
    // dias já passados, fechando o círculo no topo — como na ref. 17.
    const fr = p.restantes / p.total;
    centro = `${p.restantes}d`;
    rotulo = `Faltam ${p.restantes} de ${p.total} dias de tratamento`;
    arcos =
      fr >= 1
        ? [{ cor: "var(--bm2-anel-verde)", inicio: 0, fim: 1 }]
        : [
            { cor: "var(--bm2-anel-verde)", inicio: 0, fim: fr },
            { cor: "var(--bm2-anel-azul)", inicio: fr, fim: 1 },
          ];
  } else if (p.tipo === "continuo") {
    centro = "∞";
    rotulo = `Uso contínuo, na lista há ${p.desdeDias} dias`;
    arcos = [{ cor: "var(--bm2-anel-verde)", inicio: 0, fim: 1 }];
  } else {
    centro = "—";
    rotulo = "Sem data de fim registrada";
    arcos = [];
  }
  return (
    <div className="bm2-anel" role="img" aria-label={rotulo} title={rotulo}>
      <svg viewBox="0 0 57 57" width="57" height="57" aria-hidden>
        <circle cx="28.5" cy="28.5" r={r} className="bm2-anel-trilho" />
        {arcos.map((a, i) => {
          const so = arcos.length > 1;
          const len = Math.max(0, (a.fim - a.inicio) * c - (so ? folga : 0));
          return (
            <circle
              key={i}
              cx="28.5"
              cy="28.5"
              r={r}
              fill="none"
              stroke={a.cor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-(a.inicio * c + (so ? folga / 2 : 0))}
              transform="rotate(-90 28.5 28.5)"
            />
          );
        })}
      </svg>
      <span className="bm2-anel-centro" aria-hidden>{centro}</span>
    </div>
  );
}

/**
 * Histórico do paciente: consultas COMIGO (com resumo), anamneses e
 * evoluções de outros profissionais (somente leitura, com aviso de
 * consentimento — a mesma fonte do GET da evolução), documentos e arquivos.
 * Documentos vêm do store filtrados pelo IDENTIFICADOR do paciente (M-9:
 * o wire agora traz pacienteId); o aviso de homônimo cobre apenas
 * documentos legados gravados antes do identificador existir.
 */
export function ProntuarioPaciente({
  consultas,
  documentos,
  arquivos,
  homonimo,
  medicoIdAtual,
  onRenovar,
  cabecalho,
  onEmitir,
  onPedirMedicao,
  onAba,
}: {
  consultas: Consulta[];
  documentos: Documento[];
  arquivos: Arquivo[];
  homonimo: boolean;
  /** Médico logado: cancelar/renovar só nos documentos emitidos por ele. */
  medicoIdAtual: string;
  onRenovar: (d: Documento) => void;
  cabecalho: CabecalhoFicha;
  onEmitir: () => void;
  /** "Pedir medição" (mesma ação do topo); ausente sem consulta válida. */
  onPedirMedicao?: () => void;
  onAba: (aba: "conversa" | "triagem") => void;
}) {
  // 20261103a: cancelamentos feitos nesta tela (o store só atualiza no
  // próximo bootstrap). Cancelar nunca apaga: o documento segue listado.
  const [cancelados, setCancelados] = useState<Record<string, string>>({});
  const [cancelando, setCancelando] = useState<string | null>(null);
  const docs: Documento[] = documentos.map((d) =>
    cancelados[d.id] ? { ...d, status: "cancelado", canceladoEm: cancelados[d.id] } : d,
  );
  const cancelar = async (d: Documento) => {
    if (documentoCancelado(d) || cancelando) return;
    const confirmou = window.confirm(
      `Cancelar "${d.titulo}"?\n\nO documento não será apagado: continua no prontuário e na verificação pública marcado como CANCELADO, e não poderá ser renovado. Esta ação não pode ser desfeita.`,
    );
    if (!confirmou) return;
    setCancelando(d.id);
    try {
      const res = await fetch(`/api/medico/documentos/${encodeURIComponent(d.id)}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => null)) as { documento?: { canceladoEm?: string | null }; erro?: string } | null;
      if (!res.ok) throw new Error(j?.erro ?? "Não foi possível cancelar o documento.");
      setCancelados((m) => ({ ...m, [d.id]: j?.documento?.canceladoEm ?? new Date().toISOString() }));
      toast.success("Documento cancelado", { description: d.titulo });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar o documento.");
    } finally {
      setCancelando(null);
    }
  };
  const botaoCancelar = (d: Documento) =>
    documentoCancelado(d) || !documentoEmitidoPor(d, medicoIdAtual) ? null : (
      <button type="button" disabled={cancelando === d.id} onClick={() => void cancelar(d)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-red-600/10 text-red-800 dark:text-red-200 inline-flex items-center gap-1 shrink-0 disabled:opacity-60">
        <Ban className="w-3.5 h-3.5" /> {cancelando === d.id ? "Cancelando…" : "Cancelar documento"}
      </button>
    );

  const baixar = (d: Documento) => {
    try {
      gerarDocumentoPDF(d);
      toast.success("PDF baixado", { description: d.titulo });
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  // Séries de medições e exames: busca sob demanda na consulta mais
  // recente comigo (consultas chegam ordenadas da mais nova para a mais
  // antiga). Falha aqui não derruba o prontuário — vira aviso com retry.
  const consultaRef = consultas[0]?.id;
  const [series, setSeries] = useState<{
    medicoes: MedicaoSerie[];
    exames: ExameSerie[];
    historico: ItemHistoricoClinico[];
    medicamentos: MedicamentoEmUsoFicha[];
    perfil: Perfil;
    /** Evolução CONCLUÍDA da própria consulta de referência (CID/conduta). */
    propria: { cid: string | null; conduta: string | null; anamnese: boolean };
  } | null>(null);
  const [erroSeries, setErroSeries] = useState(false);
  const carregarSeries = useCallback(async () => {
    if (!consultaRef) return;
    try {
      const res = await fetch(`/api/medico/consultas/${encodeURIComponent(consultaRef)}/evolucao`, { credentials: "include" });
      if (!res.ok) throw new Error("evolucao");
      const j = (await res.json()) as {
        medicoes?: MedicaoSerie[];
        exames?: { id: string; titulo: string; dataColeta: string; itens: unknown; origem: string }[];
        historico?: unknown;
        medicamentosEmUso?: unknown;
        paciente?: { peso?: number | null; altura?: number | null } | null;
        evolucao?: { status?: string; cid?: string | null; conduta?: { texto?: unknown } | null } | null;
        anamnese?: { status?: string } | null;
      };
      const ev = j.evolucao?.status === "concluida" ? j.evolucao : null;
      setSeries({
        medicoes: j.medicoes ?? [],
        exames: (j.exames ?? []).map((e) => ({ ...e, itens: itensValidosSerie(e.itens) })),
        historico: lerHistoricoClinico(j.historico),
        medicamentos: lerMedicamentos(j.medicamentosEmUso),
        perfil: { peso: numOuNull(j.paciente?.peso), altura: numOuNull(j.paciente?.altura) },
        propria: {
          cid: ev?.cid?.trim() || null,
          conduta: typeof ev?.conduta?.texto === "string" ? ev.conduta.texto.trim() || null : null,
          anamnese: !!j.anamnese,
        },
      });
      setErroSeries(false);
    } catch {
      setErroSeries(true);
    }
  }, [consultaRef]);

  useEffect(() => {
    void carregarSeries();
  }, [carregarSeries]);

  // Última medição de cada tipo (a lista vem da mais nova para a mais antiga).
  const ultimasPorTipo = new Map<string, MedicaoSerie>();
  for (const m of series?.medicoes ?? []) {
    if (!ultimasPorTipo.has(m.tipo)) ultimasPorTipo.set(m.tipo, m);
  }
  const ultimas = ultimasMedicoes(series?.medicoes ?? []);

  // Mesmo fluxo de Arquivos.tsx: GET /api/arquivos?id= devolve um link assinado.
  const baixarArquivo = async (a: Arquivo) => {
    try {
      const res = await fetch(`/api/arquivos?id=${encodeURIComponent(a.id)}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        toast.error(json.erro || "Não foi possível gerar o link.");
        return;
      }
      const el = document.createElement("a");
      el.href = json.url;
      el.download = a.nome;
      el.target = "_blank";
      el.rel = "noopener";
      el.click();
    } catch {
      toast.error("Falha ao baixar.");
    }
  };

  // ---------------- Ficha (redesign azul, ref. 15/16/17) ----------------
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "comigo" | "outros">("todos");
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null);
  const [relAberto, setRelAberto] = useState<string | null>(null);
  const agora = Date.now();

  const outros = series ? itensDeOutrosProfissionais(series.historico) : [];
  const linhas = useMemo(() => {
    const hist = (series?.historico ?? []).map((h) => ({
      consultaId: h.consultaId,
      dataInicio: h.dataInicio,
      especialidade: h.especialidade,
      medico: h.medico,
      deOutroMedico: h.deOutroMedico,
      evolucao: h.evolucao ? { conduta: h.evolucao.conduta, cid: h.evolucao.cid } : null,
      anamnese: h.anamnese ? { status: h.anamnese.status } : null,
    }));
    if (series && consultaRef) {
      hist.push({
        consultaId: consultaRef,
        dataInicio: "",
        especialidade: "",
        medico: cabecalho.nomeMedico,
        deOutroMedico: false,
        evolucao: series.propria.cid || series.propria.conduta ? { conduta: { texto: series.propria.conduta ?? "" }, cid: series.propria.cid } : null,
        anamnese: series.propria.anamnese ? { status: "" } : null,
      });
    }
    return linhasHistorico(
      consultas.map((c) => ({
        id: c.id,
        ts: c.ts,
        status: rotuloStatusMedico(c),
        motivoConsulta: c.motivoConsulta,
        resumoMedico: c.resumoMedico,
        especialidade: c.especialidade,
      })),
      hist,
      cabecalho.nomeMedico,
    );
  }, [consultas, series, consultaRef, cabecalho.nomeMedico]);
  const linhasVisiveis = filtrarHistorico(
    linhas.filter((l) => (filtro === "todos" ? true : filtro === "outros" ? l.deOutroMedico : !l.deOutroMedico)),
    busca,
  );
  const meds = series ? medicamentosAtuais(series.medicamentos, agora) : [];

  const pressao = ultimas.get("pressao");
  const peso = ultimas.get("peso");
  const altura = ultimas.get("altura");
  const sinais: { rotulo: string; valor: string; unidade: string; quando: string }[] = [
    { rotulo: "Pressão", valor: pressao ? `${pressao.valor1}/${pressao.valor2 ?? "—"}` : "—", unidade: "mmHg", quando: pressao ? diaMes(pressao.criadoEm) : "" },
    {
      rotulo: "Peso",
      valor: peso ? `${peso.valor1}` : series?.perfil.peso != null ? `${series.perfil.peso}` : "—",
      unidade: "kg",
      quando: peso ? diaMes(peso.criadoEm) : series?.perfil.peso != null ? "cadastro" : "",
    },
    {
      rotulo: "Altura",
      valor: altura ? `${altura.valor1}` : series?.perfil.altura != null ? `${series.perfil.altura}` : "—",
      unidade: "cm",
      quando: altura ? diaMes(altura.criadoEm) : series?.perfil.altura != null ? "cadastro" : "",
    },
  ];
  const ultimoCid = linhas.find((l) => l.cid)?.cid ?? null;
  const legenda = legendaPaciente(cabecalho.idade, cabecalho.genero);

  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const botaoDoc = "bm2-botao-doc";
  const carregando = <p className="bm2-vazio" role="status">Carregando…</p>;

  return (
    <div className="bm-v2 bm2-ficha-corpo">
      {homonimo ? (
        <p className="bm2-aviso-homonimo" role="note">
          Você tem mais de um paciente com este nome. Documentos muito antigos podem aparecer para os dois — confira a data antes de usar.
        </p>
      ) : null}

      <div className="bm2-ficha-grade">
        {/* 1 — Cartão do paciente (degradê #BDD2EA → #DCECFE) */}
        <section className="bm2-ficha-paciente" aria-labelledby="bm2-ficha-titulo">
          <div className="bm2-ficha-paciente-topo">
            <h3 id="bm2-ficha-titulo" className="bm2-ficha-titulo">
              Ficha do
              <br />
              paciente
            </h3>
            <div className="bm2-ficha-redondos">
              <button type="button" className="bm2-redondo" onClick={() => onAba("conversa")} aria-label="Abrir conversa" title="Conversa">
                <MessageCircle className="w-4 h-4" aria-hidden />
              </button>
              <button type="button" className="bm2-redondo" onClick={() => onAba("triagem")} aria-label="Abrir triagem" title="Triagem">
                <ClipboardList className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="bm2-ficha-pessoa">
            <span className="bm2-ficha-avatar" aria-hidden>{iniciais(cabecalho.nome) || "?"}</span>
            <div className="bm2-ficha-nome">
              <strong>{cabecalho.nome}</strong>
              {legenda ? <span>{legenda}</span> : null}
            </div>
          </div>
          <dl className="bm2-ficha-campos">
            <div>
              <dt>{cabecalho.referencia?.rotulo ?? "Consulta"}</dt>
              <dd>{cabecalho.referencia?.quando || "—"}</dd>
            </div>
            <div>
              <dt>Motivo</dt>
              <dd className="bm2-ficha-motivo">{cabecalho.referencia?.motivo || "Não informado"}</dd>
            </div>
            <div>
              <dt>{ultimoCid ? "Último CID" : "Atendimento"}</dt>
              <dd>{ultimoCid ?? (cabecalho.referencia?.atendimento || "—")}</dd>
            </div>
          </dl>
          <dl className="bm2-ficha-sinais">
            {sinais.map((s) => (
              <div key={s.rotulo}>
                <dt>
                  {s.rotulo}
                  {s.quando ? <span className="bm2-ficha-quando"> · {s.quando}</span> : null}
                </dt>
                <dd>
                  <span className="bm2-ficha-valor">{s.valor}</span>
                  {s.valor !== "—" ? <span className="bm2-ficha-unidade"> {s.unidade}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 2 — Medicamentos em uso com anéis por dia */}
        <section className="bm2-cartao bm2-ficha-meds" aria-labelledby="bm2-meds-titulo">
          <div className="bm2-ficha-cab">
            <h3 id="bm2-meds-titulo" className="bm2-ficha-titulo">
              Medicamentos
              <br />
              em uso
            </h3>
            <div className="bm2-ficha-redondos">
              <button type="button" className="bm2-redondo" onClick={onEmitir} aria-label="Emitir receita ou documento" title="Emitir">
                <Plus className="w-4 h-4" aria-hidden />
              </button>
              <button type="button" className="bm2-redondo bm2-redondo-azul" onClick={() => irPara("bm2-relatorios")} aria-label="Ver receitas e documentos" title="Documentos">
                <ArrowUpRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
          {erroSeries ? (
            <p className="bm2-vazio">Não foi possível carregar os medicamentos agora.</p>
          ) : !series ? (
            consultaRef ? carregando : <p className="bm2-vazio">Sem consulta com você ainda.</p>
          ) : meds.length === 0 ? (
            <p className="bm2-vazio">Nenhum medicamento ativo na lista do paciente.</p>
          ) : (
            <ul className="bm2-ficha-meds-lista">
              {meds.map(({ m, p }) => {
                const freq = frequenciaPosologia(m.posologia) || m.via || "";
                return (
                  <li key={m.id} className="bm2-item bm2-ficha-med">
                    <div className="min-w-0 flex-1">
                      <div className="bm2-ficha-med-nome">
                        {m.nome}
                        {m.dose ? <span> · {m.dose}</span> : null}
                      </div>
                      <div className="bm2-ficha-med-info bm2-t-2">
                        <span>
                          Início – {fmtData(m.inicio)}
                          <br />
                          {p.tipo === "periodo" ? `Fim – ${dataCurta(p.fim)}` : p.tipo === "continuo" ? "Uso contínuo" : "Sem data de fim"}
                        </span>
                        {freq ? <span className="bm2-ficha-med-freq">{freq}</span> : null}
                      </div>
                    </div>
                    <AnelTratamento p={p} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3 — Histórico (consultas, evoluções e anamneses; outros profissionais com aviso) */}
        <section className="bm2-cartao bm2-ficha-historico" aria-labelledby="bm2-hist-titulo">
          <div className="bm2-ficha-cab bm2-ficha-cab-hist">
            <h3 id="bm2-hist-titulo" className="bm2-ficha-titulo">Histórico</h3>
            <div
              className="bm2-ficha-ferramentas"
              onKeyDown={(e) => {
                // Escape fecha só o menu aberto (filtro ou "+"), não a ficha.
                if (e.key === "Escape" && (filtroAberto || novoAberto)) {
                  e.preventDefault();
                  e.stopPropagation();
                  setFiltroAberto(false);
                  setNovoAberto(false);
                }
              }}
            >
              <label className="bm2-busca bm2-ficha-busca">
                <Search className="w-4 h-4 bm2-t-2" aria-hidden />
                <span className="sr-only">Buscar no histórico</span>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="bm2-busca-topo" />
              </label>
              <div className="relative">
                <button
                  type="button"
                  className={`bm2-redondo ${filtro !== "todos" ? "bm2-redondo-azul" : ""}`}
                  aria-label={`Filtrar histórico: ${filtro === "todos" ? "todos" : filtro === "comigo" ? "comigo" : "outros profissionais"}`}
                  aria-expanded={filtroAberto}
                  onClick={() => {
                    setNovoAberto(false);
                    setFiltroAberto((v) => !v);
                  }}
                >
                  <ListFilter className="w-4 h-4" aria-hidden />
                </button>
                {filtroAberto ? (
                  <div className="bm2-ficha-menu" role="group" aria-label="Filtro do histórico">
                    {(
                      [
                        ["todos", "Todos"],
                        ["comigo", "Comigo"],
                        ["outros", "Outros profissionais"],
                      ] as const
                    ).map(([id, r]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={filtro === id}
                        onClick={() => {
                          setFiltro(id);
                          setFiltroAberto(false);
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {/* "+" do histórico (ref. 17): abre as ações REAIS que geram
                  registro clínico do paciente — emitir documento e pedir
                  medição. Não existe "novo registro de histórico" avulso
                  (a evolução só é escrita na sala da consulta). */}
              <div className="relative">
                <button
                  type="button"
                  className="bm2-redondo bm2-redondo-azul"
                  aria-label="Novo registro para o paciente"
                  aria-expanded={novoAberto}
                  title="Novo registro"
                  onClick={() => {
                    setFiltroAberto(false);
                    setNovoAberto((v) => !v);
                  }}
                >
                  <Plus className="w-4 h-4" aria-hidden />
                </button>
                {novoAberto ? (
                  <div className="bm2-ficha-menu" role="group" aria-label="Novo registro">
                    <button
                      type="button"
                      onClick={() => {
                        setNovoAberto(false);
                        onEmitir();
                      }}
                    >
                      Emitir receita ou documento
                    </button>
                    {onPedirMedicao ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNovoAberto(false);
                          onPedirMedicao();
                        }}
                      >
                        Pedir medição ao paciente
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {erroSeries ? (
            <div className="bm2-ficha-erro">
              <p className="bm2-vazio">Não foi possível carregar o histórico com outros profissionais agora.</p>
              <button type="button" onClick={() => void carregarSeries()} className={botaoDoc}>
                Tentar de novo
              </button>
            </div>
          ) : null}
          <div className="bm2-ficha-tabela-rolagem">
            <table className="bm2-ficha-tabela">
              <caption className="sr-only">
                Consultas comigo ({consultas.length}) e histórico com outros profissionais ({outros.length})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">CID</th>
                  <th scope="col">Conduta / resumo</th>
                  <th scope="col">Profissional</th>
                  <th scope="col"><span className="sr-only">Detalhes</span></th>
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map((l) => {
                  const aberta = linhaAberta === l.id;
                  const item = series?.historico.find((h) => h.consultaId === l.id);
                  const minha = consultas.find((c) => c.id === l.id);
                  return (
                    <Fragment key={l.id}>
                      <tr
                        className={`bm2-ficha-linha ${aberta ? "bm2-ficha-linha-aberta" : ""}`}
                        onClick={(e) => {
                          // A linha inteira abre o detalhe (o botão da última
                          // coluna continua sendo o controle de teclado).
                          if ((e.target as HTMLElement).closest("button")) return;
                          setLinhaAberta(aberta ? null : l.id);
                        }}
                      >
                        <td data-rotulo="Data" className="whitespace-nowrap" title={l.status ?? undefined}>
                          {dataCurta(l.ts)}
                        </td>
                        <td data-rotulo="Motivo" title={l.motivo ?? l.especialidade}>
                          {l.deOutroMedico ? (
                            <>
                              {l.especialidade || "Consulta"}{" "}
                              <span className="bm2-ficha-selo" title="Consulta com outro profissional">
                                outro<span className="sr-only"> profissional</span>
                              </span>
                            </>
                          ) : (
                            <>
                              {l.status === "Cancelada" ? <span className="bm2-ficha-selo bm2-ficha-selo-cinza">cancelada</span> : null}
                              {l.motivo ?? "—"}
                            </>
                          )}
                        </td>
                        <td data-rotulo="CID" data-vazio={l.cid ? undefined : ""}>{l.cid ?? <span className="bm2-t-2">—</span>}</td>
                        <td data-rotulo="Conduta" data-vazio={l.conduta ? undefined : ""} className="bm2-ficha-conduta" title={l.conduta ?? undefined}>
                          {l.conduta ?? <span className="bm2-t-2">—</span>}
                        </td>
                        <td data-rotulo="Profissional" title={l.profissional}>{l.profissional}</td>
                        <td className="bm2-ficha-acao">
                          <button
                            type="button"
                            className="bm2-icone-linha"
                            aria-expanded={aberta}
                            aria-label={`${aberta ? "Fechar" : "Ver"} detalhes de ${dataCurta(l.ts)}`}
                            onClick={() => setLinhaAberta(aberta ? null : l.id)}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${aberta ? "rotate-180" : ""}`} aria-hidden />
                          </button>
                        </td>
                      </tr>
                      {aberta ? (
                        <tr className="bm2-ficha-detalhe">
                          <td colSpan={6}>
                            {l.status ? (
                              <p className="text-[13px] mb-1.5">
                                <span className="bm2-t-2">Situação: </span>
                                {l.status}
                              </p>
                            ) : null}
                            {minha?.resumoMedico ? (
                              <p className="text-sm whitespace-pre-line mb-2">
                                <span className="bm2-t-2">Resumo: </span>
                                {minha.resumoMedico}
                              </p>
                            ) : null}
                            {item ? (
                              <CartaoHistoricoClinico item={item} />
                            ) : !minha?.resumoMedico ? (
                              <p className="bm2-vazio">Sem anamnese ou evolução concluída nesta consulta.</p>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {linhasVisiveis.length === 0 ? (
              <p className="bm2-vazio">
                {!series && consultaRef && !erroSeries
                  ? "Carregando histórico…"
                  : busca || filtro !== "todos"
                    ? "Nada encontrado com esse filtro."
                    : filtro === "todos" && outros.length === 0
                      ? "Ainda não há consultas deste paciente com outros profissionais na BION."
                      : "Sem consultas."}
              </p>
            ) : null}
            {!consultaRef ? (
              <p className="bm2-vazio">Sem consulta com você ainda — o histórico de outros profissionais aparece quando houver vínculo assistencial.</p>
            ) : null}
          </div>
          {/* Aviso de consentimento: discreto, fixo no rodapé do cartão
              (sempre visível, mesmo com a tabela rolada), com AA. */}
          {series ? (
            <div className="bm2-ficha-consentimento">
              <AvisoConsentimentoHistorico />
            </div>
          ) : null}
        </section>

        {/* 4 — Exames, documentos e arquivos (lavanda) */}
        <section id="bm2-relatorios" className="bm2-ficha-relatorios" aria-labelledby="bm2-rel-titulo">
          <div className="bm2-ficha-cab">
            <h3 id="bm2-rel-titulo" className="bm2-ficha-titulo">
              Exames e
              <br />
              documentos
            </h3>
            <button type="button" className="bm2-redondo bm2-redondo-preto" onClick={onEmitir} aria-label="Emitir documento" title="Emitir">
              <Plus className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <div className="bm2-ficha-rel-rolagem">
            <h4 className="bm2-ficha-subtitulo">Exames laboratoriais {series ? `(${series.exames.length})` : ""}</h4>
            {erroSeries ? (
              <p className="bm2-vazio">Não foi possível carregar os exames agora (use o “Tentar de novo” no histórico).</p>
            ) : !series ? (
              consultaRef ? carregando : <p className="bm2-vazio">Sem consulta com você ainda.</p>
            ) : series.exames.length === 0 ? (
              <p className="bm2-vazio">Nenhum exame laboratorial registrado.</p>
            ) : (
              <ul>
                {series.exames.map((e) => {
                  const s = situacaoExame(e.itens);
                  const aberto = relAberto === `e-${e.id}`;
                  return (
                    <li key={e.id} className="bm2-ficha-rel">
                      <div className="bm2-ficha-rel-linha">
                        <div className="min-w-0">
                          <div className="bm2-ficha-rel-nome">{e.titulo}</div>
                          <div className="bm2-ficha-rel-sub">
                            {fmtData(e.dataColeta)} · <span className={s.tom === "alterado" ? "bm2-ficha-alterado" : undefined}>{s.texto}</span>
                          </div>
                        </div>
                        <BotaoExpandir aberto={aberto} rotulo={e.titulo} onClick={() => setRelAberto(aberto ? null : `e-${e.id}`)} />
                      </div>
                      {aberto ? (
                        e.itens.length === 0 ? (
                          <p className="bm2-vazio">Sem itens estruturados.</p>
                        ) : (
                          <ul className="bm2-ficha-rel-itens">
                            {e.itens.map((it, i) => {
                              const fora = foraDaFaixaSerie(it);
                              return (
                                <li key={i}>
                                  <span className="min-w-0 truncate">{it.nome}</span>
                                  <span className={fora ? "bm2-ficha-alterado font-semibold" : "font-medium"}>
                                    {it.valor} {it.unidade ?? ""}
                                    {typeof it.refMin === "number" || typeof it.refMax === "number" ? (
                                      <span className="bm2-ficha-rel-ref"> (ref {it.refMin ?? "—"}–{it.refMax ?? "—"})</span>
                                    ) : null}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <h4 className="bm2-ficha-subtitulo">Documentos emitidos ({documentos.length})</h4>
            {documentos.length === 0 ? (
              <p className="bm2-vazio">Nenhum documento emitido para este paciente.</p>
            ) : (
              <ul>
                {/* Item 25: itens de uma mesma emissão agrupada (receita com
                    vários medicamentos) aparecem como UMA receita, com a via
                    combinada; PDF e renovação por item seguem acessíveis. */}
                {agruparEmissoes(docs).map((entrada) => {
                  const d0 = entrada.docs[0];
                  const aberto = relAberto === `d-${entrada.chave}`;
                  return (
                    <li key={entrada.chave} className="bm2-ficha-rel">
                      <div className="bm2-ficha-rel-linha">
                        <div className="min-w-0">
                          <div className="bm2-ficha-rel-nome">
                            {d0.titulo}
                            {entrada.docs.length === 1 ? <SeloCancelado d={d0} /> : null}
                          </div>
                          <div className="bm2-ficha-rel-sub">
                            {d0.criadoEm ? fmtData(d0.criadoEm) : d0.data} · {ROTULO_DOC[d0.tipo]}
                            {entrada.docs.length > 1 ? ` · ${entrada.docs.length} medicamentos` : ""}
                          </div>
                        </div>
                        <BotaoExpandir aberto={aberto} rotulo={d0.titulo} onClick={() => setRelAberto(aberto ? null : `d-${entrada.chave}`)} />
                      </div>
                      {aberto ? (
                        <div className="bm2-ficha-rel-detalhe">
                          <div className="bm2-ficha-emissor">
                            <span className="bm2-ficha-emissor-avatar" aria-hidden>{iniciais(d0.medico || "M")}</span>
                            <span className="min-w-0 truncate">{rotuloEmissor(d0, medicoIdAtual)}</span>
                          </div>
                          {entrada.docs.length > 1 ? (
                            <>
                              {entrada.docs.map((d) => (
                                <div key={d.id} className="bm2-ficha-doc-item">
                                  <span className="text-[13px] min-w-0">
                                    {d.medicamento} — {d.posologia}
                                    <SeloCancelado d={d} />
                                  </span>
                                  <div className="bm2-ficha-doc-acoes">
                                    <button type="button" onClick={() => baixar(d)} className={botaoDoc}>
                                      <Download className="w-3.5 h-3.5" aria-hidden /> PDF
                                    </button>
                                    {!documentoCancelado(d) && documentoEmitidoPor(d, medicoIdAtual) ? (
                                      <button type="button" onClick={() => onRenovar(d)} className={botaoDoc}>
                                        <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Renovar
                                      </button>
                                    ) : null}
                                    {botaoCancelar(d)}
                                  </div>
                                </div>
                              ))}
                              <button type="button" onClick={() => gerarReceitaCombinadaPDF(entrada.docs)} className={`${botaoDoc} bm2-botao-doc-preto`}>
                                <Download className="w-3.5 h-3.5" aria-hidden /> PDF combinado
                              </button>
                            </>
                          ) : (
                            <>
                              {d0.medicamento ? <p className="text-[13px]">{d0.medicamento} — {d0.posologia}</p> : null}
                              <div className="bm2-ficha-doc-acoes">
                                {entrada.docs[0].tipo !== "exame_solicitado" ? (
                                  <button type="button" onClick={() => baixar(entrada.docs[0])} className={`${botaoDoc} bm2-botao-doc-preto`}>
                                    <Download className="w-3.5 h-3.5" aria-hidden /> PDF
                                  </button>
                                ) : null}
                                {entrada.docs[0].tipo === "receita" && !documentoCancelado(entrada.docs[0]) && documentoEmitidoPor(entrada.docs[0], medicoIdAtual) ? (
                                  <button type="button" onClick={() => onRenovar(entrada.docs[0])} className={botaoDoc}>
                                    <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Renovar
                                  </button>
                                ) : null}
                                {botaoCancelar(entrada.docs[0])}
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <h4 className="bm2-ficha-subtitulo">Arquivos ({arquivos.length})</h4>
            {arquivos.length === 0 ? (
              <p className="bm2-vazio">Nenhum arquivo deste paciente.</p>
            ) : (
              <ul>
                {arquivos.map((a) => (
                  <li key={a.id} className="bm2-ficha-rel">
                    <div className="bm2-ficha-rel-linha">
                      <div className="min-w-0">
                        <div className="bm2-ficha-rel-nome truncate">{a.nome}</div>
                        <div className="bm2-ficha-rel-sub">
                          {a.data} · {a.tipo} · {a.tamanhoKb} KB · {a.enviadoPor === "medico" ? "médico" : "paciente"}
                        </div>
                      </div>
                      {a.storagePath ? (
                        <button type="button" onClick={() => void baixarArquivo(a)} aria-label={`Baixar ${a.nome}`} className="bm2-icone-linha">
                          <Download className="w-4 h-4" aria-hidden />
                        </button>
                      ) : (
                        <span className="bm2-ficha-rel-sub shrink-0">Só metadados</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 5 — Medições (série completa) */}
      <section className="bm2-cartao bm2-ficha-medicoes" aria-labelledby="bm2-medicoes-titulo">
        <h3 id="bm2-medicoes-titulo" className="bm2-ficha-titulo">Medições {series ? `(${series.medicoes.length})` : ""}</h3>
        {erroSeries ? (
          <p className="bm2-vazio">Não foi possível carregar as medições agora.</p>
        ) : !series ? (
          consultaRef ? <p className="bm2-vazio" role="status">Carregando medições e exames…</p> : <p className="bm2-vazio">Sem consulta com você ainda.</p>
        ) : series.medicoes.length === 0 ? (
          <p className="bm2-vazio">Nenhuma medição registrada para este paciente.</p>
        ) : (
          <>
            <div className="bm2-ficha-ultimas">
              {[...ultimasPorTipo.values()].map((m) => (
                <span key={m.tipo} className="bm2-ficha-chip">
                  {ROTULO_MEDICAO[m.tipo]?.rotulo ?? m.tipo}: {valorMedicao(m)}
                </span>
              ))}
            </div>
            <ul className="bm2-ficha-medicoes-lista">
              {series.medicoes.slice(0, 10).map((m) => (
                <li key={m.id} className="bm2-item">
                  <span className="font-medium">
                    {ROTULO_MEDICAO[m.tipo]?.rotulo ?? m.tipo} · {valorMedicao(m)}
                  </span>
                  <span className="bm2-t-2 text-[12px] shrink-0">
                    {fmtDataHora(m.criadoEm)}
                    {m.origem === "pedido" ? " · via pedido" : ""}
                  </span>
                </li>
              ))}
            </ul>
            {series.medicoes.length > 10 ? <p className="bm2-vazio">Mostrando as 10 mais recentes de {series.medicoes.length}.</p> : null}
          </>
        )}
      </section>
    </div>
  );
}

function BotaoExpandir({ aberto, rotulo, onClick }: { aberto: boolean; rotulo: string; onClick: () => void }) {
  return (
    <button type="button" className="bm2-icone-linha" aria-expanded={aberto} aria-label={`${aberto ? "Fechar" : "Abrir"} ${rotulo}`} onClick={onClick}>
      {aberto ? <X className="w-4 h-4" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />}
    </button>
  );
}
