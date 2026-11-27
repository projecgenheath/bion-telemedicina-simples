/* ==================================================================== */
/* Etapa 3 do redesign do paciente: mensagens, documentos, saúde e      */
/* exames. Funções puras sobre o que o cliente já tem (store); nada de  */
/* dado inventado. Datas e horas sempre no fuso da clínica.             */
/* ==================================================================== */

import { partesFusoClinica, type Documento, type ExameLab, type Mensagem } from "@/lib/bion-tipos";
import { receitaControlada } from "@/lib/atendimento-tipo";

const dois = (n: number) => String(n).padStart(2, "0");

/** "24/11/2026" (fuso da clínica); "" se a data não for válida. */
export function dataBR(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const p = partesFusoClinica(v);
  if (Number.isNaN(p.ano)) return "";
  return `${dois(p.dia)}/${dois(p.mes + 1)}/${p.ano}`;
}

/* ------------------------------ Documentos ------------------------------ */

export const documentoCanceladoPaciente = (d: Pick<Documento, "status"> | null | undefined) => d?.status === "cancelado";

/** Selo do documento cancelado pelo médico: "Cancelado em 22/11/2026" (sem data: "Cancelado"). */
export function seloCancelado(d: Pick<Documento, "status" | "canceladoEm"> | null | undefined): string | null {
  if (!documentoCanceladoPaciente(d)) return null;
  const data = dataBR(d?.canceladoEm ?? null);
  return data ? `Cancelado em ${data}` : "Cancelado";
}

/**
 * Aviso de renovação bloqueada de uma receita (mesmas regras de
 * podeRenovarReceita): cancelada pelo médico, sem o nome do remédio ou
 * medicamento controlado. null = pode pedir renovação.
 */
export function avisoRenovacaoBloqueada(
  d: Pick<Documento, "tipo" | "status" | "medicamento" | "controlado" | "posologia" | "conteudo" | "observacoes" | "titulo">,
): string | null {
  if (d.tipo !== "receita") return null;
  if (d.status === "cancelado") return "Renovação bloqueada: esta receita foi cancelada pelo médico.";
  if (!d.medicamento?.trim()) return "Renovação só em consulta: a receita não traz o nome do medicamento.";
  if (receitaControlada(d)) return "Renovação só em consulta: medicamento controlado.";
  return null;
}

export type ContagemDocs = { receitas: number; atestados: number; pedidos: number };

/** Quantos documentos válidos (não cancelados) há de cada tipo. */
export function contarDocumentos(docs: Pick<Documento, "tipo" | "status">[]): ContagemDocs {
  const validos = docs.filter((d) => d.status !== "cancelado");
  return {
    receitas: validos.filter((d) => d.tipo === "receita").length,
    atestados: validos.filter((d) => d.tipo === "atestado").length,
    pedidos: validos.filter((d) => d.tipo === "exame" || d.tipo === "exame_solicitado").length,
  };
}

/* ------------------------------ Mensagens ------------------------------- */

const mesmoDia = (a: ReturnType<typeof partesFusoClinica>, b: ReturnType<typeof partesFusoClinica>) =>
  a.ano === b.ano && a.mes === b.mes && a.dia === b.dia;

/** "09:12" hoje, "Ontem", ou "dd/mm" (lista de conversas, como no médico). */
export function horaCurta(ts: number, agora: number): string {
  const p = partesFusoClinica(ts);
  if (mesmoDia(p, partesFusoClinica(agora))) return `${dois(p.hora)}:${dois(p.minuto)}`;
  if (mesmoDia(p, partesFusoClinica(agora - 86_400_000))) return "Ontem";
  return `${dois(p.dia)}/${dois(p.mes + 1)}`;
}

/** Hora do balão: "09:12". */
export function horaMensagem(ts: number): string {
  const p = partesFusoClinica(ts);
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Separador de dia: "Hoje", "Ontem" ou "12 de novembro" (com o ano se for outro). */
export function rotuloDia(ts: number, agora: number): string {
  const c = horaCurta(ts, agora);
  if (c === "Ontem") return "Ontem";
  if (c.includes(":")) return "Hoje";
  const p = partesFusoClinica(ts);
  const ano = partesFusoClinica(agora).ano !== p.ano ? ` de ${p.ano}` : "";
  return `${p.dia} de ${MESES[p.mes]}${ano}`;
}

export const chaveDia = (ts: number) => {
  const p = partesFusoClinica(ts);
  return `${p.ano}-${p.mes}-${p.dia}`;
};

export type LinhaConversa = { m: Mensagem; novoDia: boolean; juntaComProxima: boolean };

/** Balões seguidos da mesma pessoa (até 5 min, mesmo dia) ficam juntos; só o último mostra a hora. */
export function linhasDaConversa(conversa: Mensagem[]): LinhaConversa[] {
  return conversa.map((m, i) => {
    const ant = conversa[i - 1];
    const prox = conversa[i + 1];
    return {
      m,
      novoDia: i === 0 || chaveDia(ant.ts) !== chaveDia(m.ts),
      juntaComProxima: !!prox && prox.deId === m.deId && chaveDia(prox.ts) === chaveDia(m.ts) && prox.ts - m.ts <= 5 * 60_000,
    };
  });
}

export function iniciaisNome(nome: string): string {
  const partes = nome.replace(/^(dra?\.?|dr\.)\s+/i, "").split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

/** Prévia da última mensagem na lista: "Você: …" quando foi o paciente. */
export function previaMensagem(m: Pick<Mensagem, "texto" | "minha"> | undefined): string {
  if (!m) return "Sem mensagens ainda";
  return `${m.minha ? "Você: " : ""}${m.texto.replace(/\s+/g, " ").trim()}`;
}

/* ------------------------------- Exames --------------------------------- */

export type ItemForaRef = { nome: string; valor: number; unidade?: string; acima: boolean };

/** Itens fora da faixa de referência numa coleta. */
export function foraDaReferencia(e: Pick<ExameLab, "itens">): ItemForaRef[] {
  return e.itens
    .filter((i) => (i.refMin !== undefined && i.valor < i.refMin) || (i.refMax !== undefined && i.valor > i.refMax))
    .map((i) => ({ nome: i.nome, valor: i.valor, unidade: i.unidade, acima: i.refMax !== undefined && i.valor > i.refMax }));
}

/** "Normal" ou "Alterado: LDL, HDL" (como a lista de exames da ficha do médico). */
export function situacaoExame(e: Pick<ExameLab, "itens">): { alterado: boolean; texto: string } {
  const fora = foraDaReferencia(e);
  if (fora.length === 0) return { alterado: false, texto: e.itens.length ? "Normal" : "Sem resultados lidos" };
  return { alterado: true, texto: `Alterado: ${fora.map((f) => f.nome).join(", ")}` };
}

/** "20/11" no fuso da clínica (rótulo dos gráficos). */
export const rotuloCurto = (iso: string) => {
  const d = partesFusoClinica(iso);
  return `${dois(d.dia)}/${dois(d.mes + 1)}`;
};

/** Chave de comparação de nomes de analito: sem acento, sem caixa, espaços
 *  normalizados — a extração por IA não garante grafia idêntica entre coletas. */
export const chaveAnalito = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
