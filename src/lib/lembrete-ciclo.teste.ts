/**
 * Testes do ciclo diário e do disparo do lembrete (F6/F7).
 * Rodar: bun src/lib/lembrete-ciclo.teste.ts
 * Instantes montados com instanteFusoClinica (parede de São Paulo):
 * 04/11/2026 é quarta-feira (diaSemana 3); 07/11/2026 é sábado (6).
 */
import { instanteFusoClinica } from "./bion-tipos";
import {
  chaveDiaClinica,
  diaCombina,
  feitoVigente,
  instanteOcorrencia,
  lembreteDevido,
  minutoCombina,
  minutosDoHorario,
  resolverFeito,
  type LembreteDisparo,
} from "./lembrete-ciclo";

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

const em = (dia: number, hora: number, minuto = 0) => new Date(instanteFusoClinica(2026, 10, dia, hora, minuto));
const QUA = 4; // quarta-feira 04/11/2026
const SAB = 7; // sábado 07/11/2026

/* ------------------------------ chave do dia ------------------------------ */
igual("chave: madrugada ainda é o mesmo dia", chaveDiaClinica(em(QUA, 0, 30)), "2026-11-04");
igual("chave: noite do dia anterior", chaveDiaClinica(em(3, 23, 30)), "2026-11-03");

/* ------------------------------ feito vigente ------------------------------ */
igual("feito hoje de manhã vale à noite", feitoVigente(true, em(QUA, 8), em(QUA, 23)), true);
igual("feito ontem NÃO vale hoje", feitoVigente(true, em(3, 8), em(QUA, 0, 30)), false);
igual("feito sem data (legado) não está vigente", feitoVigente(true, null, em(QUA, 9)), false);
igual("não feito nunca está vigente", feitoVigente(false, em(QUA, 8), em(QUA, 9)), false);
igual("resolverFeito: feito de ontem volta a pendente", resolverFeito({ feito: true, feitoEm: em(3, 8) }, em(QUA, 8)), false);
igual("resolverFeito: feito de hoje segue feito", resolverFeito({ feito: true, feitoEm: em(QUA, 7, 59) }, em(QUA, 8)), true);

/* ------------------------------ minutos/horário ------------------------------ */
igual("minutos 08:30", minutosDoHorario("08:30"), 510);
igual("minutos inválido 99:99", minutosDoHorario("99:99"), null);
igual("minutos sem zero à esquerda", minutosDoHorario("8:00"), null);
igual("ocorrência de hoje às 08:00", instanteOcorrencia(em(QUA, 15, 22), "08:00")?.getTime(), em(QUA, 8).getTime());

/* ------------------------------ dia combina ------------------------------ */
igual("dias úteis na quarta", diaCombina("Dias úteis", em(QUA, 8)), true);
igual("dias úteis no sábado", diaCombina("Dias úteis", em(SAB, 8)), false);
igual("todos os dias no sábado", diaCombina("Todos os dias", em(SAB, 8)), true);
igual("semanal no dia certo", diaCombina("Semanal", em(QUA, 8), 3), true);
igual("semanal no dia errado", diaCombina("Semanal", em(QUA, 8), 4), false);
igual("semanal sem dia conhecido", diaCombina("Semanal", em(QUA, 8), null), false);
igual("frequência desconhecida não combina", diaCombina("Quando lembrar", em(QUA, 8)), false);

/* ------------------------------ minuto combina ------------------------------ */
igual("minuto exato", minutoCombina({ horario: "08:00", frequencia: "Todos os dias" }, em(QUA, 8)), true);
igual("um minuto depois não", minutoCombina({ horario: "08:00", frequencia: "Todos os dias" }, em(QUA, 8, 1)), false);
igual("legado 12h: âncora", minutoCombina({ horario: "08:00", frequencia: "A cada 12 horas" }, em(QUA, 8)), true);
igual("legado 12h: +12h", minutoCombina({ horario: "08:00", frequencia: "A cada 12 horas" }, em(QUA, 20)), true);
igual("legado 12h: +6h não", minutoCombina({ horario: "08:00", frequencia: "A cada 12 horas" }, em(QUA, 14)), false);
igual("legado 8h: +8h", minutoCombina({ horario: "08:00", frequencia: "A cada 8 horas" }, em(QUA, 16)), true);
igual("legado 8h: meia-noite não (outro dia)", minutoCombina({ horario: "08:00", frequencia: "A cada 8 horas" }, em(QUA, 0)), false);

/* ------------------------------ devido ------------------------------ */
const base: LembreteDisparo = {
  id: "l1",
  usuarioId: "u1",
  titulo: "Losartana",
  horario: "08:00",
  tipo: "Medicação",
  frequencia: "Todos os dias",
};
igual("devido no horário", lembreteDevido(base, em(QUA, 8)), true);
igual("não devido fora do horário", lembreteDevido(base, em(QUA, 9)), false);
igual("já disparou nesta ocorrência", lembreteDevido({ ...base, ultimoDisparoEm: em(QUA, 8) }, em(QUA, 8)), false);
igual("disparou ontem, hoje dispara", lembreteDevido({ ...base, ultimoDisparoEm: em(3, 8) }, em(QUA, 8)), true);
igual("feito hoje não dispara", lembreteDevido({ ...base, feitoEm: em(QUA, 7, 30) }, em(QUA, 8)), false);
igual("feito ontem dispara", lembreteDevido({ ...base, feitoEm: em(3, 8) }, em(QUA, 8)), true);
igual(
  "semanal de medicamento no dia da posologia",
  lembreteDevido({ ...base, frequencia: "Semanal", medicamentoEmUsoId: "m1" }, em(QUA, 8), 3),
  true,
);
igual(
  "semanal genérico (sem dia) não dispara",
  lembreteDevido({ ...base, frequencia: "Semanal" }, em(QUA, 8), null),
  false,
);
igual(
  "dias úteis no sábado não dispara",
  lembreteDevido({ ...base, frequencia: "Dias úteis" }, em(SAB, 8)),
  false,
);

console.log(`lembrete-ciclo: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
