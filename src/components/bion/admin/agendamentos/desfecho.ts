/**
 * Desfecho da consulta na tela do admin — funções PURAS (testadas em
 * agenda.teste.ts). O desfecho oficial é do servidor (desfechoDaConsulta em
 * lib/server/financeiro.ts); aqui é só o rótulo a partir do que o store já
 * traz (status, falta, motivoReagendamento, motivoCancelamento) e os textos
 * da prévia que vem de GET /api/admin/consultas/[id]/corrigir-desfecho.
 */
import type { Consulta } from "@/lib/bion-tipos";
import type { Estado, Tom } from "../rotulos";
import { brl } from "../tempo";

export type DesfechoAlvo = "realizada" | "falta_paciente" | "falha_tecnica" | "falta_medico";
export type DesfechoAtual = DesfechoAlvo | "sem_desfecho" | "encerrada";
export type EfeitoDinheiro = "sem_pagamento" | "nenhum" | "entra_no_proximo_repasse" | "sai_do_repasse" | "desconto_se_reembolso";

/** Formato do GET /api/admin/consultas/[id]/corrigir-desfecho (só o que a tela usa). */
export type PlanoWire = {
  atual: DesfechoAtual;
  novo: DesfechoAlvo;
  statusAntes: string;
  statusDepois: string;
  efeitos: string[];
  reembolsosEncerrados: { id: string; status: string; valorCentavos: number }[];
  notificarMedico: boolean;
  dinheiro: {
    efeito: EfeitoDinheiro;
    pagoConfirmado: boolean;
    valorCentavos: number;
    liquidoMedicoCentavos: number;
    medicoRecebiaAntes: boolean;
    medicoRecebeDepois: boolean;
    repasse: { id: string; competencia: string; status: string } | null;
  };
};
export type OpcaoWire = { novo: DesfechoAlvo; rotulo: string; ok: true; plano: PlanoWire } | { novo: DesfechoAlvo; rotulo: string; ok: false; erro: string };
export type PreviaDesfechoWire = {
  consulta: { id: string; especialidade: string; dataInicio: string; status: string; pago: boolean; valor: number; medico: string; paciente: string };
  atual: DesfechoAtual;
  rotuloAtual: string;
  motivoMin: number;
  motivoMax: number;
  opcoes: OpcaoWire[];
};

const ABERTOS: Consulta["status"][] = ["confirmada", "em_espera", "pendente_anamnese"];

/** Rótulo do desfecho a partir do store (null = consulta futura, ainda sem o que mostrar). */
export function desfechoNoStore(c: Pick<Consulta, "status" | "ts" | "falta" | "motivoReagendamento" | "motivoCancelamento">, agora: number): Estado | null {
  if (c.falta) return { rotulo: "Falta do paciente", tom: "atencao" };
  if (c.motivoReagendamento === "falha_tecnica") return { rotulo: "Falha técnica", tom: "critico" };
  if (c.motivoReagendamento === "falta_medico") return { rotulo: "Falta do médico", tom: "critico" };
  if (c.status === "concluida") return { rotulo: "Realizada", tom: "ok" };
  if (c.status === "cancelada") {
    const m = c.motivoCancelamento ?? "";
    if (m.startsWith("Falha técnica")) return { rotulo: "Falha técnica", tom: "critico" };
    if (m.startsWith("O médico não compareceu")) return { rotulo: "Falta do médico", tom: "critico" };
    return null;
  }
  if (ABERTOS.includes(c.status) && Number.isFinite(c.ts) && c.ts <= agora) return { rotulo: "Sem desfecho", tom: "atencao" };
  return null;
}

/** O botão "Corrigir desfecho" aparece para consulta que já começou (o servidor explica se não der). */
export const podeCorrigirDesfecho = (c: Pick<Consulta, "ts">, agora: number) => Number.isFinite(c.ts) && c.ts <= agora;

/** Destaque do dinheiro na prévia: valor, frase curta e tom. */
export function destaqueDinheiro(d: PlanoWire["dinheiro"]): { valor: string; legenda: string; tom: Tom } {
  const v = brl(d.liquidoMedicoCentavos);
  switch (d.efeito) {
    case "entra_no_proximo_repasse":
      return { valor: `+ ${v}`, legenda: "para o médico no próximo fechamento (23:30)", tom: "dinheiro" };
    case "sai_do_repasse":
      return { valor: `− ${v}`, legenda: "sai do próximo fechamento do médico", tom: "critico" };
    case "desconto_se_reembolso":
      return { valor: `até − ${v}`, legenda: "desconto no próximo repasse, só se o paciente escolher o reembolso", tom: "atencao" };
    case "sem_pagamento":
      return { valor: "—", legenda: "consulta sem pagamento confirmado", tom: "neutro" };
    default:
      return { valor: "Sem mudança", legenda: d.medicoRecebeDepois ? `o médico continua com ${v}` : "o médico não recebe por esta consulta", tom: "neutro" };
  }
}

/** Frase da caixa de confirmação (o que o admin está aceitando). */
export function textoConfirmacao(p: PlanoWire): string {
  const quem = p.notificarMedico ? "o paciente e o médico serão avisados" : "o paciente será avisado";
  return `Revisei o efeito no dinheiro: corrigir para "${ROTULO_ALVO[p.novo]}" não tem "Desfazer" e ${quem}.`;
}

export const ROTULO_ALVO: Record<DesfechoAlvo, string> = {
  realizada: "Realizada",
  falta_paciente: "Falta do paciente",
  falha_tecnica: "Falha técnica",
  falta_medico: "Falta do médico",
};

export function validarMotivoCorrecao(motivo: string, min = 10): string | null {
  return motivo.trim().length < min ? `Explique o motivo com pelo menos ${min} caracteres (fica na auditoria).` : null;
}
