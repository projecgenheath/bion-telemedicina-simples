"use client";

/**
 * Gráfico de linha leve (SVG puro, sem dependências) usado nos cards e
 * detalhes do app do paciente. Suporta múltiplas séries e faixa de referência.
 */

export type PontoGrafico = { valor: number; rotulo: string };

export type SerieGrafico = {
  pontos: PontoGrafico[];
  cor: string;
  area?: boolean;
};

type Props = {
  series: SerieGrafico[];
  refMin?: number;
  refMax?: number;
  altura?: number;
  corEixo?: string;
  ariaLabel: string;
};

export function GraficoLinha({ series, refMin, refMax, altura = 132, corEixo = "rgba(10,31,68,0.35)", ariaLabel }: Props & { ariaLabel: string }) {
  const W = 320;
  const H = altura;
  const padX = 8;
  const padTop = 12;
  const padBottom = 20;

  const valores = series.flatMap((s) => s.pontos.map((p) => p.valor));
  const refs = [refMin, refMax].filter((v): v is number => typeof v === "number");
  let min = Math.min(...valores, ...refs);
  let max = Math.max(...valores, ...refs);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const margem = (max - min) * 0.12;
  min -= margem;
  max += margem;

  const totalPontos = Math.max(...series.map((s) => s.pontos.length), 2);
  const x = (i: number) => padX + (i * (W - padX * 2)) / (totalPontos - 1);
  const y = (v: number) => padTop + ((max - v) * (H - padTop - padBottom)) / (max - min);

  const caminho = (pontos: PontoGrafico[]) =>
    pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      {typeof refMin === "number" && typeof refMax === "number" && (
        <rect
          x={padX}
          y={y(refMax)}
          width={W - padX * 2}
          height={Math.max(2, y(refMin) - y(refMax))}
          fill="rgba(18,123,76,0.10)"
        />
      )}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={W - padX}
          y1={padTop + f * (H - padTop - padBottom)}
          y2={padTop + f * (H - padTop - padBottom)}
          stroke={corEixo}
          strokeWidth="0.5"
          strokeDasharray="3 4"
        />
      ))}

      {series.map((s, idx) => (
        <g key={idx}>
          {s.area && s.pontos.length > 1 && (
            <path
              d={`${caminho(s.pontos)} L ${x(s.pontos.length - 1)} ${H - padBottom} L ${x(0)} ${H - padBottom} Z`}
              fill={s.cor}
              opacity={0.12}
            />
          )}
          <path d={caminho(s.pontos)} fill="none" stroke={s.cor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {s.pontos.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.valor)} r="3" fill={s.cor} stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          ))}
        </g>
      ))}

      {(series[0]?.pontos.length ?? 0) > 1 && (
        <>
          <text x={padX} y={H - 6} fontSize="9" fill={corEixo}>
            {series[0].pontos[0].rotulo}
          </text>
          <text x={W - padX} y={H - 6} fontSize="9" fill={corEixo} textAnchor="end">
            {series[0].pontos[series[0].pontos.length - 1].rotulo}
          </text>
        </>
      )}
    </svg>
  );
}
