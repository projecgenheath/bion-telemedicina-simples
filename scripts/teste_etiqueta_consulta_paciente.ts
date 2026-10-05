/**
 * Teste da etiqueta única de estado da consulta (paciente).
 * Rodar: bun scripts/teste_etiqueta_consulta_paciente.ts
 */
import { etiquetaConsulta, type EntradaEtiqueta } from "../src/components/bion/paciente/etiqueta-consulta";

const agora = Date.parse("2026-10-05T12:00:00-03:00");
const base: EntradaEtiqueta = {
  status: "confirmada",
  pago: true,
  remarcacaoPendente: null,
  salaAberta: false,
  triagem: "nao_iniciada",
  triagemDisponivel: true,
  agora,
};
const futuro = new Date(agora + 3_600_000).toISOString();
const passado = new Date(agora - 3_600_000).toISOString();

const casos: [string, Partial<EntradaEtiqueta>, string][] = [
  ["confirmada com triagem pendente → Falta a triagem", {}, "Falta a triagem"],
  ["legado pendente_anamnese fora da janela → Falta a triagem", { status: "pendente_anamnese", triagemDisponivel: false }, "Falta a triagem"],
  ["triagem em andamento", { triagem: "andamento" }, "Triagem em andamento"],
  ["triagem feita → Confirmada", { triagem: "feita" }, "Confirmada"],
  ["janela da triagem fechada → Confirmada", { triagemDisponivel: false }, "Confirmada"],
  ["sala aberta ganha da triagem", { salaAberta: true }, "Sala aberta"],
  ["em_espera → Aguardando pagamento", { status: "em_espera", triagemDisponivel: false }, "Aguardando pagamento"],
  ["pago false ganha da sala", { pago: false, salaAberta: true }, "Aguardando pagamento"],
  ["remarcação pendente vigente", { remarcacaoPendente: { status: "pendente", expiraEm: futuro } }, "Remarcação pendente"],
  ["remarcação expirada é ignorada", { remarcacaoPendente: { status: "pendente", expiraEm: passado }, triagem: "feita" }, "Confirmada"],
];

let falhas = 0;
for (const [nome, extra, esperado] of casos) {
  const r = etiquetaConsulta({ ...base, ...extra }).texto;
  const ok = r === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}: ${r}${ok ? "" : ` (esperado ${esperado})`}`);
}
if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\n${casos.length} casos ok`);
