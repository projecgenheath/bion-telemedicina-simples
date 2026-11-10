/**
 * Arquivos (PDF) no navegador E no app Android (Capacitor 7) — helper comum
 * a Pacientes e Médicos.
 *
 * Por que existe: a WebView do app ignora `window.print()` e o download por
 * <a download> de um blob não salva nada — o app dizia "PDF baixado" sem
 * arquivo nenhum. Aqui:
 *  - salvarPdf:       web → download; app → grava em Documentos/BION (e, se o
 *                     Android recusar a pasta pública, abre o compartilhar
 *                     para o paciente escolher onde guardar).
 *  - compartilharPdf: web → Web Share com arquivo (ou download); app → grava
 *                     no cache e abre a folha de compartilhar do Android.
 *  - imprimirPdf:     web → imprime o PDF num iframe oculto; app → abre a
 *                     folha de compartilhar (ver nota abaixo).
 *
 * Contrato (combinado com Médicos):
 *  - aceitam `Blob | Uint8Array | ArrayBuffer` + nome do arquivo; o nome é
 *    sempre higienizado (sem acento, barra ou caractere de controle) e
 *    termina em ".pdf";
 *  - em FALHA a promessa é REJEITADA com `ErroArquivo` (nada de só logar),
 *    para a tela sair do estado "Emitindo…/Gerando…";
 *  - quando o usuário só fecha a folha de compartilhar, resolve com
 *    `{ modo: "cancelado" }` (não é falha);
 *  - o `modo` devolvido diz o que aconteceu de fato: a tela só pode afirmar
 *    "PDF salvo" quando `modo === "salvo"` (app) ou "baixado" (web).
 *
 * Impressão nativa: o único plugin de impressão para Capacitor 7
 * (@capgo/capacitor-printer 7.0.14) exige Android Gradle Plugin 8.13 (o
 * projeto usa 8.7.2/Gradle 8.11.1) e não pôde ser compilado aqui. No app,
 * "Imprimir" abre a folha de compartilhar com o PDF: o leitor de PDF/Drive
 * escolhido imprime pelo serviço de impressão do Android.
 */
import { estaNoAppNativo } from "@/lib/app-nativo";

export type DadosPdf = Blob | Uint8Array | ArrayBuffer;

export type ResultadoArquivo =
  | { modo: "baixado"; nome: string }
  | { modo: "salvo"; nome: string; uri: string; pasta: string }
  | { modo: "compartilhado"; nome: string; uri?: string }
  | { modo: "impressao"; nome: string }
  | { modo: "aberto"; nome: string }
  | { modo: "cancelado"; nome: string };

export class ErroArquivo extends Error {
  readonly causa: unknown;
  constructor(mensagem: string, causa?: unknown) {
    super(mensagem);
    this.name = "ErroArquivo";
    this.causa = causa;
  }
}

/** Pasta (dentro de Documentos) onde o app grava os PDFs. */
export const PASTA_APP = "BION";

/* ------------------------------ utilitários ------------------------------ */

/** Nome seguro para arquivo: sem acento, sem separador de pasta, sem
 *  caractere de controle/reservado, até 120 caracteres, sempre ".pdf". */
export function nomeArquivoSeguro(nome: string, extensao = "pdf"): string {
  const ext = extensao.replace(/^\.+/, "").toLowerCase() || "pdf";
  let base = String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(new RegExp(`\\.${ext}$`, "i"), "")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "");
  if (!base) base = "documento";
  return `${base.slice(0, 120)}.${ext}`;
}

/** Blob/Uint8Array/ArrayBuffer → Blob application/pdf. */
export function paraBlob(dados: DadosPdf): Blob {
  if (typeof Blob !== "undefined" && dados instanceof Blob) {
    return dados.type === "application/pdf" ? dados : new Blob([dados], { type: "application/pdf" });
  }
  if (dados instanceof Uint8Array) return new Blob([dados as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
  if (dados instanceof ArrayBuffer) return new Blob([dados], { type: "application/pdf" });
  throw new ErroArquivo("Conteúdo do PDF inválido.");
}

async function paraBytes(dados: DadosPdf): Promise<Uint8Array> {
  if (dados instanceof Uint8Array) return dados;
  if (dados instanceof ArrayBuffer) return new Uint8Array(dados);
  if (typeof Blob !== "undefined" && dados instanceof Blob) return new Uint8Array(await dados.arrayBuffer());
  throw new ErroArquivo("Conteúdo do PDF inválido.");
}

/** Base64 em blocos (evita estourar a pilha com PDFs grandes). */
export function bytesParaBase64(bytes: Uint8Array): string {
  let bin = "";
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  return btoa(bin);
}

function foiCancelamento(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /cancel/i.test(msg) || (e as { name?: string })?.name === "AbortError";
}

/* ------------------------------ ambiente ------------------------------ */

/** Subconjunto do @capacitor/filesystem usado aqui. */
export type FilesystemLike = {
  writeFile(o: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }>;
};
/** Subconjunto do @capacitor/share usado aqui. */
export type ShareLike = {
  share(o: { title?: string; files?: string[]; dialogTitle?: string }): Promise<unknown>;
};
export type OperacoesWeb = {
  baixar(blob: Blob, nome: string): Promise<void>;
  imprimir(blob: Blob, nome: string): Promise<"impressao" | "aberto">;
  compartilhar(blob: Blob, nome: string, titulo?: string): Promise<"compartilhado" | "indisponivel">;
};
export type AmbienteArquivos = {
  nativo(): boolean;
  filesystem(): Promise<FilesystemLike>;
  share(): Promise<ShareLike>;
  web: OperacoesWeb;
};

const webPadrao: OperacoesWeb = {
  async baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Revogar na hora cancela o download em alguns navegadores.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  },
  imprimir(blob) {
    // Imprime o PDF timbrado num iframe oculto: a página do app não entra
    // na impressão (antes saía em branco — @media print escondia tudo).
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.title = "Impressão do documento";
      Object.assign(iframe.style, {
        position: "fixed", right: "0", bottom: "0", width: "1px", height: "1px",
        border: "0", opacity: "0", pointerEvents: "none",
      });
      let terminou = false;
      const limpar = () => {
        // Remover o iframe com o diálogo aberto cancela a impressão no Chrome.
        window.setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 120_000);
      };
      const abrirAba = () => {
        const w = window.open(url, "_blank", "noopener");
        limpar();
        if (w || w === null) {
          // noopener devolve null mesmo quando abre; sem como distinguir
          // bloqueio de pop-up, consideramos aberto.
          resolve("aberto");
        }
      };
      const prazo = window.setTimeout(() => {
        if (terminou) return;
        terminou = true;
        abrirAba();
      }, 15_000);
      iframe.onload = () => {
        if (terminou) return;
        // O leitor de PDF do navegador precisa de um instante após o load.
        window.setTimeout(() => {
          if (terminou) return;
          terminou = true;
          window.clearTimeout(prazo);
          try {
            const w = iframe.contentWindow;
            if (!w) throw new Error("iframe sem janela");
            w.focus();
            w.print();
            limpar();
            resolve("impressao");
          } catch {
            try { abrirAba(); } catch (e) { reject(e); }
          }
        }, 400);
      };
      iframe.src = url;
      document.body.appendChild(iframe);
    });
  },
  async compartilhar(blob, nome, titulo) {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof File === "undefined" || !nav.share || !nav.canShare) return "indisponivel";
    const arquivo = new File([blob], nome, { type: "application/pdf" });
    if (!nav.canShare({ files: [arquivo] })) return "indisponivel";
    await nav.share({ files: [arquivo], title: titulo ?? nome });
    return "compartilhado";
  },
};

export const ambientePadrao: AmbienteArquivos = {
  nativo: estaNoAppNativo,
  filesystem: async () => (await import("@capacitor/filesystem")).Filesystem as unknown as FilesystemLike,
  share: async () => (await import("@capacitor/share")).Share as unknown as ShareLike,
  web: webPadrao,
};

/* ------------------------------ API ------------------------------ */

export type OpcoesArquivo = { titulo?: string };

export function criarArquivos(amb: AmbienteArquivos) {
  async function gravarNoCache(dados: DadosPdf, nome: string): Promise<string> {
    const fs = await amb.filesystem();
    const r = await fs.writeFile({
      path: `${PASTA_APP}/${nome}`,
      data: bytesParaBase64(await paraBytes(dados)),
      directory: "CACHE",
      recursive: true,
    });
    if (!r?.uri) throw new Error("writeFile sem uri");
    return r.uri;
  }

  async function compartilharPdf(dados: DadosPdf, nomeBruto: string, op: OpcoesArquivo = {}): Promise<ResultadoArquivo> {
    const nome = nomeArquivoSeguro(nomeBruto);
    if (amb.nativo()) {
      let uri: string;
      try {
        uri = await gravarNoCache(dados, nome);
      } catch (e) {
        throw new ErroArquivo("Não foi possível preparar o PDF no aparelho.", e);
      }
      try {
        const share = await amb.share();
        await share.share({ title: op.titulo ?? nome, files: [uri], dialogTitle: op.titulo ?? "Salvar ou enviar o PDF" });
        return { modo: "compartilhado", nome, uri };
      } catch (e) {
        if (foiCancelamento(e)) return { modo: "cancelado", nome };
        throw new ErroArquivo("Não foi possível abrir o compartilhamento do PDF.", e);
      }
    }
    const blob = paraBlob(dados);
    try {
      const r = await amb.web.compartilhar(blob, nome, op.titulo);
      if (r === "compartilhado") return { modo: "compartilhado", nome };
    } catch (e) {
      if (foiCancelamento(e)) return { modo: "cancelado", nome };
      // Web Share falhou por outro motivo: cai no download abaixo.
    }
    try {
      await amb.web.baixar(blob, nome);
      return { modo: "baixado", nome };
    } catch (e) {
      throw new ErroArquivo("Não foi possível baixar o PDF.", e);
    }
  }

  async function salvarPdf(dados: DadosPdf, nomeBruto: string, op: OpcoesArquivo = {}): Promise<ResultadoArquivo> {
    const nome = nomeArquivoSeguro(nomeBruto);
    if (amb.nativo()) {
      try {
        const fs = await amb.filesystem();
        const r = await fs.writeFile({
          path: `${PASTA_APP}/${nome}`,
          data: bytesParaBase64(await paraBytes(dados)),
          directory: "DOCUMENTS",
          recursive: true,
        });
        if (!r?.uri) throw new Error("writeFile sem uri");
        return { modo: "salvo", nome, uri: r.uri, pasta: `Documentos/${PASTA_APP}` };
      } catch {
        // Android 10 ou anterior (ou pasta pública recusada): o paciente
        // escolhe onde guardar pela folha de compartilhar.
        return compartilharPdf(dados, nome, { titulo: op.titulo ?? "Salvar PDF" });
      }
    }
    try {
      await amb.web.baixar(paraBlob(dados), nome);
      return { modo: "baixado", nome };
    } catch (e) {
      throw new ErroArquivo("Não foi possível baixar o PDF.", e);
    }
  }

  async function imprimirPdf(dados: DadosPdf, nomeBruto: string, op: OpcoesArquivo = {}): Promise<ResultadoArquivo> {
    const nome = nomeArquivoSeguro(nomeBruto);
    if (amb.nativo()) {
      return compartilharPdf(dados, nome, { titulo: op.titulo ?? "Imprimir: escolha um leitor de PDF" });
    }
    try {
      const modo = await amb.web.imprimir(paraBlob(dados), nome);
      return { modo, nome };
    } catch (e) {
      throw new ErroArquivo("Não foi possível abrir a impressão do PDF.", e);
    }
  }

  return { salvarPdf, compartilharPdf, imprimirPdf };
}

const padrao = criarArquivos(ambientePadrao);
export const salvarPdf = padrao.salvarPdf;
export const compartilharPdf = padrao.compartilharPdf;
export const imprimirPdf = padrao.imprimirPdf;

/** Texto curto (toast) que descreve o que REALMENTE aconteceu. */
export function mensagemResultado(r: ResultadoArquivo): string | null {
  switch (r.modo) {
    case "salvo":
      return `PDF salvo em ${r.pasta}.`;
    case "baixado":
      return "Download do PDF iniciado.";
    case "compartilhado":
      return null;
    case "impressao":
      return null;
    case "aberto":
      return "PDF aberto em outra aba para imprimir.";
    case "cancelado":
      return null;
  }
}
