"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { ChipEstado } from "../ui/ChipEstado";
import { Esqueleto, EstadoVazio } from "../ui/Estados";
import { useCamadasAdmin } from "../AdminShell";
import { useDadosAdmin } from "../dados";
import { contarPorCategoria, ROTULO_CATEGORIA, type CategoriaFila, type ItemFila } from "../metricas";
import { relativo } from "../tempo";

const ORDEM: CategoriaFila[] = ["validacao", "reembolso", "repasse", "chamado", "sistema"];

/**
 * Fila de decisões com itens REAIS: médicos em validação, reembolsos em
 * análise, repasses a pagar (com avisos PIX/CNPJ), chamados abertos e
 * eventos críticos de auditoria das últimas 24 h. Tocar abre o módulo.
 * As ações por gesto chegam com cada módulo novo (PRs seguintes).
 */
export function FilaPainel({ onAbrir, comTitulo = true }: { onAbrir: (view: string) => void; comTitulo?: boolean }) {
  const { fila, filaPronta, repasses, reembolsos, agora, atualizar, atualizando } = useDadosAdmin();
  const { fechar } = useCamadasAdmin();
  const [filtro, setFiltro] = useState<CategoriaFila | "tudo">("tudo");
  const contagem = contarPorCategoria(fila);
  const filtroValido = filtro === "tudo" || contagem[filtro] > 0 ? filtro : "tudo";
  const visiveis = filtroValido === "tudo" ? fila : fila.filter((i) => i.categoria === filtroValido);
  const errosFonte = [
    repasses.erro ? `Repasses: ${repasses.erro}` : null,
    reembolsos.erro ? `Reembolsos: ${reembolsos.erro}` : null,
  ].filter(Boolean) as string[];

  const abrir = (i: ItemFila) => {
    if (!i.destino) return;
    fechar();
    onAbrir(i.destino);
  };

  return (
    <div className="px-4 lg:px-0 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-0 pb-28 lg:pb-4">
      {comTitulo ? (
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-2xl font-black flex-1">Fila de decisões</h2>
          <button type="button" onClick={() => void atualizar()} disabled={atualizando} className="ba-icone-botao" aria-label={atualizando ? "Atualizando…" : "Atualizar a fila"}>
            <RefreshCw className={`w-5 h-5 ${atualizando ? "motion-safe:animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      ) : null}

      {fila.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-2" role="group" aria-label="Filtrar a fila">
          {(["tudo", ...ORDEM] as const)
            .filter((c) => c === "tudo" || contagem[c] > 0)
            .map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={filtroValido === c}
                onClick={() => setFiltro(c)}
                className={`ba-botao !min-h-9 !px-3 !text-xs shrink-0 ${filtroValido === c ? "ba-botao-primario" : "ba-botao-secundario"}`}
              >
                {c === "tudo" ? `Tudo · ${fila.length}` : `${ROTULO_CATEGORIA[c]} · ${contagem[c]}`}
              </button>
            ))}
        </div>
      ) : null}

      {errosFonte.length ? (
        <div className="ba-card mb-3" data-tom="critico" data-denso="true" role="alert">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--ba-critico)" }} aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="font-bold">Parte da fila não carregou</p>
              {errosFonte.map((e) => (
                <p key={e} className="ba-texto-2 break-words">{e}</p>
              ))}
            </div>
            <button type="button" onClick={() => void atualizar()} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs shrink-0">
              Tentar de novo
            </button>
          </div>
        </div>
      ) : null}

      {!filaPronta && fila.length === 0 ? (
        <Esqueleto variante="lista" quantidade={3} rotulo="Carregando a fila…" />
      ) : visiveis.length === 0 ? (
        errosFonte.length ? null : (
          <EstadoVazio icone={CheckCircle2} tom="ok" titulo="Tudo em ordem por aqui" texto="Nenhuma decisão pendente agora." />
        )
      ) : (
        <ul className="space-y-2.5" aria-label="Itens pendentes">
          {visiveis.map((i) => (
            <li key={i.chave}>
              <ItemDaFila item={i} agora={agora} onAbrir={() => abrir(i)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDaFila({ item, agora, onAbrir }: { item: ItemFila; agora: number; onAbrir: () => void }) {
  const corpo = (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="ba-rotulo !text-[10px] mb-0.5">{ROTULO_CATEGORIA[item.categoria]}</p>
          <p className="font-bold leading-snug break-words">{item.titulo}</p>
        </div>
        {item.destino ? <ChevronRight className="w-4 h-4 mt-1 shrink-0 ba-texto-3" aria-hidden /> : null}
      </div>
      {item.detalhe ? <p className="text-sm ba-texto-2 mt-0.5 break-words">{item.detalhe}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {item.chips.map((c) => (
          <ChipEstado key={c.rotulo} estado={c} />
        ))}
        {item.ts ? <span className="text-xs ba-texto-3">{relativo(item.ts, agora)}</span> : null}
      </div>
      {!item.destino ? <p className="text-xs ba-texto-3 mt-2">O pagamento será feito na tela Repasses (em breve).</p> : null}
    </>
  );
  if (!item.destino) {
    return (
      <div className="ba-card" data-tom={item.tom} data-denso="true">
        {corpo}
      </div>
    );
  }
  return (
    <button type="button" onClick={onAbrir} className="ba-card w-full text-left" data-tom={item.tom} data-denso="true">
      {corpo}
    </button>
  );
}
