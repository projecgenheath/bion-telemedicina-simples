/**
 * Teste da trava (médico, dia) nos caminhos do admin/remarcação contra um
 * Postgres LOCAL descartável (nunca o banco de produção).
 *   DATABASE_URL=postgresql://postgres@localhost:55432/trava \
 *   bun --conditions react-server scripts/teste_trava_admin.ts
 */
import { db } from "@/lib/db";
import { diaParaDate, diaIsoSaoPaulo, travarDiaIso } from "@/lib/server/bloqueio-agenda";
import {
  aprovarMultaRemarcacao,
  conferirHorarioNaTransacao,
  ERRO_HORARIO_OCUPADO,
  ERRO_PACIENTE_OCUPADO,
  HorarioIndisponivel,
  travarDias,
} from "@/lib/server/financeiro";
import { ERRO_DIA_BLOQUEADO, ERRO_HORARIO_VEDADO } from "@/lib/server/bloqueio-agenda";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Só roda contra um Postgres local.");

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string) {
  if (cond) { okN++; console.log("ok   " + nome); } else { falhaN++; console.log("FALHA " + nome); }
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.bloqueioAgenda.deleteMany();
  await db.consulta.deleteMany();
  await db.user.deleteMany();
  const med = await db.user.create({ data: { nome: "Med", email: "m@t", senhaHash: "x", role: "MEDICO" } });
  const med2 = await db.user.create({ data: { nome: "Med2", email: "m2@t", senhaHash: "x", role: "MEDICO" } });
  const pac = await db.user.create({ data: { nome: "Pac", email: "p@t", senhaHash: "x" } });
  const pac2 = await db.user.create({ data: { nome: "Pac2", email: "p2@t", senhaHash: "x" } });

  // 10/12/2030 14:00 SP = 17:00Z ; 22:00 SP = 01:00Z do dia 11 (mesmo dia em SP)
  const d1 = new Date("2030-12-10T17:00:00Z");
  const d1noite = new Date("2030-12-11T01:00:00Z");
  const d2 = new Date("2030-12-12T17:00:00Z");
  const base = { especialidade: "Clínica", valor: 100, pago: true };
  const c = await db.consulta.create({ data: { ...base, pacienteId: pac.id, medicoId: med.id, dataInicio: d1 } });
  await db.consulta.create({ data: { ...base, pacienteId: pac2.id, medicoId: med.id, dataInicio: d2 } });
  await db.consulta.create({ data: { ...base, pacienteId: pac.id, medicoId: med2.id, dataInicio: d1noite } });

  // 1) conferirHorarioNaTransacao
  const conf = (p: Parameters<typeof conferirHorarioNaTransacao>[1]) =>
    db.$transaction((tx) => conferirHorarioNaTransacao(tx, p));
  verifica((await conf({ consultaId: c.id, medicoId: med.id, dataInicio: d1noite })) === null, "horário livre → null");
  verifica((await conf({ consultaId: c.id, medicoId: med.id, dataInicio: d2 })) === ERRO_HORARIO_OCUPADO, "outra consulta do médico → ocupado");
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: d1noite, pacienteId: pac.id })) === ERRO_PACIENTE_OCUPADO,
    "paciente com outra consulta (outro médico) → paciente ocupado",
  );
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: d1noite })) === null,
    "sem pacienteId não confere o paciente",
  );
  const outra = await db.consulta.create({ data: { ...base, pacienteId: pac2.id, medicoId: med.id, dataInicio: new Date("2030-12-20T17:00:00Z") } });
  const reservaOutra = await db.remarcacaoPendente.create({
    data: { consultaId: outra.id, novaData: d1noite, multaCentavos: 500, solicitadoPor: pac2.id, expiraEm: new Date(Date.now() + 600_000) },
  });
  verifica((await conf({ consultaId: c.id, medicoId: med.id, dataInicio: d1noite })) === ERRO_HORARIO_OCUPADO, "reserva vigente de outra consulta → ocupado");
  verifica((await conf({ consultaId: outra.id, medicoId: med.id, dataInicio: d1noite })) === null, "a própria reserva não conta");
  await db.remarcacaoPendente.delete({ where: { id: reservaOutra.id } });
  await db.bloqueioAgenda.create({ data: { medicoId: med.id, dia: diaParaDate("2030-12-15") } });
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: new Date("2030-12-16T02:30:00Z") })) === ERRO_DIA_BLOQUEADO,
    "23:30 de 15/12 em SP (02:30Z de 16) → dia bloqueado",
  );
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: new Date("2030-12-16T03:30:00Z") })) === null,
    "00:30 de 16/12 em SP → livre",
  );

  // 2) travarDias em ordens opostas, ao mesmo tempo: sem deadlock
  const alvosA = [{ medicoId: med.id, instante: d1 }, { medicoId: med.id, instante: d2 }];
  const alvosB = [...alvosA].reverse();
  const t0 = Date.now();
  const r = await Promise.allSettled(
    [alvosA, alvosB, alvosA, alvosB].map((alvos) =>
      db.$transaction(async (tx) => { await travarDias(tx, alvos); await espera(150); return true; }, { timeout: 15_000, maxWait: 15_000 }),
    ),
  );
  verifica(r.every((x) => x.status === "fulfilled"), "4 transações com dois dias em ordens opostas terminam (sem deadlock)");
  verifica(Date.now() - t0 >= 550, "as 4 esperaram umas pelas outras (serializadas)");

  // 3) Corrida: bloqueio do dia em curso × reserva da remarcação (mesmo caminho da rota)
  const diaAlvo = new Date("2030-12-18T17:00:00Z");
  const iso = diaIsoSaoPaulo(diaAlvo);
  const bloqueio = db.$transaction(async (tx) => {
    await travarDiaIso(tx, med.id, iso);
    await espera(400);
    await tx.bloqueioAgenda.create({ data: { medicoId: med.id, dia: diaParaDate(iso) } });
  }, { timeout: 15_000 });
  await espera(50);
  const reserva = db
    .$transaction(async (tx) => {
      await travarDias(tx, [{ medicoId: med.id, instante: diaAlvo }]);
      const erro = await conferirHorarioNaTransacao(tx, { consultaId: c.id, medicoId: med.id, dataInicio: diaAlvo });
      if (erro) throw new HorarioIndisponivel(erro);
      return tx.remarcacaoPendente.create({
        data: { consultaId: c.id, novaData: diaAlvo, multaCentavos: 500, solicitadoPor: pac.id, expiraEm: new Date(Date.now() + 600_000) },
      });
    }, { timeout: 15_000 })
    .then(() => "criada", (e) => (e instanceof HorarioIndisponivel ? e.message : "erro:" + String(e)));
  const [, resReserva] = await Promise.all([bloqueio, reserva]);
  verifica(resReserva === ERRO_DIA_BLOQUEADO, `reserva iniciada durante o bloqueio espera e recebe 409 (${resReserva})`);
  verifica((await db.remarcacaoPendente.count({ where: { novaData: diaAlvo } })) === 0, "nenhuma reserva ficou no dia bloqueado");

  // 4) Corrida: bloqueio em curso × aprovação da multa (webhook)
  const diaMulta = new Date("2030-12-22T17:00:00Z");
  const isoMulta = diaIsoSaoPaulo(diaMulta);
  const rp = await db.remarcacaoPendente.create({
    data: { consultaId: c.id, novaData: diaMulta, multaCentavos: 700, solicitadoPor: pac.id, expiraEm: new Date(Date.now() + 600_000) },
  });
  const bloqueio2 = db.$transaction(async (tx) => {
    await travarDiaIso(tx, med.id, isoMulta);
    await espera(400);
    await tx.bloqueioAgenda.create({ data: { medicoId: med.id, dia: diaParaDate(isoMulta) } });
  }, { timeout: 15_000 });
  await espera(50);
  const [, aprov] = await Promise.all([bloqueio2, aprovarMultaRemarcacao(rp.id, "webhook")]);
  const cDepois = await db.consulta.findUniqueOrThrow({ where: { id: c.id } });
  verifica(aprov && aprov.aplicada === false, "multa aprovada durante o bloqueio não move a consulta");
  verifica(cDepois.dataInicio.getTime() === d1.getTime(), "consulta ficou na data original");
  verifica((await db.reembolso.count({ where: { remarcacaoId: rp.id } })) === 1, "a multa volta como reembolso");

  // 5) Aprovação normal (dia livre) continua funcionando e é idempotente
  const diaLivre = new Date("2030-12-26T17:00:00Z");
  const rp2 = await db.remarcacaoPendente.create({
    data: { consultaId: c.id, novaData: diaLivre, multaCentavos: 700, solicitadoPor: pac.id, expiraEm: new Date(Date.now() + 600_000) },
  });
  const a1 = await aprovarMultaRemarcacao(rp2.id, "webhook");
  const a2 = await aprovarMultaRemarcacao(rp2.id, "webhook");
  const cFinal = await db.consulta.findUniqueOrThrow({ where: { id: c.id } });
  verifica(a1?.aplicada === true && cFinal.dataInicio.getTime() === diaLivre.getTime(), "dia livre: multa aplicada e consulta movida");
  verifica(a2?.jaProcessada === true, "segunda aprovação é idempotente");
  verifica((await aprovarMultaRemarcacao("nao-existe", "webhook")) === null, "remarcação inexistente → null");

  // 6) Janela vedada 23:00–00:00 (São Paulo)
  // 27/12/2030 23:00 SP = 28/12 02:00Z ; 22:30 SP = 01:30Z ; 00:00 SP = 03:00Z
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: new Date("2030-12-28T02:00:00Z") })) === ERRO_HORARIO_VEDADO,
    "23:00 SP (dia livre) → horário vedado",
  );
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: new Date("2030-12-28T01:30:00Z") })) === null,
    "22:30 SP (termina 23:00) → livre",
  );
  verifica(
    (await conf({ consultaId: c.id, medicoId: med.id, dataInicio: new Date("2030-12-28T03:00:00Z") })) === null,
    "00:00 SP → livre",
  );
  const antesVedado = await db.consulta.findUniqueOrThrow({ where: { id: c.id } });
  const rp3 = await db.remarcacaoPendente.create({
    data: { consultaId: c.id, novaData: new Date("2030-12-28T02:15:00Z"), multaCentavos: 700, solicitadoPor: pac.id, expiraEm: new Date(Date.now() + 600_000) },
  });
  const a3 = await aprovarMultaRemarcacao(rp3.id, "webhook");
  const cVedado = await db.consulta.findUniqueOrThrow({ where: { id: c.id } });
  verifica(a3?.aplicada === false, "multa para 23:15 SP não move a consulta");
  verifica(cVedado.dataInicio.getTime() === antesVedado.dataInicio.getTime(), "consulta ficou na data anterior");
  verifica((await db.reembolso.count({ where: { remarcacaoId: rp3.id } })) === 1, "a multa para horário vedado volta como reembolso");

  console.log(`\n${okN} ok, ${falhaN} falha(s)`);
  await db.$disconnect();
  if (falhaN) process.exit(1);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
