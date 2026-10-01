"use client";

import { RefreshCw, TrendingUp } from "lucide-react";
import { fmtCentavos, type PontoReceita, type ReceitaDia } from "../metricas";

/**
 * Receita LÍQUIDA dos últimos 30 dias (GET /api/medico/receita): valor das
 * consultas − comissão de 10% do app − taxa do gateway, mais a parte do
 * médico nas multas pagas pelo paciente. Barras SVG leves (sem dependência)
 * + tabela equivalente só para leitores de tela.
 */
export function CardFaturamento({
  pontos,
  totais,
  carregando,
  erro,
  recarregar,
}: {
  pontos: PontoReceita[];
  totais: Omit<ReceitaDia, "dia"> | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}) {
  const max = Math.max(...pontos.map((p) => p.centavos), 0);
  const W = 300;
  const H = 96;
  const larg = W / Math.max(pontos.length, 1);
  const comValor = pontos.filter((p) => p.centavos > 0);
  const total = totais?.totalCentavos ?? 0;
  const qtd = totais?.consultas ?? 0;

  return (
    <div className="bp-glass p-5" aria-busy={carregando}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> Receita líquida · 30 dias
        </span>
      </div>

      {!totais && carregando ? (
        <div className="mt-2" role="status">
          <div className="h-9 w-40 rounded-lg bg-bion-ink/10 dark:bg-white/10 motion-safe:animate-pulse" aria-hidden />
          <span className="sr-only">Carregando receita…</span>
        </div>
      ) : !totais && erro ? (
        <div className="mt-2" role="alert">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{erro}</p>
          <button
            type="button"
            onClick={recarregar}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-bion-sea dark:text-sky-300 underline underline-offset-2"
          >
            <RefreshCw className="w-4 h-4" aria-hidden /> Tentar de novo
          </button>
        </div>
      ) : totais ? (
        <>
          <div className="mt-2 text-3xl font-black tabular-nums">{fmtCentavos(total)}</div>
          <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
            {qtd === 0 ? "Nenhuma consulta paga realizada no período." : `${qtd} ${qtd === 1 ? "consulta" : "consultas"}`}
            {totais.multasMedicoCentavos > 0 ? ` · inclui ${fmtCentavos(totais.multasMedicoCentavos)} de multas (sua parte)` : ""}
          </div>
          {totais.brutoCentavos > 0 ? (
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-bion-ink/75 dark:text-bion-paper/75">
              <div>
                <dt>Bruto</dt>
                <dd className="font-bold tabular-nums text-bion-ink dark:text-bion-paper">{fmtCentavos(totais.brutoCentavos)}</dd>
              </div>
              <div>
                <dt>Comissão (10%)</dt>
                <dd className="font-bold tabular-nums text-bion-ink dark:text-bion-paper">−{fmtCentavos(totais.comissaoCentavos)}</dd>
              </div>
              <div>
                <dt>Taxa do gateway</dt>
                <dd className="font-bold tabular-nums text-bion-ink dark:text-bion-paper">−{fmtCentavos(totais.taxaCentavos)}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : null}

      {max > 0 ? (
        <svg
          viewBox={`0 0 ${W} ${H + 16}`}
          className="bm-grafico w-full mt-3 text-bion-sea dark:text-sky-300"
          role="img"
          aria-label={`Receita líquida por dia nos últimos 30 dias, total ${fmtCentavos(total)}`}
        >
          <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
          {pontos.map((p, i) => {
            const h = p.centavos > 0 ? Math.max(3, (p.centavos / max) * (H - 6)) : 0;
            return (
              <rect key={p.iso} x={i * larg + larg * 0.18} y={H - h} width={larg * 0.64} height={h} rx={2} fill="currentColor">
                <title>{`${p.rotulo}: ${fmtCentavos(p.centavos)}`}</title>
              </rect>
            );
          })}
          <text x="0" y={H + 13} fontSize="10" fill="currentColor">
            {pontos[0]?.rotulo}
          </text>
          <text x={W} y={H + 13} fontSize="10" fill="currentColor" textAnchor="end">
            hoje
          </text>
        </svg>
      ) : null}

      {comValor.length ? (
        <table className="sr-only">
          <caption>Receita líquida por dia</caption>
          <tbody>
            {comValor.map((p) => (
              <tr key={p.iso}>
                <th scope="row">{p.rotulo}</th>
                <td>{fmtCentavos(p.centavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {totais && erro ? (
        <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300" role="status">
          Não foi possível atualizar agora; mostrando o último valor carregado.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-bion-ink/70 dark:text-bion-paper/70">
        Receita líquida após comissão de 10% e taxa do gateway, pela data da consulta. Consultas canceladas, aguardando
        reagendamento ou reembolsadas integralmente não contam; multas pagas pelo paciente entram com a sua parte (50%).
      </p>
    </div>
  );
}
