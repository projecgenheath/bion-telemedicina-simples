/* ==================================================================== */
/* Contagem regressiva até a próxima consulta (visão do paciente).       */
/* Módulo puro (testado em scripts/teste_contagem_consulta_paciente.ts). */
/* "Hoje" e "amanhã" são calculados no fuso de São Paulo.                */
/* ==================================================================== */

export type Contagem = {
  /** Frase curta para o selo, ex.: "Em 2 dias", "Hoje, em 3 h", "Começa em 12 min". */
  texto: string;
  /** Faltam menos de 60 min (ou já começou): selo em destaque. */
  urgente: boolean;
  /** Já passou do horário (até 2 h depois): "Acontecendo agora". */
  agora: boolean;
};

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Diferença em dias de calendário (fuso SP) entre `agora` e `ts`. */
function diasDeCalendario(ts: number, agora: number): number {
  const a = Date.parse(`${fmtDia.format(agora)}T00:00:00Z`);
  const b = Date.parse(`${fmtDia.format(ts)}T00:00:00Z`);
  return Math.round((b - a) / DIA);
}

export function contagemConsulta(ts: number, agora: number = Date.now()): Contagem {
  const falta = ts - agora;
  if (falta <= 0) return { texto: "Acontecendo agora", urgente: true, agora: true };
  if (falta < HORA) {
    const min = Math.max(1, Math.ceil(falta / MIN));
    return { texto: `Começa em ${min} min`, urgente: true, agora: false };
  }
  const dias = diasDeCalendario(ts, agora);
  if (dias <= 0) {
    const h = Math.floor(falta / HORA);
    const m = Math.floor((falta % HORA) / MIN);
    return { texto: m && h < 3 ? `Hoje, em ${h} h ${m} min` : `Hoje, em ${h} h`, urgente: false, agora: false };
  }
  if (dias === 1) return { texto: "Amanhã", urgente: false, agora: false };
  return { texto: `Em ${dias} dias`, urgente: false, agora: false };
}

/** De quanto em quanto tempo vale a pena atualizar a contagem na tela. */
export function intervaloContagem(ts: number, agora: number = Date.now()): number {
  return ts - agora < 2 * HORA ? 15_000 : 60_000;
}
