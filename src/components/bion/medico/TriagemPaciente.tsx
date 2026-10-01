"use client";

import { FileText } from "lucide-react";
import type { AnamneseResumo, Consulta } from "@/lib/bion-store";
import { ROTULOS_ANAMNESE } from "@/components/bion/consulta/rotulos-anamnese";

const temValor = (v: unknown) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

/** Uma anamnese (BION IA) — mesma leitura de `coleta` do PainelLateral. */
export function BlocoAnamnese({ a, consulta }: { a: AnamneseResumo; consulta?: Consulta }) {
  const etapas = Object.entries(a.coleta);
  return (
    <article className="bp-glass p-4 space-y-3">
      <header className="flex flex-col items-start gap-1.5">
        <div>
          <div className="text-sm font-black">Anamnese · BION IA</div>
          <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
            {consulta ? `Consulta de ${consulta.data} às ${consulta.hora}` : "Consulta"} · atualizada {a.atualizadaEm.toLowerCase()}
          </div>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-1 rounded-full ${
            a.status === "concluida"
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
          }`}
        >
          {a.status === "concluida" ? "Concluída" : `Em andamento · ${ROTULOS_ANAMNESE[a.etapa] ?? a.etapa}`}
        </span>
      </header>

      {a.documentos.map((d, i) => (
        <div key={`${d.nome}-${i}`} className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-bold">{d.nome}</span>
            <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75">
              {d.exameImportado ? `Laudo importado${d.resumo ? ` — ${d.resumo}` : ""}` : "Documento anexado na anamnese"}
            </span>
          </span>
        </div>
      ))}

      {etapas.length === 0 ? (
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
          Ainda sem dados coletados — aparecem aqui conforme o paciente conversa com a BION IA.
        </p>
      ) : (
        etapas.map(([etapa, campos]) => {
          const linhas = Object.entries(campos).filter(([, v]) => temValor(v));
          if (!linhas.length) return null;
          return (
            <section key={etapa}>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
                {ROTULOS_ANAMNESE[etapa] ?? etapa}
              </h4>
              <dl className="mt-1 space-y-0.5 text-sm">
                {linhas.map(([campo, v]) => (
                  <div key={campo}>
                    <dt className="inline text-bion-ink/75 dark:text-bion-paper/75">{campo.replace(/_/g, " ")}: </dt>
                    <dd className="inline">{Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })
      )}
    </article>
  );
}

/** Triagem: anamneses das consultas DESTE paciente comigo (mais recente primeiro). */
export function TriagemPaciente({ anamneses, consultas }: { anamneses: AnamneseResumo[]; consultas: Consulta[] }) {
  const porId = new Map(consultas.map((c) => [c.id, c]));
  const minhas = anamneses.filter((a) => porId.has(a.consultaId)).sort((a, b) => b.ts - a.ts);
  if (!minhas.length) {
    return (
      <div className="p-5">
        <div className="bp-glass p-5 text-sm text-bion-ink/75 dark:text-bion-paper/75">
          Este paciente ainda não iniciou a triagem com a BION IA para as consultas com você.
        </div>
      </div>
    );
  }
  return (
    <div className="p-5 space-y-3">
      {minhas.map((a) => (
        <BlocoAnamnese key={a.id} a={a} consulta={porId.get(a.consultaId)} />
      ))}
    </div>
  );
}
