/** Rodar: bun --conditions=react-server test ./src/lib/server/bion-ia-contexto.teste.ts */
import { expect, test } from "bun:test";
import { promptPaciente, resumoPacienteTexto, type DadosContextoPaciente } from "./bion-ia-contexto";

const dados: DadosContextoPaciente = {
  idade: 34,
  genero: "feminino",
  alergias: ["dipirona"],
  medicamentos: ["losartana 50mg"],
  condicoes: ["hipertensão"],
  proximas: [{ especialidade: "Cardiologia", medico: "Dr. A", quando: "05/11 às 10:00" }],
  anteriores: [{ especialidade: "Clínica Médica", quando: "10/10 às 09:00", motivo: "enxaqueca" }],
  exames: [{ titulo: "Hemograma", quando: "01/10" }],
  triagens: [{ especialidade: "Clínica Médica", queixa: "dor de cabeça há 3 dias" }],
  medicosDisponiveis: [{ especialidade: "Clínica Médica", medico: "Dra. B" }],
};

test("resumo traz perfil, consultas, exames, triagens e médicos", () => {
  const t = resumoPacienteTexto(dados);
  for (const s of ["34 anos", "dipirona", "losartana", "hipertensão", "Cardiologia com Dr. A", "enxaqueca", "Hemograma", "dor de cabeça há 3 dias", "Dra. B (Clínica Médica)"])
    expect(t).toContain(s);
});
test("resumo vazio diz 'nenhuma informada' (IA não inventa)", () => {
  const t = resumoPacienteTexto({ ...dados, idade: null, genero: "", alergias: [], medicamentos: [], condicoes: [], proximas: [], anteriores: [], exames: [], triagens: [], medicosDisponiveis: [] });
  expect(t).toContain("Alergias: nenhuma informada");
});
test("prompt: papel no app, sintoma → perguntas + oferta com [[AGENDAR]], SAMU 192", () => {
  const p = promptPaciente(resumoPacienteTexto(dados));
  for (const s of ["app de telemedicina BION", "AGENDAR consulta", "SINTOMA", "[[AGENDAR: <especialidade>]]", "SAMU 192", "Não prescreva", "dipirona"])
    expect(p).toContain(s);
});
test("resumo não leva identificadores (nome/CPF/nascimento)", () => {
  const t = resumoPacienteTexto(dados);
  expect(t).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}|nascid/i);
});
