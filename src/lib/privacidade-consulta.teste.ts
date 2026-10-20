/**
 * Testes da privacidade da consulta (lib/privacidade-consulta.ts).
 * Rodar: npx tsx src/lib/privacidade-consulta.teste.ts
 */
import { adminBaixaArquivoClinico, adminVeAnamnese, documentoParaPapel, whereLimpezaSala } from "./privacidade-consulta";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

igual("admin não vê anamnese", adminVeAnamnese("ADMIN"), false);
igual("médico vê anamnese", adminVeAnamnese("MEDICO"), true);
igual("paciente vê anamnese", adminVeAnamnese("PACIENTE"), true);
igual("admin não baixa arquivo clínico", adminBaixaArquivoClinico("ADMIN"), false);
igual("médico baixa arquivo", adminBaixaArquivoClinico("MEDICO"), true);
igual("paciente baixa arquivo", adminBaixaArquivoClinico("PACIENTE"), true);

const doc = {
  id: "d1", tipo: "atestado", titulo: "Atestado", conteudo: "Afastamento por 3 dias", medico: "Dr. A", paciente: "Ana",
  medicamento: "Dipirona", posologia: "8/8h", duracao: "3 dias", observacoes: "obs", cid: "J11", controlado: false, createdAt: "x",
};
const doAdmin = documentoParaPapel(doc, "ADMIN");
igual("admin: conteúdo sai", doAdmin.conteudo, "");
igual("admin: CID sai", doAdmin.cid, null);
igual("admin: medicamento/posologia/duração/observações saem", [doAdmin.medicamento, doAdmin.posologia, doAdmin.duracao, doAdmin.observacoes], [null, null, null, null]);
igual("admin: metadados ficam", [doAdmin.id, doAdmin.tipo, doAdmin.titulo, doAdmin.medico, doAdmin.paciente, doAdmin.createdAt], ["d1", "atestado", "Atestado", "Dr. A", "Ana", "x"]);
igual("admin: não muta o original", doc.conteudo, "Afastamento por 3 dias");
igual("médico recebe igual", documentoParaPapel(doc, "MEDICO"), doc);
igual("paciente recebe igual", documentoParaPapel(doc, "PACIENTE"), doc);

const agora = Date.parse("2026-10-20T18:00:00Z");
const corte = new Date(agora - 30 * 60 * 1000);
igual(
  "sem desfecho: regra antiga, chat não consumido fica até a consulta acabar",
  whereLimpezaSala("c1", false, agora),
  { consultaId: "c1", consumido: true, createdAt: { lt: corte }, NOT: { tipo: "controle", payload: { contains: '"encerrada"' } } },
);
igual(
  "com desfecho: apaga todo o chat (qualquer idade, consumido ou não)",
  whereLimpezaSala("c1", true, agora),
  { OR: [{ consultaId: "c1", consumido: true, createdAt: { lt: corte } }, { consultaId: "c1", tipo: "chat" }] },
);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
