"use client";

/**
 * Campo de CID-10 com busca no catálogo local (item 32 da auditoria de
 * melhorias médicas). Mesmo comportamento do CampoMedicamentoBusca:
 * digita código ("J30") ou termo ("sinusite"), a lista sugere entradas
 * do catálogo e selecionar preenche o campo.
 *
 * CONTRATO (não muda): o valor continua sendo SÓ o código CID, no
 * formato que a API já aceita — selecionar grava o código e a descrição
 * aparece como legenda de conferência logo abaixo ("J30.1 — Rinite
 * alérgica devida a pólen"). Digitação livre continua possível para
 * códigos fora do subconjunto curado (a tabela completa é bem maior).
 */
import { useMemo, useState } from "react";
import { buscarCid, cidDoCatalogo } from "@/lib/cid10";

export function CampoCidBusca({
  valor,
  onChange,
  className,
  placeholder,
  ariaLabel,
  maxLength,
  readOnly,
}: {
  valor: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  readOnly?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const sugestoes = useMemo(() => (readOnly ? [] : buscarCid(valor)), [valor, readOnly]);
  const entradaAtual = useMemo(() => cidDoCatalogo(valor), [valor]);
  const mostrar = aberto && sugestoes.length > 0;

  return (
    <div className="relative">
      <input
        value={valor}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
        }}
        readOnly={readOnly}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className={className}
      />
      {/* Legenda de conferência: o que o código escolhido significa. Não
          faz parte do valor gravado (que continua sendo só o código). */}
      {entradaAtual && (
        <p className="mt-1 text-[11px] leading-snug opacity-70">
          {entradaAtual.codigo} — {entradaAtual.descricao}
        </p>
      )}
      {mostrar && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-bion-ink/15 bg-white py-1 shadow-xl dark:bg-zinc-900">
          {sugestoes.map((s) => (
            <li key={s.codigo}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-bion-lavender/60"
                // onMouseDown (antes do blur do input) para o clique valer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s.codigo);
                  setAberto(false);
                }}
              >
                <span className="font-bold">{s.codigo}</span>
                <span className="opacity-80"> — {s.descricao}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
