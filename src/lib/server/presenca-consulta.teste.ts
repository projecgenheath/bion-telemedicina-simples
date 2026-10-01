/**
 * Testes da classificação PURA da presença na sala (presenca-consulta.ts):
 * falta do paciente × falha técnica × sem evento.
 * Rodar (precisa da condição react-server por causa do "server-only"):
 *   bun --conditions=react-server src/lib/server/presenca-consulta.teste.ts
 * Nada toca o banco: só a função pura.
 */
import {
  CARENCIA_APOS_INICIO_MIN,
  INICIO_DETECCAO,
  JANELA_RETROATIVA_DIAS,
  QUEDA_MIN,
  STATUS_AVALIAVEIS,
  classificarPresenca,
  filtroPendentes,
} from "./presenca-consulta";

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

// Consulta: 02/10/2026 14:00 em São Paulo (17:00Z).
const INICIO = new Date("2026-10-02T17:00:00.000Z");
const min = (m: number) => new Date(INICIO.getTime() + m * 60_000);
const DEPOIS = min(CARENCIA_APOS_INICIO_MIN + 1);

const base = {
  dataInicio: INICIO,
  agora: DEPOIS,
  pago: true,
  ultimoPingMedico: null as Date | null,
  ultimoPingPaciente: null as Date | null,
  encerradaPeloBotao: false,
};
const r = (p: Partial<typeof base>) => classificarPresenca({ ...base, ...p }).resultado;

// Carência
igual("antes da sala fechar: aguarda", r({ agora: min(CARENCIA_APOS_INICIO_MIN - 1), ultimoPingMedico: min(20) }), "aguardar");
igual("logo depois da carência: decide", r({ agora: min(CARENCIA_APOS_INICIO_MIN), ultimoPingMedico: min(20) }), "falta_paciente");

// Ninguém entrou
igual("ninguém entrou (paga): falha técnica", r({}), "falha_tecnica");
igual("ninguém entrou (não paga): sem evento", r({ pago: false }), "sem_evento");
igual("os dois só antes do horário: conta como ninguém", r({ ultimoPingMedico: min(-10), ultimoPingPaciente: min(-5) }), "falha_tecnica");

// Falta do paciente
igual("médico na sala, paciente nunca entrou: falta", r({ ultimoPingMedico: min(15) }), "falta_paciente");
igual("falta também sem pagamento", r({ pago: false, ultimoPingMedico: min(15) }), "falta_paciente");
igual("paciente saiu antes do horário, médico esperou: falta", r({ ultimoPingMedico: min(15), ultimoPingPaciente: min(-20) }), "falta_paciente");

// Médico não entrou (paciente entrou): falta do médico só em consulta paga
igual("só o paciente entrou (paga): falta do médico", r({ ultimoPingPaciente: min(15) }), "falta_medico");
igual("só o paciente entrou (não paga): sem evento", r({ pago: false, ultimoPingPaciente: min(15) }), "sem_evento");
igual(
  "médico só antes do horário, paciente esperou: falta do médico",
  r({ ultimoPingMedico: min(-15), ultimoPingPaciente: min(20) }),
  "falta_medico",
);
igual("falta do médico espera a carência", r({ agora: min(30), ultimoPingPaciente: min(15) }), "aguardar");

// Os dois entraram
igual("os dois até o fim: sem evento", r({ ultimoPingMedico: min(25), ultimoPingPaciente: min(25) }), "sem_evento");
igual("saídas próximas (< queda): sem evento", r({ ultimoPingMedico: min(25), ultimoPingPaciente: min(25 - QUEDA_MIN + 1) }), "sem_evento");
igual("paciente caiu e médico esperou: falha técnica", r({ ultimoPingMedico: min(30), ultimoPingPaciente: min(30 - QUEDA_MIN) }), "falha_tecnica");
igual("médico caiu e paciente esperou: falha técnica", r({ ultimoPingMedico: min(3), ultimoPingPaciente: min(20) }), "falha_tecnica");
igual(
  "encerrada pelo botão: sem evento mesmo com diferença",
  r({ ultimoPingMedico: min(30), ultimoPingPaciente: min(10), encerradaPeloBotao: true }),
  "sem_evento",
);
igual(
  "motivo diz quem caiu",
  classificarPresenca({ ...base, ultimoPingMedico: min(30), ultimoPingPaciente: min(10) }).motivo.includes("paciente caiu"),
  true,
);

// Filtro (o mesmo para médico, paciente e sala)
{
  const agoraCedo = new Date("2026-10-03T12:00:00.000Z");
  const f = filtroPendentes(agoraCedo);
  igual("filtro: status avaliáveis", f.status.in, STATUS_AVALIAVEIS);
  igual("filtro: não retroativo antes do corte", f.dataInicio.gte.toISOString(), INICIO_DETECCAO.toISOString());
  igual(
    "filtro: só depois da carência",
    f.dataInicio.lte.toISOString(),
    new Date(agoraCedo.getTime() - CARENCIA_APOS_INICIO_MIN * 60_000).toISOString(),
  );
  igual("filtro: sem falta nem falha", f.eventos.none.tipo.in, ["falta_paciente", "falha_tecnica"]);
  const agoraTarde = new Date("2026-11-20T12:00:00.000Z");
  igual(
    "filtro: janela retroativa depois do corte",
    filtroPendentes(agoraTarde).dataInicio.gte.toISOString(),
    new Date(agoraTarde.getTime() - JANELA_RETROATIVA_DIAS * 86_400_000).toISOString(),
  );
}

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
