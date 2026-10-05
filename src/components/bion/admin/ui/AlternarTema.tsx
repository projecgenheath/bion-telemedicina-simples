"use client";

import { Moon, Sun } from "lucide-react";
import { useDensidadeAdmin, useTemaAdmin } from "./preferencias";
import "../admin.css";

/** Seletor Clean / Dark (mesmo vocabulário e mesma chave "bion-tema" do app). */
export function AlternarTema() {
  const { tema, definir } = useTemaAdmin();
  const opcoes = [
    { v: "claro" as const, r: "Clean", I: Sun },
    { v: "escuro" as const, r: "Dark", I: Moon },
  ];
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-full p-1 ba-botao-secundario">
      {opcoes.map(({ v, r, I }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={tema === v}
          onClick={() => definir(v)}
          className={`ba-botao !min-h-9 !px-4 ${tema === v ? "ba-botao-primario" : ""}`}
        >
          <I className="w-4 h-4" aria-hidden /> {r}
        </button>
      ))}
    </div>
  );
}

/** Densidade dos dados do admin: Compacta (padrão no desktop) ou Confortável. */
export function AlternarDensidade() {
  const { densidade, definir } = useDensidadeAdmin();
  const opcoes = [
    { v: "compacta" as const, r: "Compacta" },
    { v: "confortavel" as const, r: "Confortável" },
  ];
  return (
    <div role="radiogroup" aria-label="Densidade dos dados" className="inline-flex rounded-full p-1 ba-botao-secundario">
      {opcoes.map(({ v, r }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={densidade === v}
          onClick={() => definir(v)}
          className={`ba-botao !min-h-9 !px-4 ${densidade === v ? "ba-botao-primario" : ""}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
