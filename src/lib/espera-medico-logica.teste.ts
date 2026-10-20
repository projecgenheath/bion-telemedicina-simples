/**
 * Testes da espera do médico (regras puras).
 * Rodar: bun src/lib/espera-medico-logica.teste.ts
 */
import {
  calcularDiferenca, calcularExpiraEm, conferirDiferencaEsperada, lerPedidoRemarcar,
  segundosRestantes, statusEfetivo, RESERVA_DIFERENCA_MIN, transicaoPermitida, STATUS_ESPERA,
} from "./espera-medico-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}
const t = (s: string) => new Date(s);
const H = t("2026-10-19T18:00:00.000Z");

// expiraEm = max(horário, entrada) + 10 min
igual("entrou cedo: conta do horário", calcularExpiraEm(H, t("2026-10-19T17:55:00Z")).toISOString(), "2026-10-19T18:10:00.000Z");
igual("entrou atrasado: conta da entrada", calcularExpiraEm(H, t("2026-10-19T18:07:30Z")).toISOString(), "2026-10-19T18:17:30.000Z");
igual("entrou na hora", calcularExpiraEm(H, H).toISOString(), "2026-10-19T18:10:00.000Z");

// status efetivo
const exp = t("2026-10-19T18:10:00Z");
igual("aguardando antes do prazo", statusEfetivo({ status: "aguardando", expiraEm: exp }, t("2026-10-19T18:09:59Z")), "aguardando");
igual("aguardando no prazo vira expirada", statusEfetivo({ status: "aguardando", expiraEm: exp }, exp), "expirada");
igual("final não muda", statusEfetivo({ status: "medico_entrou", expiraEm: exp }, t("2026-10-19T19:00:00Z")), "medico_entrou");
igual("segundos restantes", segundosRestantes(exp, t("2026-10-19T18:08:00.500Z")), 120);
igual("segundos depois do prazo", segundosRestantes(exp, t("2026-10-19T18:20:00Z")), 0);

// transições
igual("aguardando → medico_entrou", transicaoPermitida("aguardando", "medico_entrou"), true);
igual("aguardando → expirada", transicaoPermitida("aguardando", "expirada"), true);
igual("aguardando → cancelada (proibido)", transicaoPermitida("aguardando", "cancelada"), false);
igual("aguardando → remarcada (proibido)", transicaoPermitida("aguardando", "remarcada"), false);
igual("expirada → cancelada", transicaoPermitida("expirada", "cancelada"), true);
igual("expirada → remarcada", transicaoPermitida("expirada", "remarcada"), true);
igual("expirada → medico_entrou", transicaoPermitida("expirada", "medico_entrou"), true);
for (const f of ["medico_entrou", "cancelada", "remarcada"] as const)
  for (const p of STATUS_ESPERA) igual(`${f} é final (${p})`, transicaoPermitida(f, p), false);
igual("cancelada → remarcada (idempotência não deixa trocar)", transicaoPermitida("cancelada", "remarcada"), false);

igual("expirada → remarcando", transicaoPermitida("expirada", "remarcando"), true);
igual("remarcando → remarcada (pagou)", transicaoPermitida("remarcando", "remarcada"), true);
igual("remarcando → expirada (venceu/desistiu)", transicaoPermitida("remarcando", "expirada"), true);
igual("remarcando → cancelada (proibido: desistir antes)", transicaoPermitida("remarcando", "cancelada"), false);
igual("remarcando → medico_entrou (proibido)", transicaoPermitida("remarcando", "medico_entrou"), false);
igual("aguardando → remarcando (proibido)", transicaoPermitida("aguardando", "remarcando"), false);
igual("reserva da diferença = 10 min", RESERVA_DIFERENCA_MIN, 10);

// diferença
igual("novo mais caro: cobra", calcularDiferenca(15000, 20000), { valorAntigoCentavos: 15000, valorNovoCentavos: 20000, diferencaCentavos: 5000, acao: "cobrar" });
igual("novo mais barato: devolve", calcularDiferenca(20000, 12050), { valorAntigoCentavos: 20000, valorNovoCentavos: 12050, diferencaCentavos: -7950, acao: "devolver" });
igual("mesmo preço: nada", calcularDiferenca(15000, 15000).acao, "nada");
igual("arredonda centavos", calcularDiferenca(14999.6, 15000).diferencaCentavos, 0);

// preço visto pelo paciente
igual("preço igual", conferirDiferencaEsperada(5000, 5000), { ok: true });
igual("preço mudou", conferirDiferencaEsperada(5000, 6000), { ok: false, erro: "preco_mudou", diferencaAtualCentavos: 6000 });
igual("sinal invertido", conferirDiferencaEsperada(-500, 500).ok, false);
igual("não inteiro recusa", conferirDiferencaEsperada(50.5, 50.5).ok, false);

// corpo do POST
igual("corpo ok", lerPedidoRemarcar({ medicoId: " m1 ", diferencaEsperadaCentavos: -100 }), { medicoId: "m1", diferencaEsperadaCentavos: -100 });
igual("sem diferença", lerPedidoRemarcar({ medicoId: "m1" }), null);
igual("diferença em reais", lerPedidoRemarcar({ medicoId: "m1", diferencaEsperadaCentavos: 1.5 }), null);
igual("sem medico", lerPedidoRemarcar({ diferencaEsperadaCentavos: 0 }), null);

console.log(`espera-medico-logica: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
