/** Rodar: bun --conditions=react-server src/lib/saude-paciente.teste.ts */
import { detalhesAuditoria, lerTiposPedido, validarResposta, lerPosologia, resumoMedicamento, validarMedicamento, dividirMedicamentosLegado, chaveMedicamento, removerPedidoCancelado, horariosSugeridos, descricaoAvisos, resumoAvisos, rotuloFrequenciaPosologia, validarAvisos } from "./saude-paciente";

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

// Import do campo antigo PerfilPaciente.medicamentos
igual("legado JSON + vírgula/;/linha", dividirMedicamentosLegado('["Losartana 50 mg, AAS; Metformina\\nVitamina D"]'), ["Losartana 50 mg", "AAS", "Metformina", "Vitamina D"]);
igual("legado texto solto", dividirMedicamentosLegado("dipirona;  omeprazol  20mg"), ["dipirona", "omeprazol 20mg"]);
igual("dedupe sem caixa/acento", dividirMedicamentosLegado('["Losartana","LOSARTANA","losartána"]'), ["Losartana"]);
igual("dedupe contra existentes", dividirMedicamentosLegado('["Losartana","AAS"]', ["losartana"]), ["AAS"]);
igual("vazio/[] não importa", [dividirMedicamentosLegado(""), dividirMedicamentosLegado("[]"), dividirMedicamentosLegado(null)], [[], [], []]);
igual("descarta curtos e não-string", dividirMedicamentosLegado('["a", 3, " , ", "Insulina"]'), ["Insulina"]);
igual("máximo 50", dividirMedicamentosLegado(JSON.stringify(Array.from({ length: 60 }, (_, i) => `rem${i}`))).length, 50);
igual("nome cortado em 120", dividirMedicamentosLegado(JSON.stringify(["x".repeat(200)]))[0].length, 120);
{
  // Idempotência: depois do import, o campo vira "[]" e uma segunda passada não cria nada;
  // e mesmo sem limpar, reimportar contra a lista já criada não repete.
  const primeira = dividirMedicamentosLegado('["AAS","Losartana"]', []);
  igual("idempotente: campo limpo", dividirMedicamentosLegado("[]", primeira), []);
  igual("idempotente: reimport contra existentes", dividirMedicamentosLegado('["AAS","Losartana"]', primeira), []);
}
igual("chave normaliza", chaveMedicamento("  Ácido   Fólico "), "acido folico");

{
  const lista = [{ id: "p1" }, { id: "p2" }];
  igual("cancelado sai da lista", removerPedidoCancelado(lista, "p1"), [{ id: "p2" }]);
  igual("id desconhecido: mesma lista", removerPedidoCancelado(lista, "x") === lista, true);
  igual("id inválido: mesma lista", [removerPedidoCancelado(lista, undefined), removerPedidoCancelado(lista, 3), removerPedidoCancelado(lista, "")].every((l) => l === lista), true);
}

// Avisos estruturados: sugestões de horários
igual("sugestão 1x", horariosSugeridos(1), ["08:00"]);
igual("sugestão 2x = 12/12h", horariosSugeridos(2), ["08:00", "20:00"]);
igual("sugestão 3x = 6/6h acordado", horariosSugeridos(3), ["08:00", "14:00", "20:00"]);
igual("sugestão 4x = 4/4h acordado", horariosSugeridos(4), ["08:00", "12:00", "16:00", "20:00"]);
igual("sugestão wrap 2x âncora 21:00", horariosSugeridos(2, "21:00"), ["21:00", "09:00"]);
igual("sugestão mantém minutos", horariosSugeridos(2, "07:30"), ["07:30", "19:30"]);
igual("sugestão âncora inválida cai p/ 08:00", horariosSugeridos(2, "99:99"), ["08:00", "20:00"]);
igual("sugestão vezes fora da faixa cai p/ 1x", horariosSugeridos(7), ["08:00"]);

// lerPosologia com os campos novos (e tolerância)
igual("posologia estruturada", lerPosologia('{"frequencia":"2x ao dia","horarios":["08:00","20:00"],"vezesAoDia":2}'), {
  frequencia: "2x ao dia",
  horarios: ["08:00", "20:00"],
  vezesAoDia: 2,
});
igual("posologia semanal dia 0 (domingo) não some", lerPosologia('{"horarios":["09:00"],"diaSemana":0}'), { horarios: ["09:00"], diaSemana: 0 });
igual("posologia descarta fora da faixa", lerPosologia('{"vezesAoDia":9,"diaSemana":7}'), {});
igual("posologia descarta não-inteiros", lerPosologia('{"vezesAoDia":2.5,"diaSemana":"1"}'), {});

// Resumo em linguagem simples
igual("resumo 2x", resumoAvisos({ frequencia: "2x ao dia", horarios: ["20:00", "08:00"], vezesAoDia: 2 }), "2x ao dia · avisos às 08:00 e 20:00, todos os dias");
igual("resumo 1x", descricaoAvisos({ horarios: ["08:00"], vezesAoDia: 1 }), "um aviso às 08:00, todos os dias");
igual("resumo 3x", descricaoAvisos({ horarios: ["08:00", "14:00", "20:00"], vezesAoDia: 3 }), "avisos às 08:00, 14:00 e 20:00, todos os dias");
igual("resumo semanal segunda", resumoAvisos({ horarios: ["08:00"], diaSemana: 1 }), "1x por semana · um aviso toda segunda às 08:00");
igual("resumo semanal domingo (todo)", descricaoAvisos({ horarios: ["09:00"], diaSemana: 0 }), "um aviso todo domingo às 09:00");
igual("resumo semanal sábado (todo)", descricaoAvisos({ horarios: ["09:00"], diaSemana: 6 }), "um aviso todo sábado às 09:00");
igual("resumo sem horários", resumoAvisos({ frequencia: "8/8h" }), "");
igual("rótulo legado preservado", rotuloFrequenciaPosologia({ frequencia: "8/8h" }), "8/8h");

// validarAvisos
igual("avisos ausentes = legado", validarAvisos({}), { ok: true, avisos: null });
igual("avisos diário ordena e deduplica", validarAvisos({ horarios: ["20:00", "08:00", "08:00"], vezesAoDia: 2 }), {
  ok: true,
  avisos: {
    horarios: ["08:00", "20:00"],
    semanal: false,
    vezesAoDia: 2,
    rotulo: "2x ao dia",
    frequenciaLembrete: "Todos os dias",
    posologia: { frequencia: "2x ao dia", horarios: ["08:00", "20:00"], vezesAoDia: 2 },
  },
});
igual("avisos vezesAoDia divergente ajusta à contagem", validarAvisos({ horarios: ["08:00"], vezesAoDia: 3 }).ok && (validarAvisos({ horarios: ["08:00"], vezesAoDia: 3 }) as { avisos: { vezesAoDia?: number } }).avisos?.vezesAoDia, 1);
igual("avisos semanal", validarAvisos({ horarios: ["09:00"], diaSemana: 1 }), {
  ok: true,
  avisos: {
    horarios: ["09:00"],
    semanal: true,
    diaSemana: 1,
    rotulo: "1x por semana",
    frequenciaLembrete: "Semanal",
    posologia: { frequencia: "1x por semana", horarios: ["09:00"], diaSemana: 1 },
  },
});
igual("avisos semanal com 2 horários = erro", validarAvisos({ horarios: ["08:00", "20:00"], diaSemana: 1 }).ok, false);
igual("avisos hora inválida = erro", validarAvisos({ horarios: ["25:00"] }).ok, false);
igual("avisos 5 horários = erro", validarAvisos({ horarios: ["01:00", "02:00", "03:00", "04:00", "05:00"] }).ok, false);
igual("avisos não-array = erro", validarAvisos({ horarios: "08:00" }).ok, false);
igual("avisos vazio sem permissão = erro", validarAvisos({ horarios: [] }).ok, false);
igual("avisos vazio com permissão = conjunto vazio", validarAvisos({ horarios: [] }, { permitirVazio: true }), {
  ok: true,
  avisos: { horarios: [], semanal: false, rotulo: "", frequenciaLembrete: "Todos os dias", posologia: { horarios: [] } },
});

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
