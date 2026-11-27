"use client";

/* Coluna direita das mensagens (etapa 4, ref. 06): resumo do paciente com   */
/* dados reais (motivo, próxima consulta, documentos e arquivos).             */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronsRight, ClipboardList, FileText, FlaskConical, Paperclip, Pill, Video } from "lucide-react";
import type { Documento } from "@/lib/bion-tipos";
import { iniciais } from "../metricas";

type Arquivo = { id: string };

export function ResumoConversa({
  nome,
  idade,
  genero,
  motivo,
  referencia,
  documentos,
  arquivos,
  salaHref,
  detalhes,
  onAbrirFicha,
  onRecolher,
}: {
  nome: string;
  idade: number | null;
  genero?: string;
  motivo: string;
  /** "Próxima consulta" ou "Última consulta" e quando. */
  referencia: { rotulo: string; quando: string } | null;
  documentos: Documento[];
  arquivos: Arquivo[];
  /** Sala da consulta aberta agora (mesmo link do Início); null fora da janela. */
  salaHref: string | null;
  /** Dados do paciente (os mesmos do cartão da conversa no celular). */
  detalhes: ReactNode;
  onAbrirFicha: () => void;
  onRecolher: () => void;
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const validos = documentos.filter((d) => d.status !== "cancelado");
  const n = (t: Documento["tipo"][]) => validos.filter((d) => t.includes(d.tipo)).length;
  const registros = [
    { rotulo: "Receitas", Icone: Pill, tom: "lavanda", total: n(["receita"]), unidade: ["receita", "receitas"] },
    { rotulo: "Exames solicitados", Icone: FlaskConical, tom: "pessego", total: n(["exame", "exame_solicitado"]), unidade: ["pedido", "pedidos"] },
    { rotulo: "Atestados", Icone: FileText, tom: "azul", total: n(["atestado"]), unidade: ["atestado", "atestados"] },
    { rotulo: "Arquivos do paciente", Icone: Paperclip, tom: "cinza", total: arquivos.length, unidade: ["arquivo", "arquivos"] },
  ];
  const perfil = [idade ? `${idade} anos` : "", genero ?? ""].filter(Boolean).join(" · ");

  return (
    <aside className="bm2-msg-resumo" aria-label={`Resumo de ${nome}`}>
      <div className="bm2-msg-resumo-topo">
        <button type="button" className="bm2-msg-icone" aria-label="Recolher o resumo do paciente" onClick={onRecolher}>
          <ChevronsRight aria-hidden />
        </button>
        {salaHref ? (
          <a href={salaHref} className="bm2-msg-icone bm2-msg-icone-azul" aria-label="Entrar na sala da consulta">
            <Video aria-hidden />
          </a>
        ) : null}
      </div>
      <div className="bm2-msg-resumo-pessoa">
        <span aria-hidden className="bm2-avatar bm2-msg-resumo-avatar">
          {iniciais(nome)}
        </span>
        <strong>{nome}</strong>
        {perfil ? <span>{perfil}</span> : null}
      </div>
      <dl className="bm2-msg-blocos">
        <div>
          <dd>{motivo || "Sem motivo informado"}</dd>
          <dt>Motivo da consulta</dt>
        </div>
        <div>
          <dd>{referencia?.quando ?? "Sem consulta"}</dd>
          <dt>{referencia?.rotulo ?? "Consulta"}</dt>
        </div>
      </dl>
      <button type="button" className="bm2-msg-mais" aria-expanded={maisAberto} onClick={() => setMaisAberto((v) => !v)}>
        {maisAberto ? "Ver menos" : "Ver mais"} <ChevronDown aria-hidden className={maisAberto ? "rotate-180" : ""} />
      </button>
      {maisAberto ? <div className="bm2-msg-detalhes">{detalhes}</div> : null}
      <section className="bm2-msg-registros" aria-label="Registros do paciente">
        <h4>Registros</h4>
        <ul>
          {registros.map((r) => (
            <li key={r.rotulo}>
              <button type="button" onClick={onAbrirFicha} aria-label={`${r.rotulo}: ${r.total} ${r.unidade[r.total === 1 ? 0 : 1]}. Abrir a ficha`}>
                <span aria-hidden className={`bm2-msg-registro-icone bm2-msg-tom-${r.tom}`}>
                  <r.Icone />
                </span>
                <span className="bm2-msg-registro-texto">
                  <span>{r.rotulo}</span>
                  <span>
                    {r.total} {r.unidade[r.total === 1 ? 0 : 1]}
                  </span>
                </span>
                <ChevronRight aria-hidden className="bm2-msg-seta" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={onAbrirFicha} aria-label="Abrir a ficha completa">
              <span aria-hidden className="bm2-msg-registro-icone bm2-msg-tom-forte">
                <ClipboardList />
              </span>
              <span className="bm2-msg-registro-texto">
                <span>Ficha completa</span>
                <span>Histórico, medições e exames</span>
              </span>
              <ChevronRight aria-hidden className="bm2-msg-seta" />
            </button>
          </li>
        </ul>
      </section>
    </aside>
  );
}
