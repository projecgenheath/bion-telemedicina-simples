/**
 * Funil público: perfil da médica → agenda dela → cadastro → pagamento.
 * O download do app fica de fora daqui (é opcional, na tela seguinte).
 * Sem banco e sem segredo. O servidor continua decidindo preço, vaga e cobrança.
 */

import type { Consulta, Medico } from "@/lib/bion-tipos";

const CHAVE_ESCOLHA = "bion-agendar-publico";
const CHAVE_SEGUIR = "bion-agendar-seguir";

/** Só o caminho do funil desta médica. Rejeita URL externa e qualquer outra rota. */
const CAMINHO_VOLTA = /^\/p\/[A-Za-z0-9_-]{1,80}\/agendar$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export type EscolhaAgenda = {
  medicoId: string;
  /** Rótulo que o servidor já entende: "Hoje", "Amanhã" ou "D Mês". */
  rotulo: string;
  hora: string;
  iso: string;
};

export type AgendaPublica = {
  id: string;
  nome: string;
  especialidade: string;
  crm: string;
  valor: number;
  foto?: string;
  horariosDisponiveis: string[];
  horariosPorDia: Record<string, string[]>;
  diasAtendimento: number[];
  pausasSemanais: { dia: number; inicio: string; fim: string }[];
  diasBloqueados: string[];
  ocupadosIso: string[];
};

/** Para onde ir depois do login ou do cadastro. Paciente volta só para a agenda que pediu. */
export function destinoDepoisDeEntrar(role: string | undefined, voltar: string | null | undefined): string {
  if (role === "paciente" && voltar && CAMINHO_VOLTA.test(voltar)) return voltar;
  if (role === "paciente") return "/paciente";
  if (role === "medico") return "/medico";
  return "/painel";
}
