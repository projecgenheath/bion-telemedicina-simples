"use client";

/* ==================================================================== */
/* Exames laboratoriais do paciente (etapa 3) no desenho da ficha do    */
/* médico: lista lilás "Exames e laudos" com a situação de cada exame   */
/* (Normal / Alterado: …) e um cartão por exame com o gráfico do        */
/* analito e os resultados da última coleta. Só dados reais (laudos     */
/* lidos pela BION IA); o arquivo original continua disponível.         */
/* ==================================================================== */

import { useRef } from "react";
import { ArrowUpRight, FileText, Plus } from "lucide-react";
import type { Arquivo, ExameLab } from "@/lib/bion-tipos";
import { GraficoLinha, type PontoGrafico } from "../GraficoLinha";
import { LaudosOriginais } from "../LaudosOriginais";
import { chaveAnalito, dataBR, rotuloCurto, situacaoExame } from "./etapa3-dados";

const idDoGrupo = (titulo: string) => `bp2-exame-${chaveAnalito(titulo).replace(/[^a-z0-9]+/g, "-")}`;

export function TelaExamesPaciente({
  exames,
  laudosIa,
  onEnviarLaudo,
}: {
  exames: ExameLab[];
  laudosIa: Arquivo[];
  onEnviarLaudo: () => void;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const grupos = (() => {
    const mapa = new Map<string, ExameLab[]>();
    for (const e of exames) {
      const lista = mapa.get(e.titulo) ?? [];
      lista.push(e);
      mapa.set(e.titulo, lista);
    }
    return [...mapa.entries()].map(([titulo, lista]) => [titulo, [...lista].sort((a, b) => a.dataColeta.localeCompare(b.dataColeta))] as const);
  })();

  const irPara = (titulo: string) => {
    const el = raizRef.current?.querySelector<HTMLElement>(`#${idDoGrupo(titulo)}`);
    if (!el) return;
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <div ref={raizRef} className="bp2-e3 bp2-exames bp2-v2">
      <header className="bp2-secao-cab">
        <h2 className="bp2-secao-titulo">Exames laboratoriais</h2>
        <p className="bp2-t-2 text-[12.5px]">Resultados lidos dos laudos que você envia. Se a leitura falhar, o arquivo original continua aqui.</p>
      </header>
      <div className="bp2-exames-grade">
        {/* Lista lilás (como "Exames e documentos" da ficha do médico) */}
        <section className="bp2-exames-lista bp2-animar" aria-labelledby="bp2-exames-lista-t">
          <div className="bp2-ficha-cab">
            <h3 id="bp2-exames-lista-t" className="bp2-ficha-titulo">
              Exames
              <br />
              e laudos
            </h3>
            <button type="button" onClick={onEnviarLaudo} aria-label="Enviar novo laudo à BION IA" title="Enviar laudo" className="bp2-redondo bp2-redondo-preto">
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="bp2-exames-sub">Exames laboratoriais ({grupos.length})</p>
          {grupos.length === 0 ? (
            <p className="bp2-vazio">Nenhum resultado ainda. Envie um laudo (PDF ou foto) pela BION IA; ela confere seu nome no documento.</p>
          ) : (
            <ul>
              {grupos.map(([titulo, lista]) => {
                const ultimo = lista.at(-1)!;
                const sit = situacaoExame(ultimo);
                return (
                  <li key={titulo} className="bp2-prox-item">
                    <button type="button" onClick={() => irPara(titulo)} className="bp2-prox-botao" aria-label={`${titulo}, ${dataBR(ultimo.dataColeta)}: ${sit.texto}. Ver resultados`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate bp2-prox-nome">{titulo}</span>
                        <span className="block truncate bp2-prox-sub">
                          {dataBR(ultimo.dataColeta)} · <span className={sit.alterado ? "bp2-exame-alterado" : undefined}>{sit.texto}</span>
                        </span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={onEnviarLaudo} className="bp2-exames-enviar">
            <FileText className="h-4 w-4" aria-hidden /> Enviar novo laudo
          </button>
        </section>

        {/* Um cartão por exame: gráfico do analito e resultados da última coleta */}
        <div className="bp2-exames-cartoes">
          {grupos.map(([titulo, lista], i) => {
            const ultimo = lista.at(-1)!;
            const sit = situacaoExame(ultimo);
            // M33: a série é de UM analito, casado pelo NOME: o primeiro da coleta
            // mais recente que aparece em todas as coletas do grupo (senão, o
            // primeiro da mais recente, só nas coletas em que ele aparece).
            const itemDe = (e: ExameLab, chave: string) => e.itens.find((it) => chaveAnalito(it.nome) === chave);
            const chaveSerie =
              ultimo.itens.map((it) => chaveAnalito(it.nome)).find((c) => lista.every((e) => itemDe(e, c))) ??
              (ultimo.itens[0] ? chaveAnalito(ultimo.itens[0].nome) : undefined);
            const destaque = chaveSerie ? itemDe(ultimo, chaveSerie) : undefined;
            const serie: PontoGrafico[] = (
              chaveSerie
                ? lista.flatMap((e) => {
                    const it = itemDe(e, chaveSerie);
                    return it ? [{ valor: it.valor, rotulo: rotuloCurto(e.dataColeta) }] : [];
                  })
                : []
            ).slice(-10);
            return (
              <section key={titulo} id={idDoGrupo(titulo)} tabIndex={-1} className={`bp2-cartao bp2-exame bp2-animar bp2-animar-d${Math.min(i + 1, 3)}`} aria-labelledby={`${idDoGrupo(titulo)}-t`}>
                <div className="bp2-exame-cab">
                  <div className="min-w-0">
                    <h3 id={`${idDoGrupo(titulo)}-t`} className="bp2-ficha-titulo">
                      {titulo}
                    </h3>
                    <p className="mt-1 text-[12px] bp2-t-2">
                      Última coleta: {dataBR(ultimo.dataColeta)} · <span className={sit.alterado ? "bp2-exame-alterado" : "bp2-exame-normal"}>{sit.texto}</span>
                    </p>
                  </div>
                  {destaque ? (
                    <div className="shrink-0 text-right">
                      <span className="bp2-ficha-valor tabular-nums">{destaque.valor.toLocaleString("pt-BR")}</span>
                      {destaque.unidade ? <span className="bp2-ficha-unidade"> {destaque.unidade}</span> : null}
                      <span className="block text-[11.5px] bp2-t-2">{destaque.nome}</span>
                    </div>
                  ) : null}
                </div>
                {serie.length > 1 ? (
                  <GraficoLinha
                    ariaLabel={`Histórico gráfico de ${titulo}${destaque ? ` — ${destaque.nome}` : ""}`}
                    altura={104}
                    corEixo="var(--bpp-grafico-eixo)"
                    series={[{ pontos: serie, cor: "var(--bpp-grafico-linha)", area: true }]}
                    refMin={destaque?.refMin}
                    refMax={destaque?.refMax}
                  />
                ) : null}
                <table className="bp2-exame-tabela">
                  <caption className="sr-only">Resultados de {titulo} da coleta de {dataBR(ultimo.dataColeta)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Analito</th>
                      <th scope="col">Resultado</th>
                      <th scope="col">Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimo.itens.map((it) => {
                      const fora = (it.refMin !== undefined && it.valor < it.refMin) || (it.refMax !== undefined && it.valor > it.refMax);
                      const ref =
                        it.refMin !== undefined && it.refMax !== undefined
                          ? `${it.refMin.toLocaleString("pt-BR")} – ${it.refMax.toLocaleString("pt-BR")}`
                          : it.refMin !== undefined
                            ? `≥ ${it.refMin.toLocaleString("pt-BR")}`
                            : it.refMax !== undefined
                              ? `≤ ${it.refMax.toLocaleString("pt-BR")}`
                              : "—";
                      return (
                        <tr key={it.nome}>
                          <td>{it.nome}</td>
                          <td className={`tabular-nums ${fora ? "bp2-exame-alterado" : ""}`}>
                            {it.valor.toLocaleString("pt-BR")} {it.unidade}
                            {fora ? <span className="sr-only"> (fora da referência)</span> : null}
                            {fora ? <span aria-hidden> ⚠</span> : null}
                          </td>
                          <td className="tabular-nums bp2-t-2">{ref}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
          <LaudosOriginais arquivos={laudosIa} exames={exames} />
        </div>
      </div>
    </div>
  );
}
