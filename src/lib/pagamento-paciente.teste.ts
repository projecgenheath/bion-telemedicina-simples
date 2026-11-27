import { describe, expect, test } from "bun:test";
import {
  DIAS_REEMBOLSO_FALTA_PACIENTE,
  TEXTO_FALTA_MEDICO_NA_ESPERA,
  prazoReembolsoFaltaPaciente,
  reembolsoAutomaticoNoPrazo,
  textoFaltaPacienteAutomatica,
} from "./pagamento-paciente";

const CONSULTA = new Date("2026-11-20T14:00:00.000Z");
const DIA = 24 * 3600_000;

describe("prazo do reembolso automático da falta do paciente", () => {
  test("é 7 dias corridos a partir do horário da consulta", () => {
    const prazo = prazoReembolsoFaltaPaciente(CONSULTA);
    expect(DIAS_REEMBOLSO_FALTA_PACIENTE).toBe(7);
    expect(prazo.getTime()).toBe(CONSULTA.getTime() + 7 * DIA);
  });

  test("aceita o instante em milissegundos, como a tela guarda", () => {
    expect(prazoReembolsoFaltaPaciente(CONSULTA.getTime()).getTime()).toBe(CONSULTA.getTime() + 7 * DIA);
  });

  test("o prazo fica aberto até o último segundo", () => {
    const fim = CONSULTA.getTime() + 7 * DIA;
    expect(reembolsoAutomaticoNoPrazo(CONSULTA, fim - 1)).toBe(true);
    expect(reembolsoAutomaticoNoPrazo(CONSULTA, fim)).toBe(true);
    expect(reembolsoAutomaticoNoPrazo(CONSULTA, fim + 1)).toBe(false);
  });
});

describe("textos do modelo novo", () => {
  test("a falta do paciente diz que o reembolso é automático e sem pedido", () => {
    const prazo = prazoReembolsoFaltaPaciente(CONSULTA);
    const texto = textoFaltaPacienteAutomatica(prazo, (d) => d.toISOString());
    expect(texto).toContain("automático");
    expect(texto).toContain("sem precisar pedir");
    expect(texto).toContain(prazo.toISOString());
    expect(texto).toContain("O médico não recebe");
  });

  test("a espera do médico promete remarcar sem nova cobrança e sem diferença", () => {
    expect(TEXTO_FALTA_MEDICO_NA_ESPERA).toContain("outro médico");
    expect(TEXTO_FALTA_MEDICO_NA_ESPERA).toContain("sem nova cobrança");
    expect(TEXTO_FALTA_MEDICO_NA_ESPERA).toContain("sem diferença de preço");
    expect(TEXTO_FALTA_MEDICO_NA_ESPERA).not.toContain("aurora");
  });
});
