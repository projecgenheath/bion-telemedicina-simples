/**
 * Testes do cálculo da receita líquida do médico (receita-servidor.ts).
 * Rodar (precisa da condição react-server por causa do "server-only"):
 *   bun --conditions=react-server src/components/bion/medico/receita-servidor.teste.ts
 * Nada toca o banco: só funções puras.
 */
import {
  calcularReceita,
  consultaEntraNaReceita,
  consultaReembolsadaIntegral,
  intervaloReceita,
  multaCancelamentoDevolvida,
  type ConsultaReceita,
} from "./receita-servidor";

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

const AGORA = new Date("2026-10-01T18:00:00.000Z"); // 15:00 SP
const pagamento = (reembolsos: { status: string; valorCentavos: number; origem?: string }[] = [], status = "confirmado") => ({
  status,
  reembolsos,
});
const c = (p: Partial<ConsultaReceita> & { id: string; dataInicio: Date }): ConsultaReceita => ({
  status: "concluida",
  valor: 150,
  pago: true,
  pagamento: pagamento(),
  ...p,
});

/* ---------- intervalo ---------- */
const iv = intervaloReceita("2026-09-30", "2026-10-01");
igual("intervalo 2 dias", "erro" in iv ? iv : { inicio: iv.inicio.toISOString(), fim: iv.fim.toISOString(), dias: iv.dias }, {
  inicio: "2026-09-30T03:00:00.000Z",
  fim: "2026-10-02T03:00:00.000Z",
  dias: ["2026-09-30", "2026-10-01"],
});
igual("intervalo invertido", "erro" in intervaloReceita("2026-10-02", "2026-10-01"), true);
igual("data inválida", "erro" in intervaloReceita("2026-02-31", "2026-03-01"), true);
igual("formato inválido", "erro" in intervaloReceita("01/10/2026", "2026-10-01"), true);
igual("366 dias ok", "erro" in intervaloReceita("2025-10-01", "2026-10-01"), false);
igual("mais de 366 dias recusa", "erro" in intervaloReceita("2025-09-29", "2026-10-01"), true);

/* ---------- inclusão ---------- */
const d = new Date("2026-10-01T12:00:00.000Z"); // 09:00 SP
igual("concluída paga entra", consultaEntraNaReceita(c({ id: "1", dataInicio: d }), AGORA), true);
igual("confirmada paga que já passou entra", consultaEntraNaReceita(c({ id: "1", dataInicio: d, status: "confirmada" }), AGORA), true);
igual("não paga fora", consultaEntraNaReceita(c({ id: "1", dataInicio: d, pago: false }), AGORA), false);
igual("pagamento não confirmado fora", consultaEntraNaReceita(c({ id: "1", dataInicio: d, pagamento: pagamento([], "falhou") }), AGORA), false);
igual("cancelada fora", consultaEntraNaReceita(c({ id: "1", dataInicio: d, status: "cancelada" }), AGORA), false);
igual("aguardando_reagendamento fora", consultaEntraNaReceita(c({ id: "1", dataInicio: d, status: "aguardando_reagendamento" }), AGORA), false);
igual("futura (ainda não realizada) fora", consultaEntraNaReceita(c({ id: "1", dataInicio: new Date("2026-10-01T20:00:00.000Z") }), AGORA), false);
igual("pago legado sem Pagamento entra", consultaEntraNaReceita(c({ id: "1", dataInicio: d, pagamento: null }), AGORA), true);

/* ---------- reembolso integral (regra do dono) ---------- */
for (const status of ["aprovado", "processado"]) {
  igual(`reembolso integral ${status} exclui`, consultaReembolsadaIntegral(15000, [{ status, valorCentavos: 15000 }]), true);
}
for (const status of ["em_analise", "solicitado", "negado", "falhou"]) {
  igual(`reembolso integral ${status} NÃO exclui`, consultaReembolsadaIntegral(15000, [{ status, valorCentavos: 15000 }]), false);
}
igual("reembolso parcial aprovado não exclui", consultaReembolsadaIntegral(15000, [{ status: "aprovado", valorCentavos: 7500 }]), false);
igual("manual aprovado exclui (sempre integral)", consultaReembolsadaIntegral(15000, [{ status: "aprovado", valorCentavos: 14999, origem: "manual" }]), true);
igual("manual em_analise não exclui", consultaReembolsadaIntegral(15000, [{ status: "em_analise", valorCentavos: 15000, origem: "manual" }]), false);
igual(
  "falta com reembolso manual aprovado fora da receita",
  consultaEntraNaReceita(c({ id: "1", dataInicio: d, pagamento: pagamento([{ status: "aprovado", valorCentavos: 15000, origem: "manual" }]) }), AGORA),
  false,
);

/* ---------- multa devolvida ---------- */
igual(
  "multa de cancelamento retida (reembolso valor − multa)",
  multaCancelamentoDevolvida({ em: d, multaCentavos: 7500, valorConsulta: 150, reembolsos: [{ status: "aprovado", valorCentavos: 7500 }] }),
  false,
);
igual(
  "multa de cancelamento devolvida (reembolso integral)",
  multaCancelamentoDevolvida({ em: d, multaCentavos: 7500, valorConsulta: 150, reembolsos: [{ status: "processado", valorCentavos: 15000 }] }),
  true,
);

/* ---------- cálculo por dia ---------- */
const r = calcularReceita({
  de: "2026-09-30",
  ate: "2026-10-01",
  dias: ["2026-09-30", "2026-10-01"],
  agora: AGORA,
  consultas: [
    c({ id: "a", dataInicio: new Date("2026-10-01T02:30:00.000Z") }), // 30/09 23:30 SP (em UTC já é 01/10)
    c({ id: "b", dataInicio: d, valor: 200 }),
    c({ id: "c", dataInicio: d, status: "cancelada" }),
    c({ id: "d", dataInicio: d, pagamento: pagamento([{ status: "aprovado", valorCentavos: 15000, origem: "manual" }]) }),
    c({ id: "e", dataInicio: d, pagamento: pagamento([{ status: "negado", valorCentavos: 15000, origem: "manual" }]) }),
  ],
  multasCancelamento: [
    { em: d, multaCentavos: 7500, valorConsulta: 150, reembolsos: [{ status: "aprovado", valorCentavos: 7500 }] },
    { em: d, multaCentavos: 7500, valorConsulta: 150, reembolsos: [{ status: "aprovado", valorCentavos: 15000 }] }, // devolvida
  ],
  multasRemarcacao: [
    { quando: new Date("2026-09-30T15:00:00.000Z"), multaCentavos: 5001, reembolso: null },
    { quando: d, multaCentavos: 7500, reembolso: { status: "processado", valorCentavos: 7500 } }, // devolvida
  ],
});
igual("dia 30/09", r.dias[0], {
  dia: "2026-09-30",
  liquidoCentavos: 13500,
  brutoCentavos: 15000,
  comissaoCentavos: 1500,
  taxaCentavos: 0,
  multasMedicoCentavos: 2501, // 50% de 50,01 arredondado
  totalCentavos: 16001,
  consultas: 1,
});
igual("dia 01/10", r.dias[1], {
  dia: "2026-10-01",
  liquidoCentavos: 18000 + 13500, // b (200) + e (150, reembolso negado)
  brutoCentavos: 35000,
  comissaoCentavos: 3500,
  taxaCentavos: 0,
  multasMedicoCentavos: 3750,
  totalCentavos: 31500 + 3750,
  consultas: 2,
});
igual("totais", r.totais, {
  liquidoCentavos: 45000,
  brutoCentavos: 50000,
  comissaoCentavos: 5000,
  taxaCentavos: 0,
  multasMedicoCentavos: 6251,
  totalCentavos: 51251,
  consultas: 3,
});
igual("regra", r.regra, { comissaoPct: 10, multaParteMedicoPct: 50 });

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
