"use client";

import { Download, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Arquivo, Consulta, Documento } from "@/lib/bion-store";
import { gerarDocumentoPDF } from "@/lib/receita-pdf";
import { rotuloStatusMedico } from "./metricas";
import { EmBreve } from "./sheets/SheetMedico";

const ROTULO_DOC: Record<Documento["tipo"], string> = {
  receita: "Receita",
  atestado: "Atestado",
  exame_solicitado: "Exame solicitado",
};

/**
 * Histórico do paciente COMIGO: consultas (com resumo), documentos e arquivos.
 * Documentos vêm do store filtrados pelo nome (o wire ainda não traz
 * pacienteId) — por isso o aviso de homônimo.
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
          Você tem mais de um paciente com este nome. Os documentos abaixo podem misturar os dois — confira a data antes de usar.
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
            {documentos.map((d) => (
              <li key={d.id} className="bp-glass p-3.5">
                <div className="flex items-start gap-3">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{d.titulo}</div>
                    <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
                      {ROTULO_DOC[d.tipo]} · {d.data} · {d.medico}
                    </div>
                    {d.medicamento ? <div className="text-sm mt-1">{d.medicamento} — {d.posologia}</div> : null}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  {d.tipo !== "exame_solicitado" ? (
                    <button type="button" onClick={() => baixar(d)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                  ) : null}
                  {d.tipo === "receita" ? (
                    <button type="button" onClick={() => onRenovar(d)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5" /> Renovar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
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

      <section className="bp-glass p-4 flex items-center justify-between gap-3">
        <span className="text-sm">Anamneses com outros profissionais (exige consentimento do paciente)</span>
        <EmBreve />
      </section>
    </div>
  );
}
