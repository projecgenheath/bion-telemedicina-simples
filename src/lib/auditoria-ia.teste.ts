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
// documento (decisão do Alisson, 09/11): o título do cliente não vai para a trilha
assert.equal(detalheAuditoriaCliente("DOCUMENTO_VISUALIZADO", "PACIENTE", "Visualização: Solicitação — Hemograma completo + PCR (exame_solicitado)"), "Visualização de documento (título não registrado)");
assert.equal(detalheAuditoriaCliente("DOCUMENTO_PDF_BAIXADO", "MEDICO", "Download PDF: Receita de Losartana (receita)"), "Download do PDF de documento (título não registrado)");
assert.equal(detalheAuditoriaCliente("DOCUMENTO_PDF_BAIXADO", "PACIENTE", undefined), "Download do PDF de documento (título não registrado)");
// outros eventos seguem iguais (corte em 300)
assert.equal(detalheAuditoriaCliente("RELATORIO_CSV_EXPORTADO", "ADMIN", "x".repeat(400))?.length, 300);
assert.equal(detalheAuditoriaCliente("RELATORIO_CSV_EXPORTADO", "ADMIN", undefined), undefined);
console.log("auditoria-ia: ok");
