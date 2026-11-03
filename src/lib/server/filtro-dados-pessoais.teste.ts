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
    { role: "user", content: "Minha mãe Beatriz tem pressão alta" },
  ]);
  expect(r[0].content).toBe("Você é a BION IA. Médicos: M1 (Clínica Médica).");
  expect(r[1].content).toBe("Minha mãe [nome removido] tem pressão alta");
});
test("gatilho seguido de palavra minúscula NÃO remove nada", () => {
  for (const s of ["minha mãe tem diabetes", "meu filho está com febre", "a dra. falou que é virose", "Minha filha tomou o remédio"])
    expect(filtrarNomesProprios(s)).toBe(s);
});
test("lugares e palavras comuns ficam", () => {
  for (const s of ["moro em Vitória e tenho asma", "sou de Aparecida", "apareceu uma mancha na pele Rosa", "nasci em Natal"])
    expect(filtrarNomesProprios(s)).toBe(s);
});
test("aviso fixo com o texto do Jurídico", async () => {
  const { AVISO_DADOS_PESSOAIS_IA } = await import("@/lib/consentimento-ia");
  expect(AVISO_DADOS_PESSOAIS_IA).toBe("Não escreva nomes, CPF, contatos ou dados de saúde de outras pessoas.");
});
test("nome comum depois de da/na/do/no/de/em sai (não é lugar)", () => {
  expect(filtrarNomesProprios("Remarquei a consulta da Ana")).toBe("Remarquei a consulta da [nome removido]");
  expect(filtrarNomesProprios("Ontem levei na Juliana o exame")).toBe("Ontem levei na [nome removido] o exame");
  expect(filtrarNomesProprios("Falei com o marido da Ana Souza")).toBe("Falei com o marido da [nome removido]");
});
test("lugares continuam intactos", () => {
  for (const s of ["moro em Curitiba", "sou de Aparecida", "nasci em Natal", "moro em Vitória e tenho asma", "moro em São Paulo"])
    expect(filtrarNomesProprios(s)).toBe(s);
});
test("sobrenome não vaza: a sequência inteira vira um só [nome removido]", () => {
  expect(filtrarNomesProprios("Hoje Carla Mendes ligou")).toBe("Hoje [nome removido] ligou");
  expect(filtrarNomesProprios("Ontem Maria da Silva Souza passou mal")).toBe("Ontem [nome removido] passou mal");
});
test("começo de frase, remédios e hospitais seguem passando", () => {
  for (const s of [
    "Hoje acordei com dor.",
    "Tomo Losartana Potássica de manhã.",
    "Fui ao Hospital Santa Maria ontem.",
    "Tomo Dipirona e Paracetamol.",
    "Quero agendar Clínica Médica.",
  ])
    expect(filtrarNomesProprios(s)).toBe(s);
});
test("regressões: gatilho com minúscula e palavras comuns", () => {
  for (const s of ["minha mãe tem diabetes", "meu filho está com febre", "a dra. falou que é virose", "moro em Vitória", "apareceu uma mancha na pele Rosa"])
    expect(filtrarNomesProprios(s)).toBe(s);
});
