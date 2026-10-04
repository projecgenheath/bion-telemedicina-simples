/**
 * Teste do lado do paciente da janela sem teleconsulta 23:00–00:00 (São Paulo).
 * Rodar:
 *   bun scripts/teste_horario_vedado_paciente.ts
 *   TZ=UTC bun scripts/teste_horario_vedado_paciente.ts
 *   TZ=Asia/Tokyo bun scripts/teste_horario_vedado_paciente.ts
 */
import type { Consulta, Medico } from "../src/lib/bion-tipos";
import { agendaLivreDoMedico, horaVedadaParaPaciente } from "../src/components/bion/paciente/agenda-medico";
import { diasDoAgendamento } from "../src/components/bion/agendamento/horarios";
import { slotNaJanelaVedada } from "../src/components/bion/medico/metricas";
import { consultaEmHorarioVedado, slotVedado } from "../src/lib/server/bloqueio-agenda";

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

// Relógio fixo: 2026-10-01 12:00 em São Paulo (15:00Z).
const AGORA = Date.parse("2026-10-01T15:00:00Z");
Date.now = () => AGORA;

const medico = {
  id: "med-1",
  nome: "Dra. Teste",
  status: "ativo",
  especialidade: "Clínica Geral",
  horariosDisponiveis: ["09:00", "22:00", "22:30", "22:31", "22:45", "23:00", "23:30", "23:59", "00:00"],
} as unknown as Medico;

const resumo = (dias: { iso: string; horarios: string[] }[]) => dias.map((d) => `${d.iso} ${d.horarios.join(",")}`);

/* ---------- agenda: 22:31–23:59 nunca aparecem ---------- */
const agenda = agendaLivreDoMedico(medico, [], undefined, 3);
igual("agenda sem 22:31–23:59", resumo(agenda), [
  "2026-10-01 22:00,22:30",
  "2026-10-02 09:00,22:00,22:30,00:00",
  "2026-10-03 09:00,22:00,22:30,00:00",
]);
// Remarcar (excluirConsultaId) e ChatBion (horizonte 7 + diasDoAgendamento) usam a mesma função.
const remarcar = agendaLivreDoMedico(medico, [], "c-qualquer", 2, ["2026-10-02"]);
igual("remarcar + dia bloqueado", resumo(remarcar), ["2026-10-01 22:00,22:30"]);
const chat = diasDoAgendamento(agendaLivreDoMedico(medico, [], undefined, 7), []);
igual(
  "ChatBion nunca oferece 22:31–23:59",
  chat.flatMap((d) => d.horarios).filter((h) => h > "22:30"),
  [],
);

// Médico só com horários vedados: nenhum dia oferecido.
const soNoite = { ...medico, horariosDisponiveis: ["23:00", "23:30"] } as unknown as Medico;
igual("grade toda vedada → agenda vazia", agendaLivreDoMedico(soNoite, [], undefined, 5), []);

/* ---------- mesma regra do servidor e da grade do médico, minuto a minuto ---------- */
{
  let diferentes = 0;
  for (let m = 0; m < 1440; m++) {
    const hh = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const p = horaVedadaParaPaciente(hh);
    const instante = new Date(`2026-10-10T${hh}:00-03:00`);
    if (p !== slotVedado(hh) || p !== slotNaJanelaVedada(m, 30) || p !== consultaEmHorarioVedado(instante)) diferentes++;
  }
  igual("1440 min: paciente = servidor = grade do médico", diferentes, 0);
}
igual("formato inválido → não vedado", [horaVedadaParaPaciente("24:00"), horaVedadaParaPaciente("x")], [false, false]);

console.log(`TZ=${process.env.TZ ?? "(padrão)"} — ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
