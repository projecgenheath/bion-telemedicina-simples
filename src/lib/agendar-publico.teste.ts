/* Funil público: o cadastro só volta para a agenda da médica. bun run <arquivo> */
import { readFileSync } from "node:fs";
import { destinoDepoisDeEntrar, lerAgendaPublica } from "./agendar-publico";

let ok = 0;
let falhas = 0;
function igual(nome: string, real: unknown, esperado: unknown) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHA ${nome}: ${JSON.stringify(real)} != ${JSON.stringify(esperado)}`);
  }
}

igual("paciente volta para a agenda", destinoDepoisDeEntrar("paciente", "/p/medica1/agendar"), "/p/medica1/agendar");
igual("paciente sem volta vai para a área", destinoDepoisDeEntrar("paciente", null), "/paciente");
igual("volta externa não passa", destinoDepoisDeEntrar("paciente", "https://exemplo.test"), "/paciente");
igual("volta com barra dupla não passa", destinoDepoisDeEntrar("paciente", "//exemplo.test"), "/paciente");
igual("outra rota não passa", destinoDepoisDeEntrar("paciente", "/paciente/admin"), "/paciente");
igual("médico não entra na agenda do paciente", destinoDepoisDeEntrar("medico", "/p/medica1/agendar"), "/medico");
igual("admin vai ao painel", destinoDepoisDeEntrar("admin", "/p/medica1/agendar"), "/painel");

igual("json vazio não vira agenda", lerAgendaPublica(null), null);
const agenda = lerAgendaPublica({
  id: "medica1",
  nome: "Dra. Ana",
  especialidade: "Clínica Geral",
  crm: "CRM 1",
  valor: 150,
  horariosDisponiveis: ["09:00", "ruim"],
  horariosPorDia: { "1": ["10:00"] },
  diasAtendimento: [1, 9],
  pausasSemanais: [{ dia: 1, inicio: "12:00", fim: "13:00" }, { dia: 3, inicio: "x", fim: "13:00" }],
  diasBloqueados: ["2026-11-21", "amanha"],
  ocupadosIso: ["2026-11-21T13:00:00.000Z", "nao-e-data"],
});
igual("hora inválida sai da grade", agenda?.horariosDisponiveis, ["09:00"]);
igual("dia da semana fora de 0–6 sai", agenda?.diasAtendimento, [1]);
igual("pausa inválida sai", agenda?.pausasSemanais, [{ dia: 1, inicio: "12:00", fim: "13:00" }]);
igual("bloqueio sem data sai", agenda?.diasBloqueados, ["2026-11-21"]);
igual("ocupado sem instante sai", agenda?.ocupadosIso, ["2026-11-21T13:00:00.000Z"]);

const perfil = readFileSync(new URL("../app/p/[id]/page.tsx", import.meta.url), "utf8");
igual("o botão Agendar do perfil não vai mais para a home", /href="\/"/.test(perfil), false);
igual("o botão Agendar abre a agenda desta médica", perfil.includes("/agendar"), true);

if (falhas) {
  console.error(`${falhas} falha(s)`);
  process.exit(1);
}
console.log(`${ok} ok`);
