/* ==================================================================== */
/* BION — entrada do paciente na sala de teleconsulta (sem pré-sala).    */
/*                                                                       */
/* Módulo puro (testado em scripts/teste_entrada_sala_paciente.ts).      */
/* A janela vem de lib/janela-sala.ts, a mesma fonte do servidor: a sala */
/* abre 30 min antes do horário e fecha 2 h depois.                      */
/*   - "aberta"  → entrar direto em /consulta?consulta=<id>;             */
/*   - "antes"   → aguardar: botão desativado "A sala abre às HH:MM"     */
/*                 (com a data se for outro dia, horário de São Paulo);  */
/*   - "fechada" → nenhuma entrada.                                      */
/* Pagamento (mesmo critério do servidor, sala/route.ts): consulta       */
/* "em_espera" e não paga NUNCA vira "entrar" — vira "pagamento_pendente"*/
/* (o botão principal vira "nenhum", sem o rótulo enganoso "a sala já   */
/* fechou"). Modo simulado e retorno grátis não caem aqui: ambos nascem */
/* com pago = true. Objetos sem `status` (ex.: o teste do módulo)       */
/* mantêm o comportamento antigo.                                        */
/* ==================================================================== */

import { estadoJanelaSala, janelaSala } from "@/lib/janela-sala";
import { textoForaDaJanela } from "@/lib/teleconsulta-logica";

export type AcaoSala =
  | { tipo: "entrar"; href: string }
  | { tipo: "aguardar"; abreEm: number; rotulo: string }
  | { tipo: "pagamento_pendente"; rotulo: string }
  | { tipo: "nenhuma" };

/** Endereço da sala de uma consulta (lido por app/(bion)/(fullscreen)/consulta/page.tsx). */
export function hrefSala(consultaId: string): string {
  return `/consulta?consulta=${encodeURIComponent(consultaId)}`;
}

/** "A sala abre às 14:30" (hoje) · "A sala abre em 08/10 às 14:30" (outro dia), como na tela da chamada. */
export function rotuloAbertura(abreEm: number, agora: number): string {
  return textoForaDaJanela({ motivo: "antes", abreEm: new Date(abreEm).toISOString() }, agora).titulo;
}

/** O que a sala oferece ao paciente agora, para uma consulta. */
export function acaoSalaPaciente(
  c: { id: string; ts: number; status?: string; pago?: boolean },
  agora: number,
): AcaoSala {
  // Barreira de pagamento ANTES da janela: sem pagar não há entrada, nem
  // "aguardar abertura" — o paciente precisa pagar primeiro, em qualquer
  // instante. Critério idêntico ao do servidor: em_espera && !pago.
  if (c.status === "em_espera" && c.pago !== true) {
    return { tipo: "pagamento_pendente", rotulo: "Pagamento pendente — pague para entrar na sala" };
  }
  const estado = estadoJanelaSala(c.ts, agora);
  if (estado === "aberta") return { tipo: "entrar", href: hrefSala(c.id) };
  if (estado === "antes") {
    const { abreEm } = janelaSala(c.ts);
    return { tipo: "aguardar", abreEm, rotulo: rotuloAbertura(abreEm, agora) };
  }
  return { tipo: "nenhuma" };
}

export type BotaoPrincipal = "sala" | "triagem" | "aguardar" | "nenhum";

/**
 * Botão principal do card da próxima consulta. Prioridade:
 * sala aberta → triagem pendente → aguardar a abertura (desativado) → nenhum.
 * Pagamento pendente nunca vira "sala" (a triagem, se pendente, continua
 * valendo: só a entrada na sala é barrada, não o resto do card).
 */
export function botaoPrincipalProxima(acao: AcaoSala, triagemPendente: boolean): BotaoPrincipal {
  if (acao.tipo === "entrar") return "sala";
  if (triagemPendente) return "triagem";
  return acao.tipo === "aguardar" ? "aguardar" : "nenhum";
}

/**
 * Próximo instante (ms) em que a ação de alguma consulta muda (abertura ou
 * fechamento da sala), para a tela se atualizar sozinha. `null` se nenhum.
 */
export function proximaMudancaSala(tss: number[], agora: number): number | null {
  let prox: number | null = null;
  for (const ts of tss) {
    const { abreEm, fechaEm } = janelaSala(ts);
    // A sala fecha DEPOIS de fechaEm (fechaEm ainda é "aberta").
    for (const t of [abreEm, fechaEm + 1]) {
      if (t > agora && (prox === null || t < prox)) prox = t;
    }
  }
  return prox;
}
