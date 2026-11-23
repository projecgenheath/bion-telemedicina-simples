import assert from "node:assert/strict";
import { instanteFusoClinica, type Consulta } from "@/lib/bion-tipos";
import { colunasSobrepostas, eventosAgenda, faixaHoras, gradeMes, semanaDe } from "./agenda-dados";

const c = (id: string, ts: number, extra: Partial<Consulta> = {}): Consulta => ({
  id, medico: "M", especialidade: "E", paciente: "P", data: "", hora: "", status: "confirmada", ts, ...extra,
});

// Semana começa na segunda (fuso da clínica): 23/11/2026 é segunda.
const qua = instanteFusoClinica(2026, 10, 25, 10);
const sem = semanaDe(qua);
assert.equal(sem.length, 7);
assert.equal(sem[0].iso, "2026-11-23");
assert.equal(sem[6].iso, "2026-11-29");
assert.equal(sem[0].semana, 1);

// Domingo pertence à semana que começou na segunda anterior.
assert.equal(semanaDe(instanteFusoClinica(2026, 10, 29, 22))[0].iso, "2026-11-23");

// Mini calendário de novembro/2026: começa em 26/10 e cobre o dia 30.
const g = gradeMes(2026, 10);
assert.equal(g[0][0].iso, "2026-10-26");
assert.ok(g.flat().some((d) => d.iso === "2026-11-30"));

// Canceladas ficam de fora; tom por tipo de atendimento.
const ev = eventosAgenda([
  c("a", instanteFusoClinica(2026, 10, 24, 9)),
  c("b", instanteFusoClinica(2026, 10, 24, 9, 15), { tipoAtendimento: "retorno" }),
  c("x", instanteFusoClinica(2026, 10, 24, 11), { status: "cancelada" }),
  c("r", instanteFusoClinica(2026, 10, 24, 22, 30), { tipoAtendimento: "renovacao" }),
]);
assert.deepEqual(ev.map((e) => e.consulta.id), ["a", "b", "r"]);
assert.equal(ev[1].tom, "lavanda");
assert.equal(ev[2].tom, "pessego");
assert.equal(ev[0].fimMin - ev[0].inicioMin, 30);

// Regra da agenda: a grade nunca passa das 23:00 (sem a faixa 23:00–00:00).
assert.equal(ev[2].fimMin, 23 * 60);
assert.deepEqual(faixaHoras(ev), { inicio: 7, fim: 23 });
assert.deepEqual(faixaHoras([]), { inicio: 7, fim: 19 });

// Sobrepostas: 09:00 e 09:15 lado a lado.
const cols = colunasSobrepostas(ev);
assert.deepEqual(cols.get(ev[0]), { col: 0, de: 2 });
assert.deepEqual(cols.get(ev[1]), { col: 1, de: 2 });
assert.deepEqual(cols.get(ev[2]), { col: 0, de: 1 });

console.log("agenda-dados: ok");
