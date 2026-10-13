/**
 * Janela da sala de teleconsulta — fonte ÚNICA (servidor e cliente).
 *
 * A sala abre 30 min antes do horário marcado e fecha 2 h depois dele.
 * Usada por:
 *  - /api/telemedicina/[consultaId]/sala (recusa 409 fora da janela, exceto
 *    no modo só de leitura `?espiar=1`);
 *  - components/bion/medico/metricas.ts (`salaAberta`, botão "Entrar na sala");
 *  - lib/server/presenca-consulta.ts (CARENCIA_APOS_INICIO_MIN: a decisão
 *    automática de falta/falha só sai depois que a sala fecha);
 *  - área do paciente (PacienteApp.tsx, no PR do Programador Pacientes).
 * Funções PURAS, sem dependências: podem ser importadas em qualquer lugar.
 */

/** Minutos ANTES do horário marcado em que a sala abre. */
export const SALA_ABRE_ANTES_MIN = 30;
/** Minutos DEPOIS do horário marcado em que a sala fecha. */
export const SALA_FECHA_DEPOIS_MIN = 120;

export type EstadoJanelaSala = "antes" | "aberta" | "fechada";

const ms = (d: Date | number) => (typeof d === "number" ? d : d.getTime());

/** Instantes (ms) de abertura e fechamento da sala para uma consulta. */
export function janelaSala(dataInicio: Date | number) {
  const inicio = ms(dataInicio);
  return { abreEm: inicio - SALA_ABRE_ANTES_MIN * 60_000, fechaEm: inicio + SALA_FECHA_DEPOIS_MIN * 60_000 };
}

/** "antes" (ainda não abriu) · "aberta" · "fechada" (já passou de 2 h depois do horário). */
export function estadoJanelaSala(dataInicio: Date | number, agora: Date | number): EstadoJanelaSala {
  const { abreEm, fechaEm } = janelaSala(dataInicio);
  const t = ms(agora);
  if (t < abreEm) return "antes";
  if (t > fechaEm) return "fechada";
  return "aberta";
}

/** A sala está aberta (de 30 min antes até 2 h depois do horário, inclusive). */
export const salaAbertaEm = (dataInicio: Date | number, agora: Date | number) =>
  estadoJanelaSala(dataInicio, agora) === "aberta";
