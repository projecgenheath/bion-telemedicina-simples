/**
 * Fidelização de pacientes — funções PURAS (sem React, sem store), para
 * poderem ser testadas isoladamente. Item 33 da auditoria de melhorias.
 *
 * Tudo é derivado das consultas que o cliente JÁ carrega (nenhuma chamada
 * nova): os segmentos dizem em que pé está o vínculo do paciente com o
 * médico, para a lista deixar de ser só "lista + busca" e virar uma fila
 * de relacionamento. Toda conta de "dias" usa o DIA DE CALENDÁRIO no fuso
 * da clínica (America/Sao_Paulo), como o restante do app — nunca o fuso do
 * navegador nem a diferença bruta de milissegundos.
 */
import { isoDia } from "@/components/bion/paciente/agenda-medico";
import type { Consulta } from "@/lib/bion-tipos";

/** Janela de "acompanhamento ativo": última consulta concluída há até isto. */
export const DIAS_ACOMPANHAMENTO = 90;
/** Acima disto (e sem consulta futura), o paciente é considerado inativo. */
export const DIAS_INATIVIDADE = 90;
/** Primeira consulta há até isto (ou já agendada) = paciente novo. */
export const DIAS_NOVO = 30;

export type SegmentoPaciente = "retorno" | "acompanhamento" | "inativo" | "novo";
export type FiltroSegmento = SegmentoPaciente | "todos";

/** Chips da lista de pacientes, na ordem de exibição. */
export const SEGMENTOS_FILTRO: { id: FiltroSegmento; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "retorno", rotulo: "Com retorno próximo" },
  { id: "acompanhamento", rotulo: "Acompanhamento ativo" },
  { id: "inativo", rotulo: "Inativos" },
  { id: "novo", rotulo: "Novos" },
];

/** Mensagem de lista vazia para cada filtro (sem busca digitada). */
export const VAZIO_POR_SEGMENTO: Record<FiltroSegmento, string> = {
  todos: "Nenhum paciente encontrado.",
  retorno: "Nenhum paciente com retorno próximo no momento.",
  acompanhamento: "Nenhum paciente em acompanhamento ativo no momento.",
  inativo: "Nenhum paciente inativo no momento — bom sinal.",
  novo: "Nenhum paciente novo nos últimos 30 dias.",
};

type ConsultaMin = Pick<Consulta, "ts" | "status">;

const MS_DIA = 86_400_000;

/**
 * Diferença em DIAS DE CALENDÁRIO (fuso da clínica) entre dois instantes:
 * compara o isoDia dos dois, então 23:59 → 00:01 do dia seguinte conta 1
 * dia, e o resultado não depende da hora nem do fuso do processo.
 */
export function diferencaDiasClinica(deTs: number, ateTs: number): number {
  return Math.round((Date.parse(isoDia(ateTs)) - Date.parse(isoDia(deTs))) / MS_DIA);
}

/** ts da última consulta CONCLUÍDA (o atendimento que de fato aconteceu); null se nunca houve. */
export function ultimaConcluidaEm(consultas: ConsultaMin[]): number | null {
  let maior: number | null = null;
  for (const c of consultas) {
    if (c.status === "concluida" && (maior === null || c.ts > maior)) maior = c.ts;
  }
  return maior;
}

/** ts da primeira consulta NÃO cancelada (a estreia do vínculo); null se nenhuma. */
export function primeiraConsultaEm(consultas: ConsultaMin[]): number | null {
  let menor: number | null = null;
  for (const c of consultas) {
    if (c.status !== "cancelada" && (menor === null || c.ts < menor)) menor = c.ts;
  }
  return menor;
}

/** Dias (calendário da clínica) desde a última consulta concluída; null se nunca houve uma. */
export function diasDesdeUltimaConsulta(consultas: ConsultaMin[], agora: number): number | null {
  const ultima = ultimaConcluidaEm(consultas);
  return ultima === null ? null : Math.max(0, diferencaDiasClinica(ultima, agora));
}

/**
 * Segmentos do paciente — predicados INDEPENDENTES (um paciente pode estar
 * em mais de um: novo + acompanhamento, retorno + acompanhamento), exceto
 * "inativo", que por definição exclui quem tem consulta futura:
 *  - retorno: tem consulta futura ativa (`temProxima`, a mesma noção de
 *    `proxima` de pacientesOrdenados/metricas);
 *  - acompanhamento: última concluída há até 90 dias;
 *  - inativo: última concluída há MAIS de 90 dias e nenhuma futura;
 *  - novo: primeira consulta (não cancelada) há até 30 dias — ou já
 *    agendada para o futuro: quem acabou de entrar no vínculo é novo,
 *    mesmo que a primeira consulta ainda não tenha acontecido.
 * Sem consulta concluída, não há acompanhamento nem inatividade (falta e
 * cancelamento não são atendimento).
 */
export function segmentosDoPaciente(
  consultas: ConsultaMin[],
  temProxima: boolean,
  agora: number,
): SegmentoPaciente[] {
  const segmentos: SegmentoPaciente[] = [];
  if (temProxima) segmentos.push("retorno");
  const dias = diasDesdeUltimaConsulta(consultas, agora);
  if (dias !== null && dias <= DIAS_ACOMPANHAMENTO) segmentos.push("acompanhamento");
  if (dias !== null && dias > DIAS_INATIVIDADE && !temProxima) segmentos.push("inativo");
  const primeira = primeiraConsultaEm(consultas);
  if (primeira !== null && diferencaDiasClinica(primeira, agora) <= DIAS_NOVO) segmentos.push("novo");
  return segmentos;
}

/** Atalho: o paciente está inativo? (última concluída há +90 dias, sem futura.) */
export function ehInativo(consultas: ConsultaMin[], temProxima: boolean, agora: number): boolean {
  return segmentosDoPaciente(consultas, temProxima, agora).includes("inativo");
}

/** "Sem consulta há 1 dia" / "há 45 dias" / "há 3 meses" — para o selo do cartão do inativo. */
export function rotuloSemConsulta(dias: number): string {
  if (dias <= 1) return "Sem consulta há 1 dia";
  if (dias < 60) return `Sem consulta há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "Sem consulta há 1 mês" : `Sem consulta há ${meses} meses`;
}

/**
 * Modelo de reativação pré-preenchido na conversa ao "Propor retorno":
 * o texto só PREENCHE o campo — quem envia é o médico, depois de revisar
 * (mesma regra dos modelos da ConversaPaciente). Personaliza com o
 * primeiro nome do paciente.
 */
export function textoModeloRetorno(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  const saudacao = primeiro ? `Olá, ${primeiro}! ` : "Olá! ";
  return (
    `${saudacao}Faz um tempo desde a nossa última consulta e quis saber como você está. ` +
    "Se fizer sentido para você, podemos agendar um retorno para reavaliar a sua evolução — " +
    "é só agendar pelo app no melhor dia e horário. Cuide-se!"
  );
}
