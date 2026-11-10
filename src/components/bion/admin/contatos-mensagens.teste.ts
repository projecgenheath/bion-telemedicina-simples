/**
 * Contatos de Mensagens do admin (auditoria admin 09/11).
 * Rodar: bun --conditions=react-server test ./src/components/bion/admin/contatos-mensagens.teste.ts
 */
import { expect, test } from "bun:test";
import { contatosMensagensAdmin } from "./contatos-mensagens";

const medicos = [
  { id: "m1", nome: "Dra. Ativa", especialidade: "Clínica", status: "ativo" },
  { id: "m2", nome: "Dr. Pendente", especialidade: "Pediatria", status: "pendente" },
  { id: "m3", nome: "Dr. Arquivado", especialidade: "Cardio", status: "arquivado" },
  { id: "m4", nome: "Dra. Suspensa", especialidade: "Derma", status: "suspenso" },
];
const pacientes = [
  { id: "p1", nome: "Ana", status: "ativo" },
  { id: "p2", nome: "Paciente anonimizado", status: "inativo" },
];

test("sem arquivados, suspensos, inativos ou anonimizados", () => {
  expect(contatosMensagensAdmin(medicos, pacientes, "adm").map((c) => c.id)).toEqual(["m1", "m2", "p1"]);
});

test("não lista a si mesmo e mantém detalhe", () => {
  const l = contatosMensagensAdmin(medicos, pacientes, "m1");
  expect(l.some((c) => c.id === "m1")).toBe(false);
  expect(l.find((c) => c.id === "p1")?.detalhe).toBe("Paciente");
  expect(l.find((c) => c.id === "m2")?.detalhe).toBe("Pediatria");
});
