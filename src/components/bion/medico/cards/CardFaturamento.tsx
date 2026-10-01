"use client";

import { TrendingUp } from "lucide-react";
import { fmtBRL, type PontoFaturamento } from "../metricas";

/**
 * Faturamento bruto dos últimos 30 dias — barras SVG leves (sem
 * dependência) + tabela equivalente só para leitores de tela.
 */
export function CardFaturamento({
  pontos,
  total,
  qtd,
}: {
  pontos: PontoFaturamento[];
  total: number;
  qtd: number;
}) {
  const max = Math.max(...pontos.map((p) => p.valor), 0);
  const W = 300;
  const H = 96;
  const larg = W / Math.max(pontos.length, 1);
  const comValor = pontos.filter((p) => p.valor > 0);

  return (
    <div className="bp-glass p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> Faturamento · 30 dias
        </span>
      </div>
      <div className="mt-2 text-3xl font-black tabular-nums">{fmtBRL(total)}</div>
      <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
        {qtd === 0 ? "Nenhuma consulta paga no período." : `${qtd} ${qtd === 1 ? "consulta paga" : "consultas pagas"}`}
      </div>

      {max > 0 ? (
        <svg
          viewBox={`0 0 ${W} ${H + 16}`}
          className="bm-grafico w-full mt-3 text-bion-sea dark:text-sky-300"
          role="img"
          aria-label={`Faturamento por dia nos últimos 30 dias, total ${fmtBRL(total)}`}
        >
          <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
          {pontos.map((p, i) => {
            const h = p.valor > 0 ? Math.max(3, (p.valor / max) * (H - 6)) : 0;
            return (
              <rect
                key={p.iso}
                x={i * larg + larg * 0.18}
                y={H - h}
                width={larg * 0.64}
                height={h}
                rx={2}
                fill="currentColor"
              >
                <title>{`${p.rotulo}: ${fmtBRL(p.valor)}`}</title>
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
          <caption>Faturamento por dia</caption>
          <tbody>
            {comValor.map((p) => (
              <tr key={p.iso}>
                <th scope="row">{p.rotulo}</th>
                <td>{fmtBRL(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <p className="mt-2 text-xs text-bion-ink/70 dark:text-bion-paper/70">
        Valor bruto pago pelos pacientes, pela data da consulta (sem taxas e estornos).
      </p>
    </div>
  );
}
