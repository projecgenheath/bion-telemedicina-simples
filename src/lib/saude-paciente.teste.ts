/** Rodar: bun --conditions=react-server src/lib/saude-paciente.teste.ts */
import { detalhesAuditoria, lerTiposPedido, validarResposta, lerPosologia, resumoMedicamento, validarMedicamento } from "./saude-paciente";

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

igual("tipos válidos", lerTiposPedido('["peso","pressao"]'), ["peso", "pressao"]);
igual("pa vira pressao, sem repetir", lerTiposPedido('["pa","pressao","x"]'), ["pressao"]);
igual("json ruim", lerTiposPedido("{"), []);
igual("não-array", lerTiposPedido('{"a":1}'), []);
igual("nulo", lerTiposPedido(null), []);

igual("resposta completa", validarResposta(["peso", "altura", "pressao"], { peso: 70, altura: 170, sistolica: 120, diastolica: 80 }), {
  ok: true,
  medicoes: [
    { tipo: "peso", valor1: 70 },
    { tipo: "altura", valor1: 170 },
    { tipo: "pa", valor1: 120, valor2: 80 },
  ],
});
igual("peso faltando", validarResposta(["peso"], {}).ok, false);
igual("peso absurdo", validarResposta(["peso"], { peso: 900 }).ok, false);
igual("diastólica >= sistólica", validarResposta(["pressao"], { sistolica: 80, diastolica: 90 }).ok, false);
igual("pedido vazio", validarResposta([], { peso: 70 }).ok, false);
igual("ignora campos não pedidos", validarResposta(["altura"], { altura: 160, peso: 9999 }), { ok: true, medicoes: [{ tipo: "altura", valor1: 160 }] });

igual("posologia", lerPosologia('{"frequencia":"8/8h","horarios":["08:00","25:00"],"duracaoDias":7}'), {
  frequencia: "8/8h",
  horarios: ["08:00"],
  duracaoDias: 7,
});
igual("posologia ruim", lerPosologia("x"), {});
igual("resumo", resumoMedicamento({ dose: "500 mg", via: "oral", posologia: '{"frequencia":"8/8h"}' }), "500 mg · oral · 8/8h");
igual("resumo vazio", resumoMedicamento({ dose: null, via: " ", posologia: null }), "");

igual("med sem nome", validarMedicamento({ nome: " a " }).ok, false);
igual("med ok", validarMedicamento({ nome: " Losartana ", dose: "50 mg", frequencia: "1x ao dia", usoContinuo: true }), {
  ok: true,
  dados: { nome: "Losartana", dose: "50 mg", via: null, posologia: '{"frequencia":"1x ao dia"}', usoContinuo: true },
});

igual("auditoria só ids/tipos", detalhesAuditoria({ pacienteId: "u1", pedidoId: "p1", tipos: ["peso", "pa"], x: undefined, y: null }), '{"pacienteId":"u1","pedidoId":"p1","tipos":["peso","pa"]}');
igual("auditoria sem dígitos de medida", /\d{2,}/.test(detalhesAuditoria({ pacienteId: "u", medicaoId: "m", tipos: ["pa"] })), false);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
