/**
 * Regra 3.3 (decisão do Presidente em 27/11, contrato 3.3): falta do SEGUNDO
 * médico depois da troca da regra 3. A espera renasce "aguardando" na mesma
 * consulta; cada nova falta reinicia o prazo de 7 dias (regra 4). Regras
 * puras, sem banco.
 */
import {
  calcularExpiraEm,
  esperaRenascidaPlataforma,
  ESPERA_MEDICO_MIN,
  statusEfetivo,
  transicaoPermitida,
} from "./espera-medico-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`);
  }
}

// Marcador da espera renascida: só a linha que a troca da regra 3 grava
// (diferença 0 + valor antigo gravado) enquanto aguardando/expirada.
igual("renascida aguardando", esperaRenascidaPlataforma({ status: "aguardando", diferencaCentavos: 0, valorAntigoCentavos: 15000 }), true);
igual("renascida expirada", esperaRenascidaPlataforma({ status: "expirada", diferencaCentavos: 0, valorAntigoCentavos: 15000 }), true);
igual("espera inicial (campos null) não é renascida", esperaRenascidaPlataforma({ status: "aguardando", diferencaCentavos: null, valorAntigoCentavos: null }), false);
igual("espera inicial expirada não é renascida", esperaRenascidaPlataforma({ status: "expirada", diferencaCentavos: null, valorAntigoCentavos: null }), false);
igual("legado remarcada não é renascida", esperaRenascidaPlataforma({ status: "remarcada", diferencaCentavos: 0, valorAntigoCentavos: 15000 }), false);
igual("legado remarcando não é renascida", esperaRenascidaPlataforma({ status: "remarcando", diferencaCentavos: 5000, valorAntigoCentavos: 15000 }), false);
igual("legado após liberar reserva (campos null) não é renascida", esperaRenascidaPlataforma({ status: "expirada", diferencaCentavos: null, valorAntigoCentavos: null }), false);
igual("diferença 0 sem valor antigo não é renascida", esperaRenascidaPlataforma({ status: "expirada", diferencaCentavos: 0, valorAntigoCentavos: null }), false);
igual("diferença positiva não é renascida", esperaRenascidaPlataforma({ status: "expirada", diferencaCentavos: 5000, valorAntigoCentavos: 15000 }), false);
igual("medico_entrou não é renascida", esperaRenascidaPlataforma({ status: "medico_entrou", diferencaCentavos: 0, valorAntigoCentavos: 15000 }), false);
igual("cancelada não é renascida", esperaRenascidaPlataforma({ status: "cancelada", diferencaCentavos: 0, valorAntigoCentavos: 15000 }), false);

// Janela renascida: max(novo dataInicio, instante da troca) + 10 min.
// O dataInicio da troca é o instante arredondado para o minuto (≤ agora).
const agora = new Date("2026-10-19T18:00:30.000Z");
const inicio = new Date(Math.floor(agora.getTime() / 60_000) * 60_000);
const expiraEm = calcularExpiraEm(inicio, agora);
igual("janela renascida = troca + 10 min", expiraEm.toISOString(), new Date(agora.getTime() + ESPERA_MEDICO_MIN * 60_000).toISOString());

// Vencida a janela renascida, a leitura já mostra expirada e o paciente
// volta a poder escolher (cancelar com reembolso ou trocar de novo).
const vencida = new Date(expiraEm.getTime() + 1000);
igual("renascida vencida lê como expirada", statusEfetivo({ status: "aguardando", expiraEm }, vencida), "expirada");
igual("expirada permite cancelar de novo", transicaoPermitida("expirada", "cancelada"), true);
igual("expirada permite remarcar de novo", transicaoPermitida("expirada", "remarcada"), true);

// Cadeia sem limite: cada troca gera uma NOVA janela à frente da anterior.
const troca2 = new Date(agora.getTime() + 12 * 60_000);
const inicio2 = new Date(Math.floor(troca2.getTime() / 60_000) * 60_000);
const expiraEm2 = calcularExpiraEm(inicio2, troca2);
igual("segunda troca gera janela nova à frente", expiraEm2.getTime() > expiraEm.getTime(), true);
igual("segunda janela = segunda troca + 10 min", expiraEm2.toISOString(), new Date(troca2.getTime() + ESPERA_MEDICO_MIN * 60_000).toISOString());

console.log(`regra33: ${ok} ok, ${falhas} falhas`);
if (falhas > 0) process.exit(1);
