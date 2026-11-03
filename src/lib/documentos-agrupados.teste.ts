/**
 * Testes do agrupamento de emissões (lib/documentos-agrupados) — item 25
 * da auditoria de melhorias médicas: itens de uma receita agrupada (um
 * Documento por medicamento) voltam a ser UMA receita nas leituras, sem
 * nunca misturar emissões distintas.
 * Rodar: bun src/lib/documentos-agrupados.teste.ts
 */
import {
  agruparEmissoes,
  grupoDaEmissao,
  mesmaEmissaoReceita,
  ultimaReceitaDoPaciente,
} from "./documentos-agrupados";
import type { Documento } from "./bion-tipos";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}
function verdade(nome: string, cond: boolean) {
  igual(nome, cond, true);
}

const T0 = Date.parse("2026-10-30T12:00:00.000Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
let seq = 0;
function doc(parcial: Partial<Documento>): Documento {
  seq++;
  return {
    id: `doc${seq}`,
    tipo: "receita",
    titulo: "Receita — Tratamento",
    medico: "Dra. Ana",
    paciente: "Paciente Um",
    pacienteId: "pac1",
    consultaId: "cons1",
    conteudo: "Prescrevo algo.",
    data: "30 de outubro de 2026",
    criadoEm: iso(0),
    medicamento: "Loratadina 10 mg",
    posologia: "1 comprimido ao dia",
    duracao: "30 dias",
    ...parcial,
  };
}

// Emissão agrupada: 3 itens, mesmo tudo, segundos de diferença.
const a = doc({ medicamento: "Loratadina 10 mg", criadoEm: iso(0) });
const b = doc({ medicamento: "Dipirona 500 mg", criadoEm: iso(4_000) });
const c = doc({ medicamento: "Omeprazol 20 mg", criadoEm: iso(9_000) });
verdade("itens da mesma emissão se reconhecem", mesmaEmissaoReceita(a, b) && mesmaEmissaoReceita(a, c));
igual("grupo da emissão tem os 3 em ordem de criação", grupoDaEmissao([c, a, b], a).map((d) => d.id), [a.id, b.id, c.id]);

// O que NÃO agrupa: título, consulta, médico, paciente ou janela diferentes.
verdade("título diferente não agrupa", !mesmaEmissaoReceita(a, doc({ titulo: "Receita — Outra", criadoEm: iso(1_000) })));
verdade("consulta diferente não agrupa", !mesmaEmissaoReceita(a, doc({ consultaId: "cons2", criadoEm: iso(1_000) })));
verdade("médico diferente não agrupa", !mesmaEmissaoReceita(a, doc({ medico: "Dr. Outro", criadoEm: iso(1_000) })));
verdade("paciente diferente não agrupa", !mesmaEmissaoReceita(a, doc({ pacienteId: "pac2", criadoEm: iso(1_000) })));
verdade("janela estourada não agrupa", !mesmaEmissaoReceita(a, doc({ criadoEm: iso(121_000) })));
verdade("atestado não agrupa", !mesmaEmissaoReceita(a, doc({ tipo: "atestado", criadoEm: iso(1_000) })));
verdade("sem criadoEm não agrupa", !mesmaEmissaoReceita(a, doc({ criadoEm: undefined })));

// agruparEmissoes: a lista achata o grupo e preserva os avulsos na ordem.
const avulso = doc({ titulo: "Atestado — Repouso", tipo: "atestado", criadoEm: iso(60_000) });
const antiga = doc({ titulo: "Receita — Antiga", criadoEm: iso(-86_400_000) });
const entradas = agruparEmissoes([avulso, c, antiga, a, b]);
igual("três entradas (avulso, grupo, antiga)", entradas.length, 3);
igual("primeira entrada é o avulso", entradas[0].docs.map((d) => d.id), [avulso.id]);
igual("grupo mantém a ordem da lista", entradas[1].docs.map((d) => d.id), [c.id, a.id, b.id]);
igual("receita antiga segue avulsa", entradas[2].docs.map((d) => d.id), [antiga.id]);

// ultimaReceitaDoPaciente: pega a emissão mais recente, agrupada.
const recente1 = doc({ titulo: "Receita — Nova", criadoEm: iso(3_600_000), medicamento: "A" });
const recente2 = doc({ titulo: "Receita — Nova", criadoEm: iso(3_603_000), medicamento: "B" });
const lista = [antiga, recente1, b, recente2, a, c];
igual(
  "última receita vem agrupada e em ordem de criação",
  ultimaReceitaDoPaciente(lista, "pac1", "Dra. Ana")?.map((d) => d.medicamento),
  ["A", "B"],
);
igual("paciente sem receita → null", ultimaReceitaDoPaciente(lista, "pacX", "Dra. Ana"), null);
igual("médico sem receita do paciente → null", ultimaReceitaDoPaciente(lista, "pac1", "Dr. Ninguém"), null);

console.log(`documentos-agrupados: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
