/**
 * Testes do valor retido na plataforma (função pura, sem banco).
 * Rodar (precisa da condição react-server por causa do "server-only"):
 *   bun --conditions=react-server src/lib/server/retido-plataforma.teste.ts
 * Modelo novo: decisão do Alisson de 21/11/2026 (regras 1 e 2).
 */
import { valorRetidoDaConsulta, type ConsultaRetidaCandidata } from "./retido-plataforma";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

const DATA = new Date("2026-11-28T18:00:00.000Z");
const pagamento = (p: Partial<NonNullable<ConsultaRetidaCandidata["pagamento"]>> = {}) => ({
  status: "confirmado",
  stripeContaMedico: null,
  reembolsos: [],
  ...p,
});
const c = (p: Partial<ConsultaRetidaCandidata> = {}): ConsultaRetidaCandidata => ({
  id: "c1",
  status: "confirmada",
  dataInicio: DATA,
  valor: 150,
  pago: true,
  eventos: [],
  pagamento: pagamento(),
  ...p,
});
const evento = (tipo: string, motivo: string, extra: Partial<{ dataAnterior: Date; corrigidoEm: Date | null }> = {}) => ({
  id: "e1",
  tipo,
  motivo,
  em: DATA,
  dataAnterior: DATA,
  corrigidoEm: null,
  ...extra,
});

/* ---------- entra no retido ---------- */
igual("paga na plataforma, sem desfecho: valor integral", valorRetidoDaConsulta(c()), 15000);
igual("em_espera também aguarda a consulta", valorRetidoDaConsulta(c({ status: "em_espera" })), 15000);
igual("pendente_anamnese também aguarda", valorRetidoDaConsulta(c({ status: "pendente_anamnese" })), 15000);
igual("reembolso parcial efetivo abate do retido", valorRetidoDaConsulta(c({ pagamento: pagamento({ reembolsos: [{ status: "processado", valorCentavos: 5000 }] }) })), 10000);
igual("reembolso em análise NÃO abate", valorRetidoDaConsulta(c({ pagamento: pagamento({ reembolsos: [{ status: "em_analise", valorCentavos: 5000 }] }) })), 15000);
igual("evento de falta corrigido pelo admin não tira do retido", valorRetidoDaConsulta(c({ eventos: [evento("falta_paciente", "falta_paciente", { corrigidoEm: DATA })] })), 15000);
igual("evento de data antiga não vale para a data atual", valorRetidoDaConsulta(c({ eventos: [evento("falta_paciente", "falta_paciente", { dataAnterior: new Date("2026-11-20T18:00:00.000Z") })] })), 15000);

/* ---------- fica fora do retido ---------- */
igual("cobrança direta (modelo anterior): já caiu na conta do médico", valorRetidoDaConsulta(c({ pagamento: pagamento({ stripeContaMedico: "acct_123" }) })), 0);
igual("stripeContaMedico vazio/whitespace não é cobrança direta", valorRetidoDaConsulta(c({ pagamento: pagamento({ stripeContaMedico: "  " }) })), 15000);
igual("consulta realizada: transferência é parte do Admin, não retido", valorRetidoDaConsulta(c({ status: "concluida" })), 0);
igual("falta do paciente vigente: reembolso (Admin), não retido", valorRetidoDaConsulta(c({ eventos: [evento("falta_paciente", "falta_paciente")] })), 0);
igual("falha técnica vigente: não retido", valorRetidoDaConsulta(c({ eventos: [evento("falha_tecnica", "falha_tecnica")] })), 0);
igual("falta do médico vigente: não retido", valorRetidoDaConsulta(c({ eventos: [evento("falha_tecnica", "falta_medico")] })), 0);
igual("cancelada: fora", valorRetidoDaConsulta(c({ status: "cancelada" })), 0);
igual("aguardando_reagendamento: fora", valorRetidoDaConsulta(c({ status: "aguardando_reagendamento" })), 0);
igual("não paga: fora", valorRetidoDaConsulta(c({ pago: false })), 0);
igual("pagamento pendente: fora", valorRetidoDaConsulta(c({ pagamento: pagamento({ status: "pendente" }) })), 0);
igual("sem pagamento: fora", valorRetidoDaConsulta(c({ pagamento: null })), 0);
igual("valor zero (retorno grátis/renovação): fora", valorRetidoDaConsulta(c({ valor: 0 })), 0);
igual("reembolso integral efetivo: nada retido", valorRetidoDaConsulta(c({ pagamento: pagamento({ reembolsos: [{ status: "aprovado", valorCentavos: 15000 }] }) })), 0);
igual("reembolso maior que o bruto: nunca negativo", valorRetidoDaConsulta(c({ pagamento: pagamento({ reembolsos: [{ status: "processado", valorCentavos: 20000 }] }) })), 0);

console.log(`retido-plataforma: ${ok} ok, ${falhas} falhas`);
if (falhas > 0) process.exit(1);
