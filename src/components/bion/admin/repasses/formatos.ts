/**
 * Regras e textos da tela de Repasses (funções PURAS, testadas em
 * formatos.teste.ts). As mensagens dos erros 409 espelham as constantes de
 * src/lib/server/repasse.ts (ERRO_*) e http.ts (ERRO_JA_REPASSADO); o texto
 * do servidor é sempre mostrado junto, então nada se perde se ele mudar.
 */
import type { RepasseDetalhe, RepasseLista, Recebimento, ResultadoFechamento } from "./tipos";

export const MAX_COMPROVANTE = 10 * 1024 * 1024; // igual ao PATCH
export const TIPOS_COMPROVANTE = ["application/pdf", "image/png", "image/jpeg"];
export const HORA_FECHAMENTO = 23; // igual a repasse.ts: hoje só fecha a partir das 23:00 (SP)

const ROTULO_PIX: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Celular", aleatoria: "Chave aleatória" };
export const rotuloPixTipo = (t: string | null | undefined) => ROTULO_PIX[String(t ?? "")] ?? "Chave PIX";
export const rotuloTitular = (t: string | null | undefined) => (t === "pj" ? "Pessoa jurídica" : t === "pf" ? "Pessoa física" : "Titular");

/** CPF (11) → 000.000.000-00; CNPJ (14, inclusive alfanumérico) → 00.000.000/0000-00. Outro formato: como veio. */
export function formatarDocumento(doc: string | null | undefined): string {
  const d = String(doc ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (/^\d{11}$/.test(d)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (/^[0-9A-Z]{12}\d{2}$/.test(d)) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return String(doc ?? "") || "—";
}

/** Chave PIX legível (o valor que vai ao servidor continua o cru). */
export function formatarChavePix(tipo: string | null | undefined, chave: string | null | undefined): string {
  const c = String(chave ?? "");
  if (!c) return "—";
  if (tipo === "cpf" || tipo === "cnpj") return formatarDocumento(c);
  const tel = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(c);
  if (tipo === "telefone" && tel) return `+55 (${tel[1]}) ${tel[2]}-${tel[3]}`;
  return c;
}

export const rotuloItem = (tipo: string) =>
  tipo === "consulta" ? "Consulta" : tipo === "multa_cancelamento" ? "Multa de cancelamento" : tipo === "multa_remarcacao" ? "Multa de remarcação" : tipo;
export const rotuloAjuste = (motivo: string) =>
  motivo === "reembolso" ? "Reembolso ao paciente" : motivo === "saldo_anterior" ? "Saldo de desconto anterior" : motivo;

/** Pode pagar? Sem chave, CNPJ divergente, zerado ou já pago bloqueiam (o servidor recusa os mesmos casos). */
export function podePagar(r: Pick<RepasseLista | RepasseDetalhe, "status" | "liquidoCentavos" | "recebimento">): { ok: true } | { ok: false; motivo: string } {
  if (r.status !== "fechado") return { ok: false, motivo: "Esse repasse já foi pago." };
  if (r.liquidoCentavos <= 0) return { ok: false, motivo: "Esse repasse não tem valor a pagar." };
  if (!r.recebimento) return { ok: false, motivo: "O médico ainda não cadastrou a chave PIX." };
  if (r.recebimento.cnpjDivergente)
    return { ok: false, motivo: "CNPJ da conta PIX diferente do CNPJ do perfil. Peça para o médico atualizar o recebimento antes de pagar." };
  return { ok: true };
}

/** Confirmações exigidas no passo 1 (a 2ª só quando a chave mudou nas últimas 24 h). */
export function confirmacoesNecessarias(rec: Recebimento | null): ("conferi" | "troca")[] {
  if (!rec) return [];
  return rec.chaveTrocadaRecente ? ["conferi", "troca"] : ["conferi"];
}

/** Valida o arquivo ANTES de enviar (o servidor confere de novo pelos bytes). */
export function validarComprovante(f: { size: number; type: string; name: string } | null): string | null {
  if (!f || f.size === 0) return "Anexe o comprovante do PIX.";
  if (f.size > MAX_COMPROVANTE) return "O comprovante pode ter até 10 MB.";
  const porNome = /\.(pdf|png|jpe?g)$/i.test(f.name);
  if (!TIPOS_COMPROVANTE.includes(f.type) && !porNome) return "O comprovante precisa ser PDF, PNG ou JPG.";
  return null;
}

export function tamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export type ErroExplicado = {
  titulo: string;
  texto: string;
  /** O que a tela faz: recarregar o detalhe e voltar ao passo 1, voltar ao comprovante, só mostrar. */
  acao: "reconferir" | "recarregar" | "comprovante" | "nenhuma";
  bloqueia: boolean;
};

/** Traduz a resposta de erro do PATCH de pagamento em uma mensagem clara e no próximo passo. */
export function explicarErroPagamento(status: number, erroServidor: string | null | undefined): ErroExplicado {
  const msg = String(erroServidor ?? "").trim();
  const tem = (t: string) => msg.toLowerCase().includes(t.toLowerCase());
  if (status === 409 && tem("chave PIX do médico mudou"))
    return { titulo: "A chave PIX mudou", texto: "O médico trocou a chave depois que você abriu a tela. Recarregamos os dados: confira a chave nova antes de pagar.", acao: "reconferir", bloqueia: false };
  if (status === 409 && tem("CNPJ"))
    return { titulo: "CNPJ divergente: pagamento bloqueado", texto: msg || "A conta PIX é de pessoa jurídica com um CNPJ diferente do perfil do médico. Peça para o médico atualizar o recebimento.", acao: "recarregar", bloqueia: true };
  if (status === 409 && tem("não cadastrou a chave PIX"))
    return { titulo: "Médico sem chave PIX", texto: msg, acao: "recarregar", bloqueia: true };
  if (status === 409 && (tem("já foi marcado como pago") || tem("não existe")))
    return { titulo: "Esse repasse já não está a pagar", texto: "Ele pode ter sido pago por outra pessoa agora há pouco. Recarregamos a lista.", acao: "recarregar", bloqueia: true };
  if (status === 409 && tem("não tem valor a pagar"))
    return { titulo: "Repasse sem valor a pagar", texto: msg, acao: "recarregar", bloqueia: true };
  if (status === 409 && tem("já entrou num repasse"))
    return { titulo: "Registro já repassado", texto: msg, acao: "recarregar", bloqueia: true };
  if (status === 400 && (tem("comprovante") || tem("PDF")))
    return { titulo: "Confira o comprovante", texto: msg, acao: "comprovante", bloqueia: false };
  if (status === 400) return { titulo: "Não foi possível pagar", texto: msg || "Dados inválidos.", acao: "reconferir", bloqueia: false };
  if (status === 404) return { titulo: "Repasse não encontrado", texto: msg || "Ele pode ter sido removido.", acao: "recarregar", bloqueia: true };
  if (status === 403 || status === 401) return { titulo: "Sem permissão", texto: "Entre de novo com uma conta de administrador.", acao: "nenhuma", bloqueia: true };
  if (status === 503) return { titulo: "Envio de comprovantes indisponível", texto: msg || "O armazenamento de comprovantes não está configurado no servidor.", acao: "nenhuma", bloqueia: false };
  if (status === 0) return { titulo: "Sem conexão", texto: "Não conseguimos falar com o servidor. Nada foi pago; tente de novo.", acao: "nenhuma", bloqueia: false };
  return { titulo: "Não foi possível pagar", texto: msg || `O servidor respondeu ${status}. Nada foi alterado.`, acao: "nenhuma", bloqueia: false };
}

/* ---------------- Fechar agora ---------------- */

/** Mesma regra do servidor (validarCompetenciaParaFechar): dia real, não futuro; hoje só a partir das 23:00 (SP). */
export function validarCompetencia(dia: string, hojeSP: string, horaSP: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(`${dia}T12:00:00Z`))) return "Use uma data real.";
  if (dia > hojeSP) return "Não dá para fechar um dia que ainda não chegou.";
  if (dia === hojeSP && horaSP < HORA_FECHAMENTO) return `O dia de hoje só pode ser fechado a partir das ${HORA_FECHAMENTO}:00.`;
  return null;
}

export function resumoFechamento(resultados: ResultadoFechamento[]) {
  const conta = { fechado: 0, ja_fechado: 0, sem_itens: 0, erro: 0 };
  let liquido = 0;
  for (const r of resultados) {
    conta[r.situacao]++;
    if (r.situacao === "fechado") liquido += r.liquidoCentavos ?? 0;
  }
  return { ...conta, liquidoCentavos: liquido };
}

/** Agrupa por competência mantendo a ordem do servidor (a pagar: mais antiga primeiro). */
export function agruparPorCompetencia<T extends { competencia: string }>(lista: T[]): { competencia: string; itens: T[] }[] {
  const grupos: { competencia: string; itens: T[] }[] = [];
  for (const r of lista) {
    const g = grupos.find((x) => x.competencia === r.competencia);
    if (g) g.itens.push(r);
    else grupos.push({ competencia: r.competencia, itens: [r] });
  }
  return grupos;
}
