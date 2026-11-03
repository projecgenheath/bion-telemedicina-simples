/**
 * Testes da busca de medicamentos (melhoria nº 15 da auditoria médica):
 * catálogo local enxuto + frequentes do próprio médico derivados dos
 * documentos dele. Rodar: bun src/lib/catalogo-medicamentos.teste.ts
 */
import { CATALOGO_MEDICAMENTOS, buscarMedicamentos, frequentesDoMedico } from "./catalogo-medicamentos";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}`);
  }
}

// Catálogo: enxuto (dezenas), todo item com posologia, controlados marcados.
checa("catálogo tem dezenas de itens", CATALOGO_MEDICAMENTOS.length >= 30 && CATALOGO_MEDICAMENTOS.length <= 80);
checa("catálogo todo com posologia", CATALOGO_MEDICAMENTOS.every((c) => c.posologia.trim().length >= 5));
checa("catálogo sem nomes duplicados", new Set(CATALOGO_MEDICAMENTOS.map((c) => c.nome)).size === CATALOGO_MEDICAMENTOS.length);
checa("clonazepam é controlado no catálogo", CATALOGO_MEDICAMENTOS.find((c) => c.nome.startsWith("Clonazepam"))?.controlado === true);

const docs = [
  { tipo: "receita", medico: "Dra. Ana", medicamento: "Dipirona 500 mg", posologia: "1 cp 6/6h", duracao: "5 dias", criadoEm: "2026-10-01T10:00:00Z" },
  { tipo: "receita", medico: "Dra. Ana", medicamento: "Dipirona 500 mg", posologia: "1 comprimido de 6/6h se dor", duracao: "3 dias", criadoEm: "2026-10-20T10:00:00Z" },
  { tipo: "receita", medico: "Dra. Ana", medicamento: "Loratadina 10 mg", posologia: "1 comprimido ao dia", criadoEm: "2026-10-15T10:00:00Z" },
  { tipo: "receita", medico: "Dr. Bruno", medicamento: "Dipirona 500 mg", posologia: "outra", criadoEm: "2026-10-25T10:00:00Z" },
  { tipo: "atestado", medico: "Dra. Ana", medicamento: "Dipirona 500 mg", posologia: "não é receita", criadoEm: "2026-10-26T10:00:00Z" },
  { tipo: "receita", medico: "Dra. Ana", medicamento: "", posologia: "vazio", criadoEm: "2026-10-27T10:00:00Z" },
];

// Frequentes: só receitas do próprio médico, agrupadas, com a posologia
// mais recente e a contagem de emissões.
const freq = frequentesDoMedico(docs, "Dra. Ana");
igual("frequentes: dois medicamentos", freq.length, 2);
igual("frequentes: dipirona primeiro (2x)", freq[0]?.nome, "Dipirona 500 mg");
igual("frequentes: dipirona vezes", freq[0]?.vezes, 2);
igual("frequentes: posologia é a mais recente", freq[0]?.posologia, "1 comprimido de 6/6h se dor");
igual("frequentes: duração é a mais recente", freq[0]?.duracao, "3 dias");
igual("frequentes: fonte", freq[0]?.fonte, "frequente");
igual("frequentes sem médico", frequentesDoMedico(docs, ""), []);
igual("frequentes de outro médico", frequentesDoMedico(docs, "Dr. Bruno").length, 1);

// Busca: frequente vence o catálogo para o mesmo medicamento (sem duplicar).
const buscaDip = buscarMedicamentos("dipirona", freq);
igual("busca dipirona: primeiro é o frequente", buscaDip[0]?.fonte, "frequente");
checa("busca dipirona: sem duplicar com o catálogo", buscaDip.filter((s) => s.nome === "Dipirona 500 mg").length === 1);

// Busca vazia devolve os frequentes (atalho ao abrir o campo).
igual("busca vazia devolve frequentes", buscarMedicamentos("", freq).map((s) => s.nome), ["Dipirona 500 mg", "Loratadina 10 mg"]);

// Busca por prefixo de token e sem acento.
checa("busca 'amoxi' acha amoxicilina", buscarMedicamentos("amoxi", []).some((s) => s.nome.startsWith("Amoxicilina 500")));
checa("busca 'acido' sem acento no catálogo", buscarMedicamentos("losartana", []).some((s) => s.nome.startsWith("Losartana")));
checa("busca sem resultado", buscarMedicamentos("xilofone", []).length === 0);

// Limite respeitado.
checa("busca respeita o limite", buscarMedicamentos("a", [], 3).length === 3);

console.log(`catalogo-medicamentos: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
