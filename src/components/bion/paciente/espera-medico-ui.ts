/**
 * Espera do médico na tela da chamada do PACIENTE — regras PURAS de exibição
 * (sem React, sem fetch), testadas em espera-medico-ui.teste.ts.
 *
 * Contrato do servidor (lib/server/espera-medico.ts, rotas em
 * /api/telemedicina/[consultaId]/espera*):
 *  - GET .../espera → { espera: EsperaWire | null }
 *  - POST .../espera/cancelar → reembolso integral (só com a espera expirada)
 *  - POST .../espera/remarcar { medicoId, diferencaEsperadaCentavos }
 *  - POST .../espera/desistir-remarcacao
 *  Falhas: { erro, codigo, ...extra } (o front decide por `codigo`).
 */

export type StatusEsperaWire = "aguardando" | "medico_entrou" | "expirada" | "remarcando" | "cancelada" | "remarcada";

export type EsperaWire = {
  consultaId: string;
  status: StatusEsperaWire;
  iniciadaEm: string;
  expiraEm: string;
  segundosRestantes: number;
  reservaExpiraEm: string | null;
  podeEscolher: boolean;
  consultaNovaId: string | null;
  diferencaCentavos: number | null;
  resolvidoEm: string | null;
};

export type CobrancaEspera = {
  pagamentoId: string;
  valorCentavos: number;
  status: string;
  reservaExpiraEm: string | null;
  /** Só cartão (checkout Stripe). */
  metodo: "cartao";
  /** Flag Stripe ligada: a tela mostra o botão Pagar. */
  pagarComCartao: boolean;
};

export type MedicoLivre = {
  id: string;
  nome: string;
  especialidade: string;
  foto: string | null;
  avaliacao: number | null;
  valorConsultaCentavos: number;
  diferencaCentavos: number | null;
};

/** Segundos até `iso` (0 depois de passar). */
export function segundosAte(iso: string | null, agoraMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - agoraMs) / 1000));
}

/** "MM:SS" (nunca negativo). */
export function formatarContagem(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Leitura amigável para leitor de tela ("9 minutos e 5 segundos"). */
export function contagemFalada(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const pm = m === 1 ? "1 minuto" : `${m} minutos`;
  const ps = r === 1 ? "1 segundo" : `${r} segundos`;
  if (m === 0) return ps;
  return r === 0 ? pm : `${pm} e ${ps}`;
}

const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Diferença de preço como o paciente vê: > 0 paga, < 0 recebe de volta. */
export function textoDiferenca(diferencaCentavos: number): { curto: string; detalhe: string; acao: "cobrar" | "devolver" | "nada" } {
  const d = Math.round(diferencaCentavos);
  if (d > 0) {
    return {
      curto: `+ ${brl(d)}`,
      detalhe: `Você paga a diferença de ${brl(d)} com cartão. A consulta atual só é cancelada depois que o pagamento for confirmado; o novo horário fica reservado por 10 minutos.`,
      acao: "cobrar",
    };
  }
  if (d < 0) {
    return {
      curto: `− ${brl(-d)}`,
      detalhe: `Você recebe de volta ${brl(-d)}, a diferença para o valor que já pagou.`,
      acao: "devolver",
    };
  }
  return { curto: "Mesmo valor", detalhe: "Mesmo valor da consulta atual. Não há nada a pagar.", acao: "nada" };
}

/** O painel da espera aparece sobre a chamada? (some quando o médico entra ou não há espera). */
export function mostrarPainelEspera(espera: EsperaWire | null, medicoConectado: boolean): boolean {
  if (!espera || medicoConectado) return false;
  return espera.status !== "medico_entrou";
}

/** Mensagem para cada `codigo` de falha das rotas da espera. */
export function mensagemErroEspera(codigo: string | undefined, erro?: string): string {
  switch (codigo) {
    case "espera_nao_expirada":
      return "Ainda estamos dentro dos 10 minutos de espera. Aguarde um pouco mais.";
    case "medico_entrou":
      return "O médico acabou de entrar. A consulta vai começar.";
    case "medico_indisponivel":
      return "Esse médico não está mais livre agora. Escolha outro.";
    case "preco_mudou":
      return "O valor mudou. Confira a nova diferença antes de confirmar.";
    case "remarcando":
      return "Já existe uma remarcação esperando o pagamento.";
    case "pagamento_confirmado":
      return "O pagamento já foi confirmado. Sua consulta foi remarcada.";
    case "pagamento_indisponivel":
      return "Pagamento online indisponível no momento. Tente de novo mais tarde.";
    case "sem_remarcacao":
      return "Não há remarcação esperando pagamento.";
    case "espera_resolvida":
    case "consulta_encerrada":
      return "Esta consulta já foi resolvida.";
    case "nao_pago":
      return "Esta consulta não tem pagamento confirmado.";
    case "acesso_negado":
      return "Você não tem acesso a esta consulta.";
    case "nao_encontrada":
    case "sem_espera":
      return "Não encontramos a espera desta consulta.";
    default:
      return erro && erro.length < 140 && !/[_]/.test(erro) ? erro : "Não foi possível concluir agora. Tente de novo.";
  }
}
