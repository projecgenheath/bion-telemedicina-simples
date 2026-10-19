/**
 * Testes do cruzamento "Evolução pendente com paciente esperando".
 * Rodar: bun src/lib/evolucao-pendente.teste.ts
 */
import { cruzarEvolucaoPendente, type ConsultaEsperando, type EvolucaoAberta } from "./evolucao-pendente";

let ok = 0, falhas = 0;
function igual(nome: string, a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) ok++; else { falhas++; console.error(`✗ ${nome}\n   obtido:   ${x}\n   esperado: ${y}`); }
}
const d = (iso: string) => new Date(iso);
const AGORA = d("2026-10-19T15:10:00-03:00");
const esp = (x: Partial<ConsultaEsperando>): ConsultaEsperando => ({
  id: "c2", medicoId: "m1", medico: "Dra. A", paciente: "Bia", especialidade: "Clínica", dataInicio: d("2026-10-19T15:00:00-03:00"),
  status: "confirmada", pingsPaciente: [d("2026-10-19T15:09:40-03:00")], entrouEm: d("2026-10-19T15:01:00-03:00"), ...x,
});
const evo = (x: Partial<EvolucaoAberta>): EvolucaoAberta => ({
  consultaId: "c1", medicoId: "m1", paciente: "Caio", status: "pendente", dataInicio: d("2026-10-19T14:00:00-03:00"), consultaStatus: "concluida", ...x,
});

igual("caso base", cruzarEvolucaoPendente([esp({})], [evo({})], AGORA).map((i) => [i.consultaId, i.pendentes.map((p) => p.consultaId), i.esperandoDesde]),
  [["c2", ["c1"], "2026-10-19T18:01:00.000Z"]]);
igual("rascunho conta", cruzarEvolucaoPendente([esp({})], [evo({ status: "rascunho" })], AGORA).length, 1);
igual("concluida não conta", cruzarEvolucaoPendente([esp({})], [evo({ status: "concluida" })], AGORA).length, 0);
igual("outro médico não conta", cruzarEvolucaoPendente([esp({})], [evo({ medicoId: "m2" })], AGORA).length, 0);
igual("a própria consulta não conta", cruzarEvolucaoPendente([esp({})], [evo({ consultaId: "c2", dataInicio: d("2026-10-19T15:00:00-03:00") })], AGORA).length, 0);
igual("consulta posterior não conta", cruzarEvolucaoPendente([esp({})], [evo({ dataInicio: d("2026-10-19T16:00:00-03:00") })], AGORA).length, 0);
igual("consulta cancelada não conta", cruzarEvolucaoPendente([esp({})], [evo({ consultaStatus: "cancelada" })], AGORA).length, 0);
igual("paciente saiu (ping velho)", cruzarEvolucaoPendente([esp({ pingsPaciente: [d("2026-10-19T15:05:00-03:00")] })], [evo({})], AGORA).length, 0);
igual("sem ping", cruzarEvolucaoPendente([esp({ pingsPaciente: [] })], [evo({})], AGORA).length, 0);
igual("sala fechada (> 2 h)", cruzarEvolucaoPendente([esp({ dataInicio: d("2026-10-19T13:00:00-03:00") })], [evo({ dataInicio: d("2026-10-19T12:00:00-03:00") })], AGORA).length, 0);
igual("sala ainda não abriu", cruzarEvolucaoPendente([esp({ dataInicio: d("2026-10-19T15:45:00-03:00") })], [evo({})], AGORA).length, 0);
igual("consulta já concluída não entra", cruzarEvolucaoPendente([esp({ status: "concluida" })], [evo({})], AGORA).length, 0);
igual("duas pendências em ordem", cruzarEvolucaoPendente([esp({})], [evo({ consultaId: "c1b", dataInicio: d("2026-10-19T14:30:00-03:00") }), evo({})], AGORA)[0].pendentes.map((p) => p.consultaId), ["c1", "c1b"]);
igual("ordena por quem espera há mais tempo",
  cruzarEvolucaoPendente([esp({ id: "x", entrouEm: d("2026-10-19T15:05:00-03:00") }), esp({ id: "y", entrouEm: d("2026-10-19T15:02:00-03:00") })], [evo({})], AGORA).map((i) => i.consultaId), ["y", "x"]);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
