import { db } from "@/lib/db";
import { ROTULO_TIPO, lerTiposPedido } from "@/lib/saude-paciente";
import type { NotifPayload } from "./dados";

/**
 * Notificações de RESULTADO ao médico (item 13 da auditoria de melhorias).
 *
 * Fecha o ciclo "pedi → paciente mediu/postou → eu fiquei sabendo": antes,
 * pedido de medição atendido e exame postado tinham side-effects vazios.
 *
 * Tipo "exame": NotifTipo é uma união FECHADA nas UIs (clássica e admin
 * indexam ícone/rótulo/destino pelo tipo) — um tipo novo quebraria essas
 * telas; "exame" é a gaveta de resultados que já existe. O título do
 * payload é quem diz do que se trata.
 *
 * Sem push aqui: o mecanismo de web push é da frente de notificações; estas
 * funções só montam o payload — quem cria (com broadcast ao tópico privado
 * do médico) é o aplicarSideEffects das rotas, como nas demais notificações.
 */

/** Paciente respondeu a um pedido de medição: o médico do pedido é direto
 *  (PedidoMedicao.medicoId), sem heurística. */
export function notificacaoPedidoAtendido(
  pacienteNome: string,
  medicoId: string,
  tiposJson: string,
): NotifPayload {
  const rotulos = lerTiposPedido(tiposJson).map((t) => ROTULO_TIPO[t]);
  return {
    tipo: "exame",
    titulo: "Medições recebidas",
    texto: `${pacienteNome} respondeu ao seu pedido de medição${
      rotulos.length ? ` (${rotulos.join(", ")})` : ""
    }. Veja em Pacientes → Resultados para revisar.`,
    usuarioId: medicoId,
  };
}

/**
 * Paciente postou um exame (manual ou laudo pela BION IA). ExameLaboratorial
 * NÃO tem vínculo com consulta/médico no schema, então o destinatário é o
 * médico da consulta NÃO cancelada mais recente do paciente (o vínculo
 * atual). Sem consulta válida, ninguém é notificado (devolve null).
 */
export async function notificacaoNovoExame(
  paciente: { id: string; nome: string },
  rotuloExame: string,
): Promise<NotifPayload | null> {
  const consulta = await db.consulta.findFirst({
    where: { pacienteId: paciente.id, status: { not: "cancelada" } },
    orderBy: { dataInicio: "desc" },
    select: { medicoId: true },
  });
  if (!consulta) return null;
  return {
    tipo: "exame",
    titulo: "Novo exame do paciente",
    texto: `${paciente.nome} adicionou o exame "${rotuloExame}" à linha do tempo. Veja em Pacientes → Resultados para revisar.`,
    usuarioId: consulta.medicoId,
  };
}
