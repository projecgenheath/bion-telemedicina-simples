"use client";

import type { KeyboardEventHandler } from "react";
import { Search } from "lucide-react";
import "../admin.css";

/**
 * Busca da Torre. A dica fica por cima do campo e quebra em palavras
 * inteiras. O placeholder nativo não quebra linha e cortava "especialidade".
 */
export function CampoBusca({
  valor,
  onChange,
  dica,
  rotulo,
  className = "",
  icone = true,
  id,
  autoFocus = false,
  describedBy,
  onKeyDown,
  maxLength,
}: {
  valor: string;
  onChange: (valor: string) => void;
  dica: string;
  rotulo?: string;
  className?: string;
  /** Sem a lupa, para um campo que não é busca mas também não pode cortar a dica. */
  icone?: boolean;
  id?: string;
  autoFocus?: boolean;
  describedBy?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  maxLength?: number;
}) {
  return (
    <label className={`ba-campo-busca ${icone ? "" : "ba-campo-busca-sem-icone"} ${className}`}>
      {icone ? <Search className="ba-campo-busca-icone" aria-hidden /> : null}
      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder=" "
        className="ba-entrada"
        aria-label={rotulo ?? dica}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        maxLength={maxLength}
      />
      <span className="ba-campo-busca-dica" aria-hidden="true">
        {dica}
      </span>
    </label>
  );
}
