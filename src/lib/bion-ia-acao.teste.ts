/** Rodar: bun --conditions=react-server test ./src/lib/bion-ia-acao.teste.ts */
import { expect, test } from "bun:test";
import { FiltroAcao, extrairAcao, resolverAcaoAgendar } from "./bion-ia-acao";

test("extrai [[AGENDAR: especialidade]] e tira do texto", () => {
  const r = extrairAcao("Desde quando dói?\n[[AGENDAR: Clínica Médica]]");
  expect(r.texto).toBe("Desde quando dói?");
  expect(r.acao).toEqual({ tipo: "agendar", especialidade: "Clínica Médica", codigo: null });
});
test("[[AGENDAR]] sem especialidade", () => {
  expect(extrairAcao("Posso marcar. [[agendar]]").acao).toEqual({ tipo: "agendar", especialidade: null, codigo: null });
});
test("sem marcador = texto intacto", () => {
  expect(extrairAcao("Texto [normal] aqui")).toEqual({ texto: "Texto [normal] aqui", acao: null });
});

function rodar(pedacos: string[]) {
  const f = new FiltroAcao();
  let t = "";
  for (const p of pedacos) t += f.empurrar(p);
  const fim = f.fechar();
  return { texto: (t + fim.texto).trim(), acao: fim.acao };
}
test("stream: marcador partido em vários deltas não vaza", () => {
  const r = rodar(["Sinto muito. Quer marcar?\n[", "[AGEN", "DAR: Neuro", "logia]", "]"]);
  expect(r.texto).toBe("Sinto muito. Quer marcar?");
  expect(r.acao).toEqual({ tipo: "agendar", especialidade: "Neurologia", codigo: null });
});
test("stream: colchete comum passa", () => {
  expect(rodar(["Use [1] e ", "[[nota]] ok"]).texto).toBe("Use [1] e [[nota]] ok");
});
test("stream: texto sai na hora (não segura tudo)", () => {
  const f = new FiltroAcao();
  expect(f.empurrar("Olá, tudo bem")).toBe("Olá, tudo bem");
});

test("[[AGENDAR: Cardiologia | M2]] → código separado da especialidade", () => {
  expect(extrairAcao("Posso marcar.\n[[AGENDAR: Cardiologia | m2]]").acao).toEqual({ tipo: "agendar", especialidade: "Cardiologia", codigo: "M2" });
  expect(extrairAcao("[[AGENDAR: M1]]").acao).toEqual({ tipo: "agendar", especialidade: null, codigo: "M1" });
});
test("servidor troca o código pelo médico; código desconhecido fica só a especialidade", () => {
  const medicos = [
    { codigo: "M1", id: "u1", nome: "Dra. Ana", especialidade: "Clínica Médica" },
    { codigo: "M2", id: "u2", nome: "Dr. Beto", especialidade: "Cardiologia" },
  ];
  expect(resolverAcaoAgendar({ tipo: "agendar", especialidade: null, codigo: "M2" }, medicos)).toEqual({
    tipo: "agendar", especialidade: "Cardiologia", medicoId: "u2", medico: "Dr. Beto",
  });
  expect(resolverAcaoAgendar({ tipo: "agendar", especialidade: "Pediatria", codigo: "M9" }, medicos)).toEqual({
    tipo: "agendar", especialidade: "Pediatria", medicoId: null, medico: null,
  });
  expect(resolverAcaoAgendar(null, medicos)).toBeNull();
});
