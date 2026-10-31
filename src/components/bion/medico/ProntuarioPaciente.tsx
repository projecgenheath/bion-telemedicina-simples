"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Arquivo, Consulta, Documento } from "@/lib/bion-store";
import { gerarDocumentoPDF, gerarReceitaCombinadaPDF } from "@/lib/receita-pdf";
import { agruparEmissoes } from "@/lib/documentos-agrupados";
import { rotuloStatusMedico } from "./metricas";

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

/**
 * Histórico do paciente COMIGO: consultas (com resumo), documentos e arquivos.
 * Documentos vêm do store filtrados pelo IDENTIFICADOR do paciente (M-9:
 * o wire agora traz pacienteId); o aviso de homônimo cobre apenas
 * documentos legados gravados antes do identificador existir.
 */
export function ProntuarioPaciente({
  consultas,
  documentos,
  arquivos,
  homonimo,
  onRenovar,
}: {
  consultas: Consulta[];
  documentos: Documento[];
  arquivos: Arquivo[];
  homonimo: boolean;
  onRenovar: (d: Documento) => void;
}) {
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
  const [series, setSeries] = useState<{ medicoes: MedicaoSerie[]; exames: ExameSerie[] } | null>(null);
  const [erroSeries, setErroSeries] = useState(false);
  const carregarSeries = useCallback(async () => {
    if (!consultaRef) return;
    try {
      const res = await fetch(`/api/medico/consultas/${encodeURIComponent(consultaRef)}/evolucao`, { credentials: "include" });
      if (!res.ok) throw new Error("evolucao");
      const j = (await res.json()) as { medicoes?: MedicaoSerie[]; exames?: { id: string; titulo: string; dataColeta: string; itens: unknown; origem: string }[] };
      setSeries({
        medicoes: j.medicoes ?? [],
        exames: (j.exames ?? []).map((e) => ({ ...e, itens: itensValidosSerie(e.itens) })),
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

  const tituloSecao = "text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 mb-2";

  return (
    <div className="p-5 space-y-6">
      {homonimo ? (
        <p className="rounded-2xl p-3 text-sm bg-amber-500/15 text-amber-900 dark:text-amber-100" role="note">
          Você tem mais de um paciente com este nome. Documentos muito antigos podem aparecer para os dois — confira a data antes de usar.
        </p>
      ) : null}

      <section>
        <h3 className={tituloSecao}>Consultas comigo ({consultas.length})</h3>
        <ul className="space-y-2">
          {consultas.map((c) => (
            <li key={c.id} className="bp-glass p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">
                  {c.data} às {c.hora}
                </span>
                <span className="text-xs font-bold">{rotuloStatusMedico(c)}</span>
              </div>
              {c.motivoConsulta ? <p className="text-sm mt-1">Motivo: {c.motivoConsulta}</p> : null}
              {c.resumoMedico ? (
                <p className="text-sm mt-1 whitespace-pre-line text-bion-ink/85 dark:text-bion-paper/85">{c.resumoMedico}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className={tituloSecao}>Documentos emitidos ({documentos.length})</h3>
        {documentos.length === 0 ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum documento emitido para este paciente.</p>
        ) : (
          <ul className="space-y-2">
            {/* Item 25: itens de uma mesma emissão agrupada (receita com
                vários medicamentos) aparecem como UMA receita, com a via
                combinada; PDF e renovação por item seguem acessíveis. */}
            {agruparEmissoes(documentos).map((entrada) =>
              entrada.docs.length > 1 ? (
                <li key={entrada.chave} className="bp-glass p-3.5">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{entrada.docs[0].titulo}</div>
                      <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
                        {ROTULO_DOC[entrada.docs[0].tipo]} · {entrada.docs[0].data} · {entrada.docs[0].medico} ·{" "}
                        {entrada.docs.length} medicamentos
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {entrada.docs.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 pl-7">
                        <span className="text-sm min-w-0 flex-1 truncate">
                          {d.medicamento} — {d.posologia}
                        </span>
                        <button type="button" onClick={() => baixar(d)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1 shrink-0">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                        <button type="button" onClick={() => onRenovar(d)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1 shrink-0">
                          <RefreshCw className="w-3.5 h-3.5" /> Renovar
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <button type="button" onClick={() => gerarReceitaCombinadaPDF(entrada.docs)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" /> PDF combinado
                    </button>
                  </div>
                </li>
              ) : (
                <li key={entrada.chave} className="bp-glass p-3.5">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{entrada.docs[0].titulo}</div>
                      <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
                        {ROTULO_DOC[entrada.docs[0].tipo]} · {entrada.docs[0].data} · {entrada.docs[0].medico}
                      </div>
                      {entrada.docs[0].medicamento ? <div className="text-sm mt-1">{entrada.docs[0].medicamento} — {entrada.docs[0].posologia}</div> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {entrada.docs[0].tipo !== "exame_solicitado" ? (
                      <button type="button" onClick={() => baixar(entrada.docs[0])} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    ) : null}
                    {entrada.docs[0].tipo === "receita" ? (
                      <button type="button" onClick={() => onRenovar(entrada.docs[0])} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5" /> Renovar
                      </button>
                    ) : null}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section>
        <h3 className={tituloSecao}>Arquivos ({arquivos.length})</h3>
        {arquivos.length === 0 ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum arquivo deste paciente.</p>
        ) : (
          <ul className="space-y-2">
            {arquivos.map((a) => (
              <li key={a.id} className="bp-glass p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{a.nome}</div>
                  <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
                    {a.tipo} · {a.tamanhoKb} KB · enviado por {a.enviadoPor === "medico" ? "médico" : "paciente"} · {a.data}
                  </div>
                </div>
                {a.storagePath ? (
                  <button
                    type="button"
                    onClick={() => void baixarArquivo(a)}
                    aria-label={`Baixar ${a.nome}`}
                    className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" /> Baixar
                  </button>
                ) : (
                  <span className="text-[11px] text-bion-ink/70 dark:text-bion-paper/70 shrink-0">Só metadados</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={tituloSecao}>Medições {series ? `(${series.medicoes.length})` : ""}</h3>
        {erroSeries ? (
          <div className="bp-glass p-3.5 flex items-center justify-between gap-3">
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Não foi possível carregar as medições agora.</p>
            <button
              type="button"
              onClick={() => void carregarSeries()}
              className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 shrink-0"
            >
              Tentar de novo
            </button>
          </div>
        ) : !series ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75" role="status">Carregando medições e exames…</p>
        ) : series.medicoes.length === 0 ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhuma medição registrada para este paciente.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[...ultimasPorTipo.values()].map((m) => (
                <span key={m.tipo} className="text-xs font-bold rounded-full px-2.5 py-1 bg-bion-sea/15 text-bion-sea dark:text-sky-300">
                  {ROTULO_MEDICAO[m.tipo]?.rotulo ?? m.tipo}: {valorMedicao(m)}
                </span>
              ))}
            </div>
            <ul className="space-y-1.5">
              {series.medicoes.slice(0, 10).map((m) => (
                <li key={m.id} className="bp-glass px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">
                    {ROTULO_MEDICAO[m.tipo]?.rotulo ?? m.tipo} · {valorMedicao(m)}
                  </span>
                  <span className="text-[11px] text-bion-ink/70 dark:text-bion-paper/70 shrink-0">
                    {fmtDataHora(m.criadoEm)}{m.origem === "pedido" ? " · via pedido" : ""}
                  </span>
                </li>
              ))}
            </ul>
            {series.medicoes.length > 10 ? (
              <p className="text-[11px] text-bion-ink/70 dark:text-bion-paper/70 mt-1.5">Mostrando as 10 mais recentes de {series.medicoes.length}.</p>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h3 className={tituloSecao}>Exames laboratoriais {series ? `(${series.exames.length})` : ""}</h3>
        {erroSeries ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Não foi possível carregar os exames agora (use o “Tentar de novo” acima).</p>
        ) : !series ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75" role="status">Carregando…</p>
        ) : series.exames.length === 0 ? (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum exame laboratorial registrado para este paciente.</p>
        ) : (
          <ul className="space-y-2">
            {series.exames.map((e) => (
              <li key={e.id} className="bp-glass p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{e.titulo}</span>
                  <span className="text-[11px] text-bion-ink/70 dark:text-bion-paper/70 shrink-0">Coleta: {fmtData(e.dataColeta)}</span>
                </div>
                {e.itens.length === 0 ? (
                  <p className="text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-1">Sem itens estruturados.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {e.itens.map((it, i) => {
                      const fora = foraDaFaixaSerie(it);
                      return (
                        <li key={i} className="text-sm flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate">{it.nome}</span>
                          <span className={`shrink-0 ${fora ? "font-bold text-red-700 dark:text-red-400" : "font-semibold"}`}>
                            {it.valor} {it.unidade ?? ""}
                            {typeof it.refMin === "number" || typeof it.refMax === "number" ? (
                              <span className="text-[11px] font-normal text-bion-ink/70 dark:text-bion-paper/70">
                                {" "}(ref {it.refMin ?? "—"}–{it.refMax ?? "—"})
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
