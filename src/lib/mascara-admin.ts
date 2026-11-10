/**
 * Máscara de conteúdo clínico para o ADMIN (decisão do Alisson, 09/11).
 *
 * O admin vê só o TIPO do documento/arquivo, nunca o título nem o nome do
 * arquivo (ex.: "receita-losartana.pdf" → "Receita.pdf"). Funções puras, sem
 * banco: aplicadas no servidor na LEITURA (bootstrap, download, auditoria).
 * O banco não é alterado — a trilha de auditoria antiga continua íntegra e
 * só é mascarada ao ser mostrada ao admin.
 */
import { rotuloTipoDocumento } from "./privacidade-consulta";

/** Extensões neutras (não revelam conteúdo). Qualquer outra é descartada. */
export const EXTENSOES_NEUTRAS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "doc", "docx", "txt"] as const;

/** Extensão em minúsculas se estiver na lista neutra; senão "". */
export function extensaoNeutra(nome: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,8})\s*$/.exec(nome ?? "");
  const ext = m ? m[1].toLowerCase() : "";
  return (EXTENSOES_NEUTRAS as readonly string[]).includes(ext) ? ext : "";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Rótulo do tipo para um arquivo/documento. Aceita o `tipo` do Documento
 * (receita, atestado, exame_solicitado…) e o `tipo` livre do Arquivo
 * ("Exame laboratorial", "Exame cardiológico", "Receita"…). Desconhecido →
 * "Documento". O nome do arquivo NUNCA entra na decisão (revelaria conteúdo).
 */
export function rotuloTipoArquivo(tipo: string | null | undefined): string {
  const exato = rotuloTipoDocumento(tipo);
  if (exato !== "Documento") return exato;
  const t = semAcento(tipo ?? "");
  if (t.includes("receita")) return "Receita";
  if (t.includes("atestado")) return "Atestado";
  if (t.includes("solicita")) return "Solicitação";
  if (t.includes("laudo")) return "Laudo";
  if (t.includes("exame")) return "Exame";
  return "Documento";
}

/** "Receita.pdf", "Exame.jpg", "Documento" (sem extensão neutra). */
export function nomeArquivoAdmin(tipo: string | null | undefined, nome: string | null | undefined): string {
  const ext = extensaoNeutra(nome);
  return `${rotuloTipoArquivo(tipo)}${ext ? `.${ext}` : ""}`;
}

/** Vários arquivos do mesmo tipo num mesmo item: "Exame.pdf", "Exame (2).pdf"… */
export function nomesArquivosAdmin(arquivos: { tipo?: string | null; nome?: string | null }[]): string[] {
  const vistos = new Map<string, number>();
  return arquivos.map((a) => {
    const rotulo = rotuloTipoArquivo(a.tipo);
    const n = (vistos.get(rotulo) ?? 0) + 1;
    vistos.set(rotulo, n);
    const ext = extensaoNeutra(a.nome);
    return `${rotulo}${n > 1 ? ` (${n})` : ""}${ext ? `.${ext}` : ""}`;
  });
}

/** Content-Disposition com o nome neutro (ASCII + filename* UTF-8). */
export function contentDispositionAdmin(nome: string): string {
  const ascii = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w .()-]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

type ArquivoComNome = { nome: string; tipo: string; storagePath?: string | null };

/**
 * Arquivo como o ADMIN pode ver: nome = rótulo + extensão neutra; tipo =
 * rótulo (o tipo livre "Exame cardiológico" já diz demais); storagePath
 * (que contém o nome original) vira um marcador — o cliente só usa a
 * presença dele para mostrar o botão de download.
 */
export function arquivoParaAdmin<T extends ArquivoComNome>(a: T): T {
  return {
    ...a,
    nome: nomeArquivoAdmin(a.tipo, a.nome),
    tipo: rotuloTipoArquivo(a.tipo),
    ...("storagePath" in a ? { storagePath: a.storagePath ? "restrito" : null } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Auditoria: máscara na leitura para o admin                          */
/* ------------------------------------------------------------------ */

const ROTULO_EMISSAO = /^(Receita|Atestado|Solicitação de exame): ([\s\S]*) para ([^\n]+?)$/;
const EXAME_MANUAL = /^Exame "[\s\S]*" registrado manualmente \((\d+) resultados?\)$/;
const DOC_CLIENTE = /^(Visualização|Download PDF): [\s\S]* \(([a-z_]+)\)$/;
// "<nome> (<tipo>, <n>KB)<resto>" — resto: " [storage]", " → paciente <id>",
// " enviado por médico|paciente" (formato antigo, antes de 11/09).
const ARQUIVO_ENVIADO = /^([\s\S]*) \(([^()]*?), (\d+)KB\)((?: \[storage\])?(?: → paciente \S+| enviado por \S+)?)$/;
// Formatos antigos do cliente (antes de 11/09): conclusão com o resumo
// clínico e medição com os valores.
const RESUMO_ANTIGO = / — Resumo: [\s\S]*$/;
const MEDICAO_ANTIGA = /^Medição de ([\w-]+): [^()]* \(app do paciente\)$/;

export const DETALHE_OMITIDO = "(detalhe clínico omitido)";

/** Troca o nome do arquivo no fim de um caminho do Storage por "Documento.ext". */
function caminhoStorageAdmin(path: string): string {
  const i = path.lastIndexOf("/");
  const pasta = i >= 0 ? path.slice(0, i + 1) : "";
  const arquivo = i >= 0 ? path.slice(i + 1) : path;
  const ts = /^(\d+)-/.exec(arquivo)?.[1];
  const ext = extensaoNeutra(arquivo);
  return `${pasta}${ts ? `${ts}-` : ""}Documento${ext ? `.${ext}` : ""}`;
}

/**
 * Detalhe de uma linha de auditoria como o ADMIN pode ver. Usa primeiro a
 * AÇÃO (campo estruturado) e, para o texto livre, só padrões conhecidos dos
 * gravadores (api/documentos, api/exames, api/arquivos, Receitas.tsx,
 * lgpd.ts). Ação conhecida com texto fora do padrão → texto genérico (nunca
 * devolve o original).
 */
export function detalheAuditoriaAdmin(acao: string, detalhes: string | null | undefined): string | undefined {
  if (detalhes == null) return undefined;
  switch (acao) {
    case "DOCUMENTO_EMITIDO": {
      const m = ROTULO_EMISSAO.exec(detalhes);
      // Grupo 2 é guloso: o paciente é o que vem depois do ÚLTIMO " para "
      // (o título pode conter "para": "Atestado para fins escolares").
      if (m) return `Emissão de ${m[1].toLowerCase()} para ${m[3]} (título omitido)`;
      return `Documento emitido ${DETALHE_OMITIDO}`;
    }
    case "DOCUMENTO_VISUALIZADO":
    case "DOCUMENTO_PDF_BAIXADO": {
      const m = DOC_CLIENTE.exec(detalhes);
      const base = acao === "DOCUMENTO_VISUALIZADO" ? "Visualização" : "Download PDF";
      if (m) return `${base}: ${rotuloTipoDocumento(m[2])} (título omitido)`;
      if (/\(título não registrado\)$/.test(detalhes)) return detalhes; // já gravado sem título
      return `${base} de documento ${DETALHE_OMITIDO}`;
    }
    case "EXAME_REGISTRADO": {
      const m = EXAME_MANUAL.exec(detalhes);
      return m ? `Exame registrado manualmente (${m[1]} resultados)` : `Exame registrado ${DETALHE_OMITIDO}`;
    }
    case "ARQUIVO_ENVIADO": {
      const m = ARQUIVO_ENVIADO.exec(detalhes);
      if (!m) return `Arquivo enviado ${DETALHE_OMITIDO}`;
      const [, nome, tipo, kb, resto] = m;
      return `${nomeArquivoAdmin(tipo, nome)} (${rotuloTipoArquivo(tipo)}, ${kb}KB)${resto}`;
    }
    case "LGPD_STORAGE_REMOCAO_PENDENTE": {
      try {
        const j = JSON.parse(detalhes) as { paths?: unknown };
        if (j && Array.isArray(j.paths)) {
          return JSON.stringify({ ...j, paths: j.paths.map((p) => (typeof p === "string" ? caminhoStorageAdmin(p) : p)) });
        }
      } catch {
        /* texto fora do formato: genérico abaixo */
      }
      return `Remoção pendente no Storage ${DETALHE_OMITIDO}`;
    }
    default: {
      const med = MEDICAO_ANTIGA.exec(detalhes);
      if (med) return `Medição de ${med[1]} registrada (valores omitidos)`;
      return RESUMO_ANTIGO.test(detalhes) ? detalhes.replace(RESUMO_ANTIGO, " — resumo omitido") : detalhes;
    }
  }
}

/** Linha de auditoria (wire do bootstrap) mascarada para o admin. */
export function auditoriaParaAdmin<T extends { acao: string; detalhes?: string }>(l: T): T {
  return { ...l, detalhes: detalheAuditoriaAdmin(l.acao, l.detalhes) };
}
