import { expect, test } from "bun:test";
import { crmComRotulo, textoNota } from "./medico-exibicao";
test("crm sem duplicar", () => {
  expect(crmComRotulo("CRM 12345 SP")).toBe("CRM 12345 SP");
  expect(crmComRotulo("crm-sp 1")).toBe("crm-sp 1");
  expect(crmComRotulo("12345 SP")).toBe("CRM 12345 SP");
  expect(crmComRotulo("")).toBe("CRM não informado");
});
test("nota só com avaliação real", () => {
  expect(textoNota({ avaliacao: 4.9, numAvaliacoes: 0 })).toBe("Sem avaliações ainda");
  expect(textoNota({ avaliacao: 4, numAvaliacoes: 1 })).toBe("4.0 (1 avaliação)");
});
