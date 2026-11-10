/**
 * Testes da lista de documentos do paciente (documentos-paciente.ts).
 * Rodar: bun --conditions=react-server src/components/bion/paciente/documentos-paciente.teste.ts
 */
import { agruparDocumentosPaciente, arquivosDoMedico, ehPdf, nomeComTratamento, seloCancelado } from "./documentos-paciente";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error("FALHOU:", nome, "\n  atual:   ", JSON.stringify(atual), "\n  esperado:", JSON.stringify(esperado));
  }
}

const P = { pacienteId: "p1", pacienteNome: "Marina" };
const c = (id: string, ts: number, status: string, extra: Record<string, unknown> = {}) =>
  ({ id, ts, status, paciente: "Marina", pacienteId: "p1", ...extra }) as never;
const d = (id: string, consultaId: string | null, criadoEm: string, extra: Record<string, unknown> = {}) =>
  ({ id, consultaId, criadoEm, paciente: "Marina", pacienteId: "p1", ...extra }) as never;

const consultas = [
  c("agendada", 300, "confirmada", { resumoMedico: "rascunho da sala" }),
  c("feita", 200, "concluida", { resumoMedico: "Resumo final" }),
  c("antiga", 100, "concluida"),
  c("cancelada", 50, "cancelada"),
  c("outra-pessoa", 400, "concluida", { pacienteId: "p2", paciente: "Outra" }),
];
const documentos = [
  d("na-agendada", "agendada", "2026-11-10T10:00:00Z"),
  d("feita-1", "feita", "2026-11-09T10:00:00Z"),
  d("feita-2", "feita", "2026-11-09T11:00:00Z"),
  d("sem-consulta-velho", null, "2026-01-01T10:00:00Z"),
  d("sem-consulta-novo", null, "2026-10-01T10:00:00Z"),
  d("consulta-desconhecida", "xyz", "2026-05-01T10:00:00Z"),
  d("de-outro", null, "2026-11-01T10:00:00Z", { pacienteId: "p2", paciente: "Outra" }),
];
const r = agruparDocumentosPaciente({ consultas, documentos, ...P });
igual("grupos: consulta com documento aparece antes de concluir; cancelada sem doc some; outro paciente fora",
  r.grupos.map((g) => g.consulta.id), ["agendada", "feita", "antiga"]);
igual("documentos da consulta, mais novo primeiro", r.grupos[1].documentos.map((x: { id: string }) => x.id), ["feita-2", "feita-1"]);
igual("rascunho do resumo NÃO vira prontuário antes de concluir", r.grupos[0].prontuario, null);
igual("prontuário com a consulta concluída", r.grupos[1].prontuario, "Resumo final");
igual("Outros documentos: sem consulta ou com consulta desconhecida, nunca de outro paciente",
  r.outros.map((x: { id: string }) => x.id), ["sem-consulta-novo", "consulta-desconhecida", "sem-consulta-velho"]);
igual("legado sem pacienteId casa pelo nome",
  agruparDocumentosPaciente({ consultas: [], documentos: [d("leg", null, "", { pacienteId: undefined })], ...P }).outros.length, 1);

igual("Dra. não duplica", nomeComTratamento("Dra. Ana Ribeiro"), "Dra. Ana Ribeiro");
igual("Dr. não duplica", nomeComTratamento("Dr. Carlos Mendes"), "Dr. Carlos Mendes");
igual("sem prefixo ganha Dr(a).", nomeComTratamento("Ana Ribeiro"), "Dr(a). Ana Ribeiro");
igual("vazio", nomeComTratamento(""), "");

igual("emitido sem selo", seloCancelado({ status: "emitido" }), null);
igual("sem status (main sem #169) sem selo", seloCancelado({}), null);
igual("cancelado com data (fuso SP)", seloCancelado({ status: "cancelado", canceladoEm: "2026-11-10T01:30:00Z" }), "Cancelado em 09/11/2026");
igual("cancelado sem data", seloCancelado({ status: "cancelado", canceladoEm: null }), "Cancelado");

igual("arquivos do médico", arquivosDoMedico([{ enviadoPor: "medico" }, { enviadoPor: "paciente" }] as never[]).length, 1);
igual("ehPdf", [ehPdf("laudo.PDF"), ehPdf("foto.jpg"), ehPdf("Laudo ecocardiograma")], [true, false, false]);

console.log(`documentos-paciente: ${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
