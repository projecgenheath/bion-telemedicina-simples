/**
 * Testes da grade por dia da semana (item estratégico 28 da auditoria de
 * melhorias da área médica): normalização tolerante dos dois formatos
 * (array legado e objeto novo), leitura por dia e serialização
 * retrocompatível.
 * Rodar: bun src/lib/grade-semana.teste.ts
 */
import {
  normalizarGrade,
  gradeDeCampos,
  horariosDoDia,
  gradeEhPlana,
  gradeTotalmenteVazia,
  serializarGrade,
  listasDaGrade,
  gradesIguais,
  diaSemanaDeIso,
} from "./grade-semana";

let ok = 0, falhas = 0;
function igual(nome: string, a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) ok++; else { falhas++; console.error(`✗ ${nome}\n   obtido:   ${x}\n   esperado: ${y}`); }
}
function checa(nome: string, cond: boolean) {
  if (cond) ok++; else { falhas++; console.error(`FALHOU: ${nome}`); }
}

// ── normalizarGrade: formato legado (array) ──
igual("string array legado", normalizarGrade('["09:00","10:00"]'), { padrao: ["09:00", "10:00"], dias: {} });
igual("array direto (dedup, ordem preservada)", normalizarGrade(["14:00", "09:00", "09:00"]), { padrao: ["14:00", "09:00"], dias: {} });
igual("string vazia", normalizarGrade(""), { padrao: [], dias: {} });
igual("array vazio", normalizarGrade("[]"), { padrao: [], dias: {} });
igual("null", normalizarGrade(null), { padrao: [], dias: {} });
igual("undefined", normalizarGrade(undefined), { padrao: [], dias: {} });
igual("JSON inválido", normalizarGrade("{quebrado"), { padrao: [], dias: {} });
igual("array com lixo filtra e preserva a ordem", normalizarGrade('["25:00","abc","10:00",42,"09:00"]'), { padrao: ["10:00", "09:00"], dias: {} });

// ── normalizarGrade: formato novo (objeto) ──
igual(
  "objeto completo",
  normalizarGrade('{"padrao":["09:00","10:00"],"dias":{"6":["08:00"],"1":[]}}'),
  { padrao: ["09:00", "10:00"], dias: { "1": [], "6": ["08:00"] } },
);
igual(
  "objeto ignora dia fora de 0-6 e lista inválida",
  normalizarGrade({ padrao: ["09:00"], dias: { "7": ["08:00"], x: ["08:00"], "2": "não-lista", "3": ["11:00", "99:99"] } }),
  { padrao: ["09:00"], dias: { "3": ["11:00"] } },
);
igual("objeto sem padrao", normalizarGrade({ dias: { "0": ["07:30"] } }), { padrao: [], dias: { "0": ["07:30"] } });

// ── horariosDoDia ──
const g = normalizarGrade('{"padrao":["09:00","10:00"],"dias":{"6":["08:00"],"1":[]}}');
igual("dia sem próprio usa o padrão", horariosDoDia(g, 3), ["09:00", "10:00"]);
igual("sábado usa a lista própria", horariosDoDia(g, 6), ["08:00"]);
igual("segunda com lista própria VAZIA = nenhum horário", horariosDoDia(g, 1), []);
const copia = horariosDoDia(g, 3);
copia.push("23:59");
igual("devolve cópia (não vaza a interna)", horariosDoDia(g, 3), ["09:00", "10:00"]);

// ── gradeDeCampos (wire) ──
igual(
  "campos do wire viram a grade",
  gradeDeCampos(["09:00"], { "6": ["08:00"] }),
  { padrao: ["09:00"], dias: { "6": ["08:00"] } },
);
igual("campos ausentes", gradeDeCampos(undefined, undefined), { padrao: [], dias: {} });

// ── plana / vazia ──
checa("legada é plana", gradeEhPlana(normalizarGrade('["09:00"]')));
checa("com próprio não é plana", !gradeEhPlana(g));
checa("vazia total", gradeTotalmenteVazia(normalizarGrade("[]")));
checa("só próprio em um dia não é vazia", !gradeTotalmenteVazia(normalizarGrade({ dias: { "6": ["08:00"] } })));
checa("próprio vazio em um dia + padrão vazio = vazia", gradeTotalmenteVazia(normalizarGrade({ padrao: [], dias: { "6": [] } })));

// ── serializarGrade: retrocompatibilidade ──
igual("plana volta ao array legado byte a byte", serializarGrade(normalizarGrade('["09:00","10:00"]')), '["09:00","10:00"]');
igual("com próprio vira objeto", serializarGrade(g), '{"padrao":["09:00","10:00"],"dias":{"1":[],"6":["08:00"]}}');
checa("round-trip objeto", gradesIguais(normalizarGrade(serializarGrade(g)), g));
checa("round-trip legado", gradesIguais(normalizarGrade(serializarGrade(normalizarGrade('["08:00"]'))), normalizarGrade('["08:00"]')));
checa("grades diferentes não são iguais", !gradesIguais(g, normalizarGrade('["09:00","10:00"]')));

// ── listasDaGrade ──
igual("listas para validação", listasDaGrade(g), [["09:00", "10:00"], [], ["08:00"]]);

// ── diaSemanaDeIso (calendário civil, 0=Dom … 6=Sáb) ──
igual("2026-10-30 é sexta (5)", diaSemanaDeIso("2026-10-30"), 5);
igual("2026-10-31 é sábado (6)", diaSemanaDeIso("2026-10-31"), 6);
igual("2026-11-01 é domingo (0)", diaSemanaDeIso("2026-11-01"), 0);

console.log(`grade-semana: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
