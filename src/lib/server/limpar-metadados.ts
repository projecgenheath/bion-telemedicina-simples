/**
 * Remove metadados embutidos de FOTOS antes de enviar o laudo à IA externa,
 * sem dependências novas e sem recodificar a imagem.
 *
 * - JPEG: tira os segmentos APP1..APP15 (EXIF com GPS/aparelho/data, XMP,
 *   IPTC/Photoshop etc.) e COM (comentário). Mantém APP0 (JFIF) e tudo que a
 *   imagem precisa para ser decodificada. A orientação EXIF também sai, então
 *   a foto pode chegar girada para a IA — o OCR do Gemini lida com isso.
 * - PNG: tira os chunks tEXt, zTXt, iTXt, eXIf e tIME.
 * - Outros formatos (PDF, HEIC, WebP…): devolvidos sem mudança. O PDF NÃO é
 *   limpo (exigiria biblioteca de PDF): metadados como autor/título seguem.
 *
 * Isso não tira nada do CONTEÚDO visível (nome, CPF impressos no laudo).
 * Qualquer estrutura inesperada → devolve o original (nunca corrompe).
 *
 * Arquivo puro (sem "server-only") para os testes.
 */

/** `aviso` preenchido quando a foto tinha estrutura inesperada e foi devolvida SEM limpeza. */
export type ResultadoLimpeza = { bytes: Uint8Array; removidos: number; aviso?: string };

export function limparMetadadosImagem(mime: string, entrada: Uint8Array): ResultadoLimpeza {
  try {
    if (mime === "image/jpeg" || mime === "image/jpg") return comAviso(limparJpeg(entrada), entrada, "jpeg");
    if (mime === "image/png") return comAviso(limparPng(entrada), entrada, "png");
  } catch {
    return { bytes: entrada, removidos: 0, aviso: "erro_leitura" };
  }
  return { bytes: entrada, removidos: 0 };
}

/** O limpador devolveu o PRÓPRIO original (mesmo objeto) só quando desistiu. */
function comAviso(r: ResultadoLimpeza, entrada: Uint8Array, tipo: string): ResultadoLimpeza {
  return r.bytes === entrada ? { ...r, aviso: `${tipo}_estrutura_inesperada` } : r;
}

function limparJpeg(b: Uint8Array): ResultadoLimpeza {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { bytes: b, removidos: 0 };
  const partes: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let removidos = 0;
  while (i < b.length) {
    if (b[i] !== 0xff) return { bytes: b, removidos: 0 };
    const marcador = b[i + 1];
    // SOS: daqui em diante é a imagem comprimida — copia tudo.
    if (marcador === 0xda) {
      partes.push(b.subarray(i));
      break;
    }
    // Marcadores sem tamanho (RSTn, TEM, preenchimento 0xFF).
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    if ((marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      partes.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marcador === 0xd9) {
      partes.push(b.subarray(i, i + 2));
      break;
    }
    if (i + 4 > b.length) return { bytes: b, removidos: 0 };
    const tamanho = (b[i + 2] << 8) | b[i + 3];
    const fim = i + 2 + tamanho;
    if (tamanho < 2 || fim > b.length) return { bytes: b, removidos: 0 };
    const metadado = (marcador >= 0xe1 && marcador <= 0xef) || marcador === 0xfe;
    if (metadado) removidos++;
    else partes.push(b.subarray(i, fim));
    i = fim;
  }
  return { bytes: juntar(partes), removidos };
}

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHUNKS_PNG_REMOVER = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function limparPng(b: Uint8Array): ResultadoLimpeza {
  if (b.length < 8 || ASSINATURA_PNG.some((v, k) => b[k] !== v)) return { bytes: b, removidos: 0 };
  const partes: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let removidos = 0;
  while (i < b.length) {
    if (i + 12 > b.length) return { bytes: b, removidos: 0 };
    const tamanho = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const tipo = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const fim = i + 12 + tamanho;
    if (fim > b.length) return { bytes: b, removidos: 0 };
    if (CHUNKS_PNG_REMOVER.has(tipo)) removidos++;
    else partes.push(b.subarray(i, fim));
    i = fim;
    if (tipo === "IEND") break;
  }
  return { bytes: juntar(partes), removidos };
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
