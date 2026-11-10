/**
 * Decisões de 10/11/2026: sem Psicologia na lista de especialidades,
 * saudação do Copilot coerente com a cláusula 13.1 dos termos do médico e
 * título "Emissão confirmada pela plataforma" no /verificar.
 * Rodar: bun src/components/bion/agendamento/especialidades-copilot-verificar.teste.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ESPECIALIDADES } from "./constantes";

let falhas = 0;
function checa(nome: string, fn: () => void) {
  try {
    fn();
    console.log("ok  ", nome);
  } catch (e) {
    falhas++;
    console.error("FALHA", nome, (e as Error).message);
  }
}
const ler = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

checa("lista sem Psicologia", () => assert.ok(!ESPECIALIDADES.some((e) => /psic/i.test(e.nome) || e.id === "psico")));
checa("demais especialidades ficam", () =>
  assert.deepEqual(ESPECIALIDADES.map((e) => e.nome), ["Clínica Geral", "Cardiologia", "Dermatologia", "Pediatria", "Ortopedia"]),
);
checa("ids únicos", () => assert.equal(new Set(ESPECIALIDADES.map((e) => e.id)).size, ESPECIALIDADES.length));

const ia = ler("src/components/bion/BionIA.tsx");
const saudacaoMedico = /\? `Olá, \*\*\$\{sessao\.nome\}\*\*! Sou o \*\*BION Copilot IA\*\*([^`]*)`/.exec(ia)?.[1] ?? "";
checa("saudação do médico encontrada", () => assert.ok(saudacaoMedico.length > 0));
checa("Copilot é apoio e não substitui o julgamento (13.1)", () => {
  assert.match(saudacaoMedico, /apoio/);
  assert.match(saudacaoMedico, /Não substituo o seu julgamento clínico/);
  assert.match(saudacaoMedico, /você revisa/);
});
checa("Copilot pede para não informar dados de pacientes (13.1)", () => assert.match(saudacaoMedico, /Não informe dados que identifiquem pacientes/));
checa("sem 'resumos de prontuário' nem 'sugestão de condutas'", () => {
  assert.doesNotMatch(saudacaoMedico, /resumos de prontuário/);
  assert.doesNotMatch(saudacaoMedico, /sugestão de condutas/);
});
checa("saudação do paciente intacta", () => assert.match(ia, /Sou a \*\*BION Saúde IA\*\*\. Estou aqui para esclarecer dúvidas sobre seus remédios/));

checa("/verificar: title do metadata", () => assert.match(ler("src/app/verificar/layout.tsx"), /title: "Emissão confirmada pela plataforma · BION"/));
checa("/verificar: título visível", () => assert.match(ler("src/app/verificar/[codigo]/page.tsx"), /<h1[^>]*>Emissão confirmada pela plataforma<\/h1>/));

if (falhas) {
  console.error(`${falhas} falha(s)`);
  process.exit(1);
}
console.log("especialidades-copilot-verificar: tudo ok");
