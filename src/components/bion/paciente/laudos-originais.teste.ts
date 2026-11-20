/**
 * Laudos enviados à BION IA. Rodar: bun src/components/bion/paciente/laudos-originais.teste.ts
 */
import { laudoTemResultado, laudosDaIa } from "./laudos-originais";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

const arquivos = [
  { id: "1", nome: "hemograma.pdf", consulta: "BION IA" },
  { id: "2", nome: "receita.pdf", consulta: "Consulta" },
  { id: "3", nome: "foto.jpg", consulta: "BION IA" },
];

eq(
  "só laudos da BION IA",
  laudosDaIa(arquivos).map((a) => a.id),
  ["1", "3"],
);
eq("nome igual ao exame conta como lido", laudoTemResultado("hemograma.pdf", [{ arquivoNome: "hemograma.pdf" }]), true);
eq("sem resultado não conta", laudoTemResultado("foto.jpg", [{ arquivoNome: "hemograma.pdf" }]), false);
eq("exame sem nome de arquivo não conta", laudoTemResultado("foto.jpg", [{ arquivoNome: null }]), false);

console.log(`laudos-originais: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
