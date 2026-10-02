/**
 * Teste do lado do PACIENTE do bloqueio de dia inteiro:
 *  - agendaLivreDoMedico(..., bloqueados) remove os dias bloqueados (dia civil
 *    de São Paulo), sem mudar nada quando o parâmetro é omitido;
 *  - horário 22:00 em São Paulo (01:00Z do dia seguinte) pertence ao dia de SP;
 *  - buscarDiasBloqueados (hook useDiasBloqueados): cache por médico, uma
 *    requisição em voo, filtro de datas inválidas e conjunto vazio em erro.
 * Rodar:
 *   bun scripts/teste_dias_bloqueados_paciente.ts
 *   TZ=UTC bun scripts/teste_dias_bloqueados_paciente.ts
 *   TZ=Asia/Tokyo bun scripts/teste_dias_bloqueados_paciente.ts
 * O resultado deve ser o mesmo em qualquer TZ do processo.
 */
import type { Consulta, Medico } from "../src/lib/bion-tipos";
import { agendaLivreDoMedico } from "../src/components/bion/paciente/agenda-medico";
import { diasDoAgendamento } from "../src/components/bion/agendamento/horarios";
import { buscarDiasBloqueados, invalidarDiasBloqueados } from "../src/components/bion/paciente/useDiasBloqueados";

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
const dateNowOriginal = Date.now;
Date.now = () => AGORA;

const medico = {
  id: "med-1",
  nome: "Dra. Teste",
  status: "ativo",
  especialidade: "Clínica Geral",
  horariosDisponiveis: ["09:00", "22:00"],
} as unknown as Medico;

const consulta = (id: string, dataISO: string, hora: string, extra: Partial<Consulta> = {}): Consulta =>
  ({
    id,
    medico: medico.nome,
    medicoId: medico.id,
    especialidade: medico.especialidade,
    paciente: "Paciente",
    data: "",
    hora,
    status: "confirmada",
    ts: Date.parse(dataISO),
    dataISO,
    ...extra,
  }) as Consulta;

const resumo = (dias: { iso: string; horarios: string[] }[]) => dias.map((d) => `${d.iso} ${d.horarios.join(",")}`);

/* ---------- sem bloqueios: comportamento de antes ---------- */
const base = agendaLivreDoMedico(medico, [], undefined, 4);
igual("base (hoje só 22:00; 09:00 já passou)", resumo(base), [
  "2026-10-01 22:00",
  "2026-10-02 09:00,22:00",
  "2026-10-03 09:00,22:00",
  "2026-10-04 09:00,22:00",
]);
igual("rótulos", base.map((d) => d.rotulo), ["Hoje", "Amanhã", "3 Out", "4 Out"]);
igual("dia da semana (SP)", base.map((d) => d.sub), ["Qui", "Sex", "Sáb", "Dom"]);
igual("bloqueados undefined = base", resumo(agendaLivreDoMedico(medico, [], undefined, 4, undefined)), resumo(base));
igual("Set vazio = base", resumo(agendaLivreDoMedico(medico, [], undefined, 4, new Set())), resumo(base));
igual("array vazio = base", resumo(agendaLivreDoMedico(medico, [], undefined, 4, [])), resumo(base));
igual("horizonte padrão (14) sem bloqueios", agendaLivreDoMedico(medico, []).length, 14);

/* ---------- com bloqueios ---------- */
igual(
  "Set: hoje bloqueado some (inclusive o 22:00 = 01:00Z de amanhã)",
  resumo(agendaLivreDoMedico(medico, [], undefined, 4, new Set(["2026-10-01"]))),
  ["2026-10-02 09:00,22:00", "2026-10-03 09:00,22:00", "2026-10-04 09:00,22:00"],
);
igual(
  "bloquear amanhã NÃO remove o 22:00 de hoje (01:00Z de amanhã)",
  resumo(agendaLivreDoMedico(medico, [], undefined, 4, new Set(["2026-10-02"]))),
  ["2026-10-01 22:00", "2026-10-03 09:00,22:00", "2026-10-04 09:00,22:00"],
);
igual(
  "array com vários dias",
  resumo(agendaLivreDoMedico(medico, [], undefined, 4, ["2026-10-02", "2026-10-04"])),
  ["2026-10-01 22:00", "2026-10-03 09:00,22:00"],
);
igual(
  "dia bloqueado fora do horizonte não afeta",
  resumo(agendaLivreDoMedico(medico, [], undefined, 4, ["2026-12-25"])),
  resumo(base),
);
igual("todos bloqueados → agenda vazia", agendaLivreDoMedico(medico, [], undefined, 2, ["2026-10-01", "2026-10-02"]).length, 0);
igual(
  "rótulos continuam corretos com bloqueio",
  agendaLivreDoMedico(medico, [], undefined, 4, ["2026-10-02"]).map((d) => d.rotulo),
  ["Hoje", "3 Out", "4 Out"],
);

/* ---------- ocupados + bloqueados juntos ---------- */
// Consulta 22:00 SP de 02/10 = 2026-10-03T01:00Z: ocupa o 22:00 do dia 02 (SP), não do dia 03.
const ocupada22 = consulta("c1", "2026-10-03T01:00:00.000Z", "22:00");
igual(
  "ocupado 22:00 SP (01:00Z) fica no dia de SP",
  resumo(agendaLivreDoMedico(medico, [ocupada22], undefined, 4, ["2026-10-04"])),
  ["2026-10-01 22:00", "2026-10-02 09:00", "2026-10-03 09:00,22:00"],
);
igual(
  "remarcação: a própria consulta (excluirConsultaId) não ocupa",
  resumo(agendaLivreDoMedico(medico, [ocupada22], "c1", 3, ["2026-10-01"])),
  ["2026-10-02 09:00,22:00", "2026-10-03 09:00,22:00"],
);
igual(
  "consulta cancelada não ocupa",
  resumo(agendaLivreDoMedico(medico, [consulta("c2", "2026-10-03T01:00:00.000Z", "22:00", { status: "cancelada" })], undefined, 3)),
  ["2026-10-01 22:00", "2026-10-02 09:00,22:00", "2026-10-03 09:00,22:00"],
);
// Pipeline do agendamento/chat: diasDoAgendamento(agendaLivreDoMedico(..., bloqueados), consultas)
const outroMedico = consulta("c3", "2026-10-02T12:00:00.000Z", "09:00", { medicoId: "med-2", medico: "Dr. Outro" });
igual(
  "diasDoAgendamento + bloqueados (paciente ocupado 09:00 de 02/10 com outro médico)",
  diasDoAgendamento(agendaLivreDoMedico(medico, [outroMedico], undefined, 4, new Set(["2026-10-03"])), [outroMedico]).map(
    (d) => `${d.iso} ${d.rotulo} ${d.sem} ${d.horarios.join(",")}`,
  ),
  ["2026-10-01 Hoje Qui 22:00", "2026-10-02 Amanhã Sex 22:00", "2026-10-04 4 Out Dom 09:00,22:00"],
);

/* ---------- relógio à noite: 23:00 SP de 01/10 = 02:00Z de 02/10 ---------- */
Date.now = () => Date.parse("2026-10-02T02:00:00Z");
igual(
  "à noite (UTC já virou): hoje ainda é 01/10 em SP",
  resumo(agendaLivreDoMedico(medico, [], undefined, 2)),
  ["2026-10-02 09:00,22:00"],
);
igual(
  "à noite: bloquear 02/10 (amanhã em SP) zera a agenda de 2 dias",
  resumo(agendaLivreDoMedico(medico, [], undefined, 2, ["2026-10-02"])),
  [],
);
igual(
  "à noite: bloquear 01/10 (hoje em SP) não remove amanhã",
  resumo(agendaLivreDoMedico(medico, [], undefined, 2, ["2026-10-01"])),
  ["2026-10-02 09:00,22:00"],
);
Date.now = dateNowOriginal;

/* ---------- buscarDiasBloqueados (fetch simulado) ---------- */
(async () => {
  const chamadas: string[] = [];
  let resposta: () => Response = () =>
    new Response(JSON.stringify({ dias: ["2026-10-03", "invalido", 42, "2026-10-05"] }), { status: 200 });
  globalThis.fetch = (async (url: string | URL | Request) => {
    chamadas.push(String(url));
    await new Promise((r) => setTimeout(r, 5));
    return resposta();
  }) as typeof fetch;

  const [a, b] = await Promise.all([buscarDiasBloqueados("med-1"), buscarDiasBloqueados("med-1")]);
  igual("uma requisição em voo por médico", chamadas.length, 1);
  igual("URL da rota", chamadas[0], "/api/medicos/med-1/bloqueios");
  igual("filtra entradas inválidas", [...a].sort(), ["2026-10-03", "2026-10-05"]);
  igual("mesma promessa/conjunto", a === b, true);
  await buscarDiasBloqueados("med-1");
  igual("cache: não busca de novo", chamadas.length, 1);
  invalidarDiasBloqueados("med-1");
  await buscarDiasBloqueados("med-1");
  igual("invalidar → busca de novo", chamadas.length, 2);

  resposta = () => new Response(JSON.stringify({ erro: "Não autenticado" }), { status: 401 });
  const erro401 = await buscarDiasBloqueados("med-2");
  igual("401 → conjunto vazio", erro401.size, 0);
  resposta = () => new Response("<html>", { status: 500 });
  invalidarDiasBloqueados("med-2");
  igual("500 sem JSON → conjunto vazio", (await buscarDiasBloqueados("med-2")).size, 0);
  const n = chamadas.length;
  await buscarDiasBloqueados("med-2");
  igual("falha também fica em cache curto (sem rajada)", chamadas.length, n);
  resposta = () => {
    throw new TypeError("Failed to fetch");
  };
  igual("erro de rede → conjunto vazio", (await buscarDiasBloqueados("med-3")).size, 0);
  resposta = () => new Response(JSON.stringify({ data: { dias: ["2026-10-03"] } }), { status: 200 });
  igual("formato inesperado → conjunto vazio", (await buscarDiasBloqueados("med-4")).size, 0);
  resposta = () => new Response(JSON.stringify({ dias: [] }), { status: 200 });
  await buscarDiasBloqueados("med/x");
  igual("id é codificado na URL", chamadas[chamadas.length - 1], "/api/medicos/med%2Fx/bloqueios");

  console.log(`${ok} ok, ${falhas} falha(s) — TZ do processo: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  if (falhas) process.exit(1);
})();
