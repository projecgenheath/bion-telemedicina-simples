"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { ROTULOS_ANAMNESE } from "@/components/bion/consulta/rotulos-anamnese";
import { ehCampoInternoColeta, rotuloCampoColeta, textoValorColeta } from "./triagem-valor";
import {
  AVISO_CONSENTIMENTO_HISTORICO,
  coletaAnamnese,
  temColeta,
  type ItemHistoricoClinico,
} from "./historico-outros";

const fmtData = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

function rotuloStatusAnamnese(status: string): string {
  if (status === "concluida") return "Concluída";
  if (status === "em_andamento") return "Em andamento";
  return status || "—";
}

/** Aviso de consentimento do paciente + registro na Auditoria (somente leitura). */
export function AvisoConsentimentoHistorico() {
  return (
    <p className="text-xs text-bion-ink/75 dark:text-bion-paper/75 flex items-start gap-1.5" role="note">
      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <span>{AVISO_CONSENTIMENTO_HISTORICO}</span>
    </p>
  );
}

function ColetaLeitura({ coleta }: { coleta: ReturnType<typeof coletaAnamnese> }) {
  const etapas = Object.entries(coleta);
  if (!temColeta(coleta)) {
    return <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mt-1">Anamnese sem dados coletados.</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      {etapas.map(([etapa, campos]) => {
        const linhas = Object.entries(campos)
          .filter(([campo]) => !ehCampoInternoColeta(campo))
          .map(([campo, v]) => ({ campo, texto: textoValorColeta(v) }))
          .filter((l) => l.texto !== "");
        if (!linhas.length) return null;
        return (
          <section key={etapa}>
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
              {ROTULOS_ANAMNESE[etapa] ?? etapa}
            </h5>
            <dl className="mt-0.5 space-y-0.5 text-sm">
              {linhas.map(({ campo, texto }) => (
                <div key={campo}>
                  <dt className="inline text-bion-ink/75 dark:text-bion-paper/75">{rotuloCampoColeta(campo)}: </dt>
                  <dd className="inline">{texto}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Cartão somente leitura de uma consulta anterior (própria ou de outro
 * médico): anamnese com coleta e evolução concluída.
 */
export function CartaoHistoricoClinico({
  item,
  acao,
}: {
  item: ItemHistoricoClinico;
  acao?: ReactNode;
}) {
  const coleta = coletaAnamnese(item.anamnese?.coleta);
  const conduta = item.evolucao?.conduta?.texto?.trim() ?? "";
  return (
    <article className="bp-glass p-3.5 space-y-1.5">
      <header>
        <div className="text-sm font-bold">
          {fmtData(item.dataInicio)}
          {item.especialidade ? ` · ${item.especialidade}` : ""}
        </div>
        <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
          {item.medico || "Médico"}
          {item.deOutroMedico ? " (outro médico)" : ""}
          {" · anamnese "}
          {rotuloStatusAnamnese(item.anamnese?.status ?? "")}
        </div>
      </header>
      {item.anamnese ? <ColetaLeitura coleta={coleta} /> : <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Sem anamnese nesta consulta.</p>}
      {conduta || item.evolucao?.cid ? (
        <div className="text-sm whitespace-pre-wrap pt-1">
          {conduta}
          {item.evolucao?.cid ? <span className="text-xs text-bion-ink/75 dark:text-bion-paper/75">{conduta ? " · " : ""}CID {item.evolucao.cid}</span> : null}
        </div>
      ) : null}
      {acao}
    </article>
  );
}
