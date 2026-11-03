/** Rodar: bun --conditions=react-server test ./src/lib/server/filtro-dados-pessoais.teste.ts */
import { expect, test } from "bun:test";
import { filtrarDadosPessoais, filtrarMensagensDaPaciente, filtrarNomesProprios } from "./filtro-dados-pessoais";

test("CPF, telefone e e-mail saem", () => {
  const t = filtrarDadosPessoais("Meu CPF é 123.456.789-09, telefone (11) 98765-4321 e e-mail ana@exemplo.com");
  for (const s of ["123.456.789-09", "98765-4321", "ana@exemplo.com"]) expect(t).not.toContain(s);
});
test("nome da paciente (banco) sai, com ou sem acento", () => {
  expect(filtrarDadosPessoais("Aqui é a Marina Siqueira, tenho tosse", { nomesConhecidos: ["Marina Siqueira"], substitutoNome: "o paciente" })).toBe(
    "Aqui é a o paciente, tenho tosse",
  );
});
test("terceiros: sequência capitalizada no meio da frase", () => {
  expect(filtrarNomesProprios("Levei minha prima ontem e a Carla Mendes Souza disse que é virose")).not.toContain("Carla Mendes");
});
test("terceiros: gatilho de parentesco ou Dr./Dra.", () => {
  expect(filtrarNomesProprios("Minha filha Beatriz está com febre")).toBe("Minha filha [nome removido] está com febre");
  expect(filtrarNomesProprios("O Dr. Albuquerque passou antibiótico")).toBe("O Dr. [nome removido] passou antibiótico");
});
test("nome comum no início da frase", () => {
  expect(filtrarNomesProprios("João está com dor de ouvido")).toBe("[nome removido] está com dor de ouvido");
});
test("não estraga o texto clínico", () => {
  for (const s of [
    "Estou com dor de cabeça desde ontem.",
    "Tomo Losartana 50mg e Dipirona quando dói.",
    "Quero agendar Clínica Médica na segunda-feira.",
    "Moro em São Paulo e liguei para o SAMU.",
  ])
    expect(filtrarNomesProprios(s)).toBe(s);
});
test("só mensagens da paciente (role user); prompt do sistema fica", () => {
  const r = filtrarMensagensDaPaciente([
    { role: "assistant", content: "Você é a BION IA. Médicos: M1 (Clínica Médica)." },
    { role: "user", content: "Minha mãe Rosa tem pressão alta" },
  ]);
  expect(r[0].content).toBe("Você é a BION IA. Médicos: M1 (Clínica Médica).");
  expect(r[1].content).toBe("Minha mãe [nome removido] tem pressão alta");
});
