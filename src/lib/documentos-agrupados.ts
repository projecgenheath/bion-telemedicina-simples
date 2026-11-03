/**
 * Agrupamento de documentos da MESMA emissão (item 25 da auditoria de
 * melhorias médicas): a receita agrupada grava um Documento por
 * medicamento, sem mudar o schema. Para a leitura humana (lista do
 * prontuário, "repetir última receita"), os itens de uma mesma emissão
 * precisam voltar a ser UMA receita.
 *
 * Sinal de "mesma emissão" — conservador de propósito: mesmo tipo
 * (receita), mesmo título, mesmo médico, mesmo paciente, mesma consulta
 * vinculada e `criadoEm` a no máximo JANELA_EMISSAO_MS um do outro.
 * Sem `criadoEm` confiável nos dois, NÃO agrupa: na dúvida, documento
 * avulso — agrupar errado misturaria receitas distintas do paciente.
 *
 * Funções puras, sem efeitos.
 */
import type { Documento } from "@/lib/bion-tipos";

/** Janela que separa uma emissão agrupada de duas emissões distintas. */
export const JANELA_EMISSAO_MS = 120_000;

const ts = (d: Documento): number | null => {
  if (!d.criadoEm) return null;
  const t = Date.parse(d.criadoEm);
  return Number.isFinite(t) ? t : null;
};

/** Os dois documentos nasceram da mesma emissão agrupada? */
export function mesmaEmissaoReceita(a: Documento, b: Documento): boolean {
  if (a.id === b.id) return true;
  if (a.tipo !== "receita" || b.tipo !== "receita") return false;
  if (a.titulo !== b.titulo || a.medico !== b.medico) return false;
  // Paciente por ID quando os dois têm; nome é o último recurso (legado).
  if (a.pacienteId && b.pacienteId) {
    if (a.pacienteId !== b.pacienteId) return false;
  } else if (a.paciente !== b.paciente) {
    return false;
  }
  if ((a.consultaId ?? null) !== (b.consultaId ?? null)) return false;
  const ta = ts(a);
  const tb = ts(b);
  if (ta === null || tb === null) return false;
  return Math.abs(ta - tb) <= JANELA_EMISSAO_MS;
}

/** Todos os itens da emissão da âncora presentes na lista (inclui a âncora), em ordem de criação. */
export function grupoDaEmissao(documentos: Documento[], ancora: Documento): Documento[] {
  return documentos
    .filter((d) => mesmaEmissaoReceita(ancora, d))
    .sort((x, y) => (ts(x) ?? 0) - (ts(y) ?? 0));
}

export type EntradaDocumentoAgrupado = {
  /** Id do primeiro documento da entrada (chave estável p/ a lista). */
  chave: string;
  /** 1 documento = avulso; 2+ = itens de uma mesma emissão agrupada. */
  docs: Documento[];
};

/**
 * Achata uma lista de documentos em entradas exibíveis: itens da mesma
 * emissão viram UMA entrada (na posição do primeiro item encontrado);
 * todo o resto permanece avulso, na ordem original da lista.
 */
export function agruparEmissoes(documentos: Documento[]): EntradaDocumentoAgrupado[] {
  const consumidos = new Set<string>();
  const entradas: EntradaDocumentoAgrupado[] = [];
  for (const d of documentos) {
    if (consumidos.has(d.id)) continue;
    const grupo = grupoDaEmissao(documentos.filter((x) => !consumidos.has(x.id)), d);
    if (grupo.length > 1) {
      for (const g of grupo) consumidos.add(g.id);
      // Na lista, os itens aparecem na ordem em que já estavam.
      const ordenados = documentos.filter((x) => grupo.some((g) => g.id === x.id));
      entradas.push({ chave: d.id, docs: ordenados });
    } else {
      consumidos.add(d.id);
      entradas.push({ chave: d.id, docs: [d] });
    }
  }
  return entradas;
}

/**
 * A receita mais recente do paciente com este médico, JÁ agrupada: os
 * itens da emissão dela (1 quando a última receita foi simples). Base do
 * "repetir última receita" da folha de emissão. Null se não há receita.
 */
export function ultimaReceitaDoPaciente(
  documentos: Documento[],
  pacienteId: string,
  medicoNome: string,
): Documento[] | null {
  const receitas = documentos
    .filter((d) => d.tipo === "receita" && d.pacienteId === pacienteId && d.medico === medicoNome && ts(d) !== null)
    .sort((a, b) => (ts(b) ?? 0) - (ts(a) ?? 0));
  const ancora = receitas[0];
  if (!ancora) return null;
  return grupoDaEmissao(documentos, ancora);
}
