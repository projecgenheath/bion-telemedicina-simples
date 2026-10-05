"use client";

import type { KeyboardEvent, ReactNode } from "react";
import "../admin.css";

export type ColunaAdmin<T> = {
  id: string;
  titulo: string;
  render: (linha: T) => ReactNode;
  /** "num" alinha à direita com algarismos tabulares (valores, contagens). */
  tipo?: "texto" | "num";
  largura?: string;
  /** Esconde a coluna abaixo de 1280 px (tabelas largas no tablet). */
  secundaria?: boolean;
};

/**
 * Tabela densa de vidro para o layout largo: cabeçalho fixo, zebra leve,
 * linha selecionável (mestre-detalhe). Acessível: <th scope="col">, linhas
 * focáveis com Enter/Espaço para abrir e ↑/↓ para andar entre linhas.
 */
export function TabelaAdmin<T>({
  rotulo,
  colunas,
  linhas,
  chave,
  onAbrir,
  selecionada,
  vazio,
  alturaMax = "70vh",
}: {
  rotulo: string;
  colunas: ColunaAdmin<T>[];
  linhas: T[];
  chave: (l: T) => string;
  onAbrir?: (l: T) => void;
  selecionada?: string | null;
  vazio?: ReactNode;
  alturaMax?: string;
}) {
  const aoTeclar = (e: KeyboardEvent<HTMLTableRowElement>, l: T) => {
    if (!onAbrir) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir(l);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const alvo = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
      alvo?.focus();
    }
  };
  if (linhas.length === 0 && vazio) return <div className="ba-card" data-denso="true">{vazio}</div>;
  return (
    <div className="ba-card p-0 overflow-hidden" data-denso="true">
      <div className="ba-tabela-moldura" style={{ maxHeight: alturaMax }}>
        <table className="ba-tabela">
          <caption className="sr-only">{rotulo}</caption>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={`${c.tipo === "num" ? "ba-num" : ""} ${c.secundaria ? "hidden xl:table-cell" : ""}`}
                  style={c.largura ? { width: c.largura } : undefined}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const id = chave(l);
              return (
                <tr
                  key={id}
                  data-clicavel={onAbrir ? "true" : undefined}
                  aria-selected={selecionada != null ? selecionada === id : undefined}
                  tabIndex={onAbrir ? 0 : undefined}
                  onClick={onAbrir ? () => onAbrir(l) : undefined}
                  onKeyDown={(e) => aoTeclar(e, l)}
                >
                  {colunas.map((c) => (
                    <td key={c.id} className={`${c.tipo === "num" ? "ba-num" : ""} ${c.secundaria ? "hidden xl:table-cell" : ""}`}>
                      {c.render(l)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
