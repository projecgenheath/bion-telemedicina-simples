import { Fragment, type ReactNode } from "react";

/**
 * Renderizador mínimo e seguro (sem HTML cru) para as minutas jurídicas em
 * Markdown: front matter, títulos, citações, listas, tabelas, linhas
 * horizontais, parágrafos, **negrito**, *itálico* e `código`. O texto é
 * mantido literalmente (inclusive os trechos [A DEFINIR]).
 */

export interface DocumentoMd {
  titulo: string | null;
  subtitulo: string | null;
  corpo: string;
}

export function lerFrontMatter(md: string): DocumentoMd {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (!m) return { titulo: null, subtitulo: null, corpo: md };
  const campo = (k: string) => {
    const r = new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m").exec(m[1]);
    return r ? r[1] : null;
  };
  return { titulo: campo("title"), subtitulo: campo("subtitle"), corpo: md.slice(m[0].length) };
}

export function inline(texto: string, chave = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*)/g;
  let ultimo = 0;
  let n = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
    const k = `${chave}-${n++}`;
    if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[3] !== undefined) out.push(<code key={k} className="rounded bg-muted px-1 text-[0.9em]">{m[3]}</code>);
    else out.push(<em key={k}>{inline(m[4], k)}</em>);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}

/** Linhas de parágrafo: "  " no fim (ou "\") vira quebra de linha. */
function linhas(ls: string[], chave: string): ReactNode[] {
  return ls.map((l, i) => {
    const quebra = /( {2,}|\\)$/.test(l) && i < ls.length - 1;
    const t = l.replace(/( {2,}|\\)$/, "").trim();
    return (
      <Fragment key={`${chave}-${i}`}>
        {inline(t, `${chave}-${i}`)}
        {i < ls.length - 1 ? (quebra ? <br /> : " ") : null}
      </Fragment>
    );
  });
}

const celulas = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function MarkdownSimples({ md }: { md: string }) {
  const ls = md.replace(/\r\n/g, "\n").split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;
  let b = 0;
  const ehEspecial = (l: string) =>
    /^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|\||---\s*$)/.test(l) || l.trim() === "";
  while (i < ls.length) {
    const l = ls[i];
    const k = `b${b++}`;
    if (l.trim() === "") { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      const nivel = h[1].length;
      const cls = nivel === 1 ? "text-xl font-extrabold mt-8" : nivel === 2 ? "text-lg font-bold mt-6" : "text-base font-bold mt-4";
      const conteudo = inline(h[2], k);
      blocos.push(
        nivel === 1 ? <h2 key={k} className={cls}>{conteudo}</h2>
        : nivel === 2 ? <h3 key={k} className={cls}>{conteudo}</h3>
        : <h4 key={k} className={cls}>{conteudo}</h4>,
      );
      i++;
      continue;
    }
    if (/^---\s*$/.test(l)) { blocos.push(<hr key={k} className="my-6" />); i++; continue; }
    if (l.startsWith(">")) {
      const q: string[] = [];
      while (i < ls.length && ls[i].startsWith(">")) q.push(ls[i++].replace(/^>\s?/, ""));
      blocos.push(<blockquote key={k} className="border-l-4 border-amber-500 bg-amber-500/10 px-4 py-3 rounded-r-xl">{linhas(q, k)}</blockquote>);
      continue;
    }
    if (l.trim().startsWith("|")) {
      const t: string[] = [];
      while (i < ls.length && ls[i].trim().startsWith("|")) t.push(ls[i++]);
      const cab = celulas(t[0]);
      const corpo = t.slice(/^\s*\|?\s*:?-{2,}/.test(t[1] ?? "") ? 2 : 1).map(celulas);
      blocos.push(
        <div key={k} className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr>{cab.map((c, j) => <th key={j} className="border px-2 py-1 text-left align-top">{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{corpo.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border px-2 py-1 align-top">{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*(\d+)\.\s+/;
    if (ul.test(l) || ol.test(l)) {
      const ordenada = ol.test(l) && !ul.test(l);
      const re = ordenada ? ol : ul;
      const itens: string[][] = [];
      const inicio = ordenada ? Number(ol.exec(l)![1]) : 1;
      while (i < ls.length && re.test(ls[i])) {
        const item = [ls[i++].replace(re, "")];
        while (i < ls.length && ls[i].trim() !== "" && !ehEspecial(ls[i])) item.push(ls[i++]);
        itens.push(item);
      }
      const lis = itens.map((it, j) => <li key={j}>{linhas(it, `${k}-${j}`)}</li>);
      blocos.push(
        ordenada
          ? <ol key={k} start={inicio} className="list-decimal pl-6 space-y-1">{lis}</ol>
          : <ul key={k} className="list-disc pl-6 space-y-1">{lis}</ul>,
      );
      continue;
    }
    const p: string[] = [];
    while (i < ls.length && ls[i].trim() !== "" && !(p.length && ehEspecial(ls[i]))) p.push(ls[i++]);
    blocos.push(<p key={k}>{linhas(p, k)}</p>);
  }
  return <div className="space-y-3 text-sm leading-relaxed text-foreground">{blocos}</div>;
}
