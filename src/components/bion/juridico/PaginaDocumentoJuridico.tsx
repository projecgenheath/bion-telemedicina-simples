import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { lerFrontMatter, MarkdownSimples } from "@/lib/markdown-simples";
import { rotuloVersao } from "@/lib/aceite-termos";

/** Lê uma minuta de src/conteudo/juridico (em build: página estática). */
export function lerMinuta(arquivo: string) {
  return lerFrontMatter(readFileSync(path.join(process.cwd(), "src/conteudo/juridico", arquivo), "utf8"));
}

/** Página pública (sem login) de documento jurídico, com aviso de versão provisória. */
export function PaginaDocumentoJuridico({
  versao,
  data,
  arquivos,
}: {
  versao: string;
  /**
   * AAAA-MM-DD. Omitido: sai do próprio id da versão (ex.:
   * termos-medico-v2.1-2026-11-03 → 03/11/2026), para a página não divergir
   * da versão que o portão de aceite grava.
   */
  data?: string;
  arquivos: readonly string[];
}) {
  const docs = arquivos.map(lerMinuta);
  // Mesmo rótulo do portão de aceite (lib/aceite-termos): "v2.1, versão de 03/11/2026".
  const rotulo = rotuloVersao(versao, data);
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <Link href="/" className="text-xs font-semibold text-primary underline">
          Voltar para a BION
        </Link>
        <div role="note" className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm font-bold">
          Versão provisória {rotulo}{" "}
          <span className="font-normal text-muted-foreground">({versao})</span>
        </div>
        {docs.map((doc, i) => (
          <article key={i} className="space-y-3">
            {i > 0 ? <hr className="my-10" /> : null}
            {doc.titulo ? <h1 className="text-2xl font-extrabold">{doc.titulo}</h1> : null}
            {doc.subtitulo ? <p className="text-xs text-muted-foreground">{doc.subtitulo}</p> : null}
            <MarkdownSimples md={doc.corpo} />
          </article>
        ))}
      </div>
    </main>
  );
}
