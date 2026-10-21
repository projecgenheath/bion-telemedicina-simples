/** Filtro LGPD do Copilot do médico. Rodar: npx tsx src/lib/server/anonimizar-texto.teste.ts */
import { anonimizarTexto } from "./anonimizar-texto";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};
const nao = (n: string, texto: string, trecho: string) => {
  if (!texto.includes(trecho)) ok++; else { falhas++; console.error(`✗ ${n}: "${trecho}" ainda aparece em ${JSON.stringify(texto)}`); }
};
const nomes = ["Maria da Silva Souza", "João Pereira"];

igual("CPF formatado", anonimizarTexto("CPF 529.982.247-25 ok"), "CPF [CPF removido] ok");
igual("CPF só dígitos", anonimizarTexto("cpf 52998224725"), "cpf [CPF removido]");
igual("telefone", anonimizarTexto("ligar (11) 98765-4321"), "ligar [telefone removido]");
igual("telefone +55", anonimizarTexto("tel +55 11 987654321"), "tel [telefone removido]");
igual("e-mail", anonimizarTexto("mail maria@exemplo.com.br"), "mail [e-mail removido]");
igual("CEP formatado", anonimizarTexto("mora no 01310-100"), "mora no [CEP removido]");
igual("CEP só dígitos com a palavra", anonimizarTexto("CEP 01310100"), "[CEP removido]");
igual("data dd/mm/aaaa", anonimizarTexto("nasc. 03/07/1985"), "nasc. [data removida]");
igual("data dd-mm-aaaa", anonimizarTexto("nasc. 3-7-1985"), "nasc. [data removida]");
igual("data ISO", anonimizarTexto("nasc. 1985-07-03"), "nasc. [data removida]");
igual("nome completo", anonimizarTexto("Maria da Silva Souza tem HAS", { nomesPacientes: nomes }), "o paciente tem HAS");
igual("primeiro nome", anonimizarTexto("a maria relatou cefaleia", { nomesPacientes: nomes }), "a o paciente relatou cefaleia");
igual("último nome", anonimizarTexto("Sr. Pereira com DM2", { nomesPacientes: nomes }), "Sr. o paciente com DM2");
igual("nome dentro de palavra não troca", anonimizarTexto("Mariana", { nomesPacientes: nomes }), "Mariana");
const end = anonimizarTexto("mora na Rua das Flores, 123 - apto 45, perto do posto");
nao("endereço: rua", end, "Flores");
nao("endereço: número", end, "123");
nao("endereço: av", anonimizarTexto("Av. Paulista 1578"), "1578");
igual("clínico preservado", anonimizarTexto("PA 120/80, losartana 50 mg 1x/dia, glicemia 110"), "PA 120/80, losartana 50 mg 1x/dia, glicemia 110");
igual("CID preservado", anonimizarTexto("CID I10 e E11.9"), "CID I10 e E11.9");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
