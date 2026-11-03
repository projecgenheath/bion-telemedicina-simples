/** Rodar: bun src/lib/auditoria-ia.teste.ts */
import assert from "node:assert/strict";
import { detalheAuditoriaCliente, detalheConsultaIa } from "./auditoria-ia";

assert.equal(detalheConsultaIa("MEDICO"), "Consulta ao BION Copilot (texto não registrado)");
assert.equal(detalheConsultaIa("medico"), "Consulta ao BION Copilot (texto não registrado)");
assert.equal(detalheConsultaIa("PACIENTE"), "Consulta à BION IA (texto não registrado)");
assert.equal(detalheConsultaIa("ADMIN"), "Consulta à BION IA (texto não registrado)");
// servidor ignora o texto que o cliente mandar no evento de IA
assert.equal(detalheAuditoriaCliente("IA_CONSULTA_REALIZADA", "PACIENTE", 'Consulta à IA: "meu CPF é 123"'), "Consulta à BION IA (texto não registrado)");
assert.equal(detalheAuditoriaCliente("IA_CONSULTA_REALIZADA", "MEDICO", undefined), "Consulta ao BION Copilot (texto não registrado)");
// outros eventos seguem iguais (corte em 300)
assert.equal(detalheAuditoriaCliente("DOCUMENTO_PDF_BAIXADO", "PACIENTE", "x".repeat(400))?.length, 300);
assert.equal(detalheAuditoriaCliente("DOCUMENTO_PDF_BAIXADO", "PACIENTE", undefined), undefined);
console.log("auditoria-ia: ok");
