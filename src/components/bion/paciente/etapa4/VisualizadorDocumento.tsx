"use client";

/* ==================================================================== */
/* Visualizador de documento do paciente (etapa 4): receita, atestado,  */
/* pedido de exames e prontuário no desenho da ficha do médico — topo   */
/* com botões redondos, "papel" do documento e, no computador, o cartão */
/* lilás de detalhes. Ver, baixar PDF (jsPDF no aparelho) e imprimir.   */
/* Só o paciente usa este componente (o VisualizadorDoc do médico, em    */
/* components/bion/Receitas.tsx, não muda).                             */
/* ==================================================================== */

import { useEffect, useRef } from "react";
import { BadgeCheck, Ban, ClipboardList, Copy, Download, FileText, Pill, Printer, X } from "lucide-react";
import { toast } from "sonner";
import type { Documento } from "@/lib/bion-tipos";
import { gerarDocumentoPDF } from "@/lib/receita-pdf";
import { useAppNativo } from "@/lib/useAppNativo";
import { useVoltarFecha } from "../useVoltarFecha";
import { useFocoDialogo } from "../useFocoDialogo";

export type TipoVisualizado = "receita" | "atestado" | "exame_solicitado" | "prontuario";

const ICONE = { receita: Pill, atestado: FileText, exame_solicitado: ClipboardList, prontuario: BadgeCheck } as const;

export function aceitaPdf(d: Documento | undefined | null): d is Documento {
  return !!d && (d.tipo === "receita" || d.tipo === "atestado" || d.tipo === "exame" || d.tipo === "exame_solicitado");
}

/** Compartilha o PDF quando o celular permite; senão baixa o arquivo. */
export async function entregarPdf(d: Documento) {
  try {
    const { nome, blob } = gerarDocumentoPDF(d, "blob");
    const arquivo = new File([blob], nome, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [arquivo] })) {
      await nav.share({ files: [arquivo], title: d.titulo });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast.success("PDF pronto para salvar.");
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    toast.error("Não foi possível gerar o PDF.");
  }
}

export type DadosVisualizador = {
  titulo: string;
  corpo: string[];
  /** Documento original (receita, atestado, pedido): habilita o PDF. O prontuário não tem. */
  documento?: Documento;
  tipo: TipoVisualizado;
  rotuloTipo: string;
  emitido: string;
  medico: string;
  especialidade?: string;
  /** "Cancelado em dd/mm/aaaa" quando o médico cancelou. */
  selo?: string | null;
  /** Abre já imprimindo (botão de impressora da lista). */
  imprimir?: boolean;
};

/** Iniciais do profissional para o avatar ("Dra. Ana Ribeiro" → "AR"). */
function iniciaisMedico(nome: string): string {
  const partes = nome
    .replace(/^Dr(a)?\.?\s+|^Dr\(a\)\.\s*/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function VisualizadorDocumento({ dados, paciente, onFechar }: { dados: DadosVisualizador; paciente: string; onFechar: () => void }) {
  const { titulo, corpo, documento, tipo, rotuloTipo, emitido, medico, especialidade, selo, imprimir = false } = dados;
  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, dialogoRef);
  // A WebView do app de loja ignora window.print(): no app, "Imprimir" vira "Copiar".
  const noApp = useAppNativo();
  const pdf = aceitaPdf(documento) ? documento : null;
  const Icone = ICONE[tipo] ?? FileText;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText([titulo, ...corpo].join("\n"));
      toast.success("Texto do documento copiado.", { description: "Para imprimir ou salvar em PDF, abra o BION pelo navegador." });
    } catch {
      toast.error("Não foi possível copiar. Para imprimir, abra o BION pelo navegador.");
    }
  };
  useEffect(() => {
    if (!imprimir || noApp) return;
    // Espera o documento pintar (a regra @media print só mostra .bp-impressao).
    const id = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(id);
  }, [imprimir, noApp]);

  // O corpo traz o título na 1ª linha e a assinatura "Dr(a). …" na última.
  const linhas = corpo[0] === titulo || corpo[0] === documento?.titulo ? corpo.slice(1) : corpo;
  const assinatura = linhas.at(-1)?.startsWith("Dr(a).") ? linhas.at(-1) : undefined;
  // O aviso de cancelado já aparece em destaque no topo do papel; não repete no texto.
  const semSelo = (assinatura ? linhas.slice(0, -1) : linhas).filter((l) => !(selo && l.trim().startsWith(selo)));
  const texto = semSelo.filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1 || arr[i - 1] === "")));
  const sub = [rotuloTipo, emitido, medico].filter(Boolean).join(" · ");

  return (
    <div ref={dialogoRef} className="bp2-vdoc bp2-e3 bp2-v2" role="dialog" aria-modal="true" aria-labelledby="bp2-vdoc-t" aria-label={`Documento: ${titulo}`}>
      <button type="button" tabIndex={-1} aria-hidden="true" className="bp2-vdoc-veu" onClick={onFechar} />
      <div className="bp2-vdoc-caixa">
        <header className="bp2-vdoc-topo">
          <span aria-hidden className={`bp2-docs-icone bp2-docs-icone-${tipo}`}>
            <Icone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="bp2-vdoc-t" className="bp2-vdoc-titulo">
              {titulo}
            </h2>
            <p className="bp2-vdoc-sub">{sub}</p>
          </div>
          <div className="bp2-vdoc-redondos">
            {noApp ? (
              <button type="button" onClick={() => void copiar()} aria-label="Copiar texto do documento" title="Copiar" className="bp2-redondo bp2-vdoc-so-largo">
                <Copy className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={() => window.print()} aria-label="Imprimir documento" title="Imprimir" className="bp2-redondo bp2-vdoc-so-largo">
                <Printer className="h-4 w-4" aria-hidden />
              </button>
            )}
            <button type="button" onClick={onFechar} aria-label="Fechar documento" title="Fechar" className="bp2-redondo bp2-redondo-preto">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="bp2-vdoc-corpo">
          <article className="bp2-vdoc-papel bp-impressao" aria-label={`Conteúdo de ${titulo}`}>
            <div className="bp2-vdoc-papel-cab">
              <span className="bp2-vdoc-marca">BION Telemedicina</span>
              <span className="bp2-vdoc-tipo">{rotuloTipo}</span>
            </div>
            {selo ? (
              <p className="bp2-vdoc-cancelado">
                <Ban className="h-4 w-4 shrink-0" aria-hidden /> {selo} pelo médico.
              </p>
            ) : null}
            <h3 className="bp2-vdoc-papel-titulo">{documento?.titulo || titulo}</h3>
            <dl className="bp2-vdoc-meta">
              <div>
                <dt>Paciente</dt>
                <dd>{paciente}</dd>
              </div>
              <div>
                <dt>Emitido em</dt>
                <dd className="tabular-nums">{emitido || "—"}</dd>
              </div>
            </dl>
            <div className="bp2-vdoc-texto">
              {texto.map((p, i) => (p ? <p key={i}>{p}</p> : <br key={i} />))}
            </div>
            <div className="bp2-vdoc-assina">
              <span className="bp2-vdoc-linha" aria-hidden />
              <strong>{assinatura?.replace(/^Dr\(a\)\.\s*/, "") || medico}</strong>
              {especialidade ? <span>{especialidade}</span> : null}
            </div>
            <p className="bp2-vdoc-rodape">Documento sem assinatura digital ICP-Brasil — BION Telemedicina.</p>
          </article>

          {/* Computador: detalhes no cartão lilás (como "Exames e documentos" da ficha) */}
          <section className="bp2-vdoc-lado" aria-labelledby="bp2-vdoc-lado-t">
            <div className="bp2-vdoc-lado-cab">
              <h3 id="bp2-vdoc-lado-t" className="bp2-ficha-titulo">
                Este
                <br />
                documento
              </h3>
              {pdf ? (
                <button type="button" onClick={() => void entregarPdf(pdf)} aria-label="Baixar ou compartilhar PDF" title="Baixar PDF" className="bp2-redondo bp2-redondo-preto">
                  <Download className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <h4 className="bp2-vdoc-subtitulo">Situação</h4>
            <div className="bp2-vdoc-rel">
              <div className="min-w-0">
                <p className="bp2-vdoc-rel-nome">{rotuloTipo}</p>
                <p className="bp2-vdoc-rel-sub tabular-nums">Emitido em {emitido || "—"}</p>
              </div>
              {selo ? (
                <span className="bp2-selo-cancelado">
                  <Ban className="h-3 w-3" aria-hidden /> {selo}
                </span>
              ) : (
                <span className="bp2-selo-valido">{tipo === "prontuario" ? "Disponível" : "Válido"}</span>
              )}
            </div>
            <h4 className="bp2-vdoc-subtitulo">Profissional</h4>
            <div className="bp2-vdoc-emissor">
              <span className="bp2-vdoc-emissor-avatar" aria-hidden>
                {iniciaisMedico(medico)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{medico || "—"}</span>
                {especialidade ? <span className="bp2-vdoc-rel-sub block truncate">{especialidade}</span> : null}
              </span>
            </div>
            <p className="bp2-vdoc-nota">
              {pdf ? "O PDF é gerado no seu aparelho, com os dados deste documento." : "O prontuário não tem PDF; use Imprimir para salvar."}
            </p>
          </section>
        </div>

        {/* Celular: ações grandes no rodapé */}
        <footer className="bp2-vdoc-acoes">
          {pdf ? (
            <button type="button" onClick={() => void entregarPdf(pdf)} aria-label="Baixar ou compartilhar PDF" className="bp2-vdoc-botao bp2-vdoc-botao-azul">
              <Download className="h-4 w-4" aria-hidden /> Baixar PDF
            </button>
          ) : null}
          {noApp ? (
            <button type="button" onClick={() => void copiar()} aria-label="Copiar texto do documento" className="bp2-vdoc-botao">
              <Copy className="h-4 w-4" aria-hidden /> Copiar
            </button>
          ) : (
            <button type="button" onClick={() => window.print()} aria-label="Imprimir documento" className="bp2-vdoc-botao">
              <Printer className="h-4 w-4" aria-hidden /> Imprimir
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
