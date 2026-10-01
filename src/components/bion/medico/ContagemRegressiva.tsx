"use client";

import { useEffect, useState } from "react";

/** Contagem regressiva isolada: só este componente re-renderiza a cada 1 s. */
export function ContagemRegressiva({ alvo }: { alvo: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const restante = alvo - agora;
  if (restante <= 0) {
    return <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">Horário da consulta</span>;
  }
  const seg = Math.floor(restante / 1000);
  const d = Math.floor(seg / 86_400);
  const h = Math.floor((seg % 86_400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const blocos: [number, string][] = [
    ...(d > 0 ? ([[d, d === 1 ? "dia" : "dias"]] as [number, string][]) : []),
    [h, "h"],
    [m, "min"],
    [s, "seg"],
  ];
  const leitura = `${d > 0 ? `${d} ${d === 1 ? "dia" : "dias"}, ` : ""}${h} horas, ${m} minutos`;
  return (
    <div className="flex items-end gap-3" role="timer" aria-label={`Faltam ${leitura}`}>
      {blocos.map(([v, r]) => (
        <div key={r} className="flex flex-col items-center min-w-[3rem]" aria-hidden>
          <span className="text-3xl font-black tabular-nums leading-none">{String(v).padStart(2, "0")}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/70 dark:text-bion-paper/70 mt-1">{r}</span>
        </div>
      ))}
    </div>
  );
}
