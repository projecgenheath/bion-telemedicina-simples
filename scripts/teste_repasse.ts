/**
 * Teste do repasse diário (src/lib/server/repasse.ts) contra um Postgres
 * LOCAL descartável (nunca o banco de produção), com a migração
 * 20261003_repasse_diario aplicada.
 *   DATABASE_URL=postgresql://postgres@localhost:55432/repasse \
 *   bun --conditions react-server scripts/teste_repasse.ts
 */
import { db } from "@/lib/db";
import { ERRO_JA_REPASSADO, falha } from "@/lib/server/http";
import {
  aplicarAjustes,
  chaveTrocadaRecente,
  consultaJaRepassada,
  competenciaPadraoParaFechar,
  corteDaCompetencia,
  ERRO_CHAVE_MUDOU,
  ERRO_REPASSE_NAO_ABERTO,
  ERRO_SEM_CHAVE_PIX,
  fecharRepasse,
  fecharRepasseDoMedico,
  marcarRepassePago,
  previaDoDia,
  validarCompetenciaParaFechar,
} from "@/lib/server/repasse";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Só roda contra um Postgres local.");

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra ?? ""); }
}
async function erroDe(p: Promise<unknown>): Promise<string> {
  try { await p; return ""; } catch (e) { return (e as Error).message; }
}
/** Instante em São Paulo (UTC-3). */
const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

async function limpar() {
  await db.repasseAjuste.deleteMany({ where: { origemAjusteId: { not: null } } });
  await db.repasseAjuste.deleteMany();
  await db.repasseItem.deleteMany();
  await db.repasse.deleteMany();
  await db.dadosRecebimentoMedico.deleteMany();
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.pagamento.deleteMany();
  await db.consulta.deleteMany();
  await db.user.deleteMany();
}

async function consultaPaga(medicoId: string, pacienteId: string, quando: Date, valor = 200, extra: Record<string, unknown> = {}) {
  const c = await db.consulta.create({
    data: { medicoId, pacienteId, dataInicio: quando, especialidade: "Clínica", valor, pago: true, status: "confirmada", ...extra },
  });
  const p = await db.pagamento.create({ data: { consultaId: c.id, valor, status: "confirmado", via: "simulado", confirmadoEm: quando } });
  return { c, p };
}

async function main() {
  await limpar();
  const med = await db.user.create({ data: { nome: "Med", email: "m@t", senhaHash: "x", role: "MEDICO" } });
  const med2 = await db.user.create({ data: { nome: "Med2", email: "m2@t", senhaHash: "x", role: "MEDICO" } });
  const adm = await db.user.create({ data: { nome: "Adm", email: "a@t", senhaHash: "x", role: "ADMIN" } });
  const pac = await db.user.create({ data: { nome: "Pac", email: "p@t", senhaHash: "x" } });

  /* ---------- Competência e corte ---------- */
  verifica(corteDaCompetencia("2030-02-31") === null, "competência 2030-02-31 é recusada");
  verifica(corteDaCompetencia("2030-03-10", sp("2030-03-11", "00:10"))!.getTime() === sp("2030-03-11", "00:00").getTime(),
    "corte = fim do dia em SP quando o cron atrasa para 00:10");
  verifica(corteDaCompetencia("2030-03-10", sp("2030-03-10", "23:30"))!.getTime() === sp("2030-03-10", "23:30").getTime(),
    "corte = agora quando o dia ainda não acabou");
  verifica(competenciaPadraoParaFechar(sp("2030-03-10", "23:05")) === "2030-03-10", "padrão às 23:05 = hoje");
  verifica(competenciaPadraoParaFechar(sp("2030-03-10", "15:00")) === "2030-03-09", "padrão às 15:00 = ontem");
  verifica(!!validarCompetenciaParaFechar("2030-03-10", sp("2030-03-10", "15:00")), "hoje antes das 23:00 não fecha");
  verifica(!!validarCompetenciaParaFechar("2030-03-11", sp("2030-03-10", "23:30")), "dia futuro não fecha");
  verifica(validarCompetenciaParaFechar("2030-03-10", sp("2030-03-10", "23:30")) === null, "hoje às 23:30 fecha");

  /* ---------- Aplicação de ajustes (puro) ---------- */
  const ap = aplicarAjustes(100, [{ id: "a", valorCentavos: 60 }, { id: "b", valorCentavos: 70 }, { id: "c", valorCentavos: 5 }]);
  verifica(ap.totalCentavos === 100 && ap.aplicacoes.length === 2 && ap.aplicacoes[1].sobraCentavos === 30,
    "ajustes: aplica até o disponível e o resto passa adiante", ap);

  /* ---------- Dia 10: consulta, multa de remarcação e multa às 23:40 ---------- */
  const D = "2030-03-10";
  const { c: c1 } = await consultaPaga(med.id, pac.id, sp(D, "14:00"), 200);
  await consultaPaga(med.id, pac.id, sp(D, "15:00"), 300, { pago: false }); // não pagou: fora
  await consultaPaga(med.id, pac.id, sp(D, "16:00"), 300, { status: "cancelada" }); // cancelada: fora
  const { c: c00 } = await consultaPaga(med.id, pac.id, sp("2030-03-11", "00:00"), 150); // dia seguinte
  // duas remarcações pagas da mesma consulta (multa R$ 100 cada), uma às 10:00 e outra às 23:40
  const { c: cRem } = await consultaPaga(med.id, pac.id, sp("2030-03-20", "10:00"), 200);
  const r1 = await db.remarcacaoPendente.create({
    data: { consultaId: cRem.id, novaData: sp("2030-03-12", "10:00"), multaCentavos: 10000, status: "aprovada", solicitadoPor: pac.id, expiraEm: sp(D, "11:00"), aprovadoEm: sp(D, "10:00") },
  });
  const r2 = await db.remarcacaoPendente.create({
    data: { consultaId: cRem.id, novaData: sp("2030-03-12", "10:00"), multaCentavos: 10000, status: "aprovada", solicitadoPor: pac.id, expiraEm: sp(D, "23:59"), aprovadoEm: sp(D, "23:40") },
  });
  // multa de cancelamento pelo paciente (consulta de 200, multa 100, reembolso automático de 100)
  const { c: cCanc, p: pCanc } = await consultaPaga(med.id, pac.id, sp("2030-03-11", "09:00"), 200, { status: "cancelada" });
  await db.eventoConsulta.create({ data: { consultaId: cCanc.id, tipo: "cancelada", por: "paciente", em: sp(D, "12:00"), dataAnterior: cCanc.dataInicio, motivo: "pedido_paciente", multaCentavos: 10000 } });
  await db.reembolso.create({ data: { pagamentoId: pCanc.id, valorCentavos: 10000, multaCentavos: 10000, motivo: "pedido_paciente", status: "aprovado", solicitadoPor: pac.id, criadoEm: sp(D, "12:00") } });

  const previa = await previaDoDia(med.id, sp(D, "23:30"));
  verifica(previa.itens.length === 3 && previa.totais.liquidoCentavos === 18000 + 5000 + 5000,
    "prévia às 23:30: consulta (180) + multa de remarcação (50) + multa de cancelamento (50)", previa.totais);

  const cron = await fecharRepasse(D, { agora: sp(D, "23:30") });
  const r = cron.resultados.find((x) => x.medicoId === med.id)!;
  verifica(r.situacao === "fechado" && "itens" in r && r.itens === 3 && r.liquidoCentavos === 28000, "cron das 23:30 fecha o dia 10 com 3 itens", r);
  verifica(cron.resultados.find((x) => x.medicoId === med2.id)?.situacao === "sem_itens", "médico sem nada: não cria repasse");
  const rep10 = await db.repasse.findUnique({ where: { medicoId_competencia: { medicoId: med.id, competencia: D } }, include: { itens: true } });
  verifica(rep10?.comissaoCentavos === 2000 && rep10?.brutoCentavos === 20000 && rep10.multasCentavos === 10000, "totais do repasse batem com a fórmula", rep10);
  verifica(!rep10?.itens.some((i) => i.consultaId === c00.id), "consulta das 00:00 do dia 11 não entra no dia 10");
  verifica(!rep10?.itens.some((i) => i.remarcacaoId === r2.id), "multa paga às 23:40 não entra no fechamento das 23:30");
  verifica(rep10?.itens.some((i) => i.remarcacaoId === r1.id && i.tipo === "multa_remarcacao"), "multa de remarcação paga às 10:00 entra");

  const again = await fecharRepasse(D, { agora: sp(D, "23:45") });
  verifica(again.resultados.find((x) => x.medicoId === med.id)?.situacao === "ja_fechado", "rodar de novo no mesmo dia não duplica");

  const previaDepois = await previaDoDia(med.id, sp(D, "23:50"));
  verifica(previaDepois.itens.length === 1 && previaDepois.itens[0].remarcacaoId === r2.id,
    "prévia depois do fechamento mostra só o que ainda não tem item (multa das 23:40)", previaDepois.itens);

  /* ---------- Dia 11: cron atrasado às 00:10 do dia 12 ---------- */
  const D2 = "2030-03-11";
  const atrasado = await fecharRepasseDoMedico(med.id, D2, sp("2030-03-12", "00:10"));
  const rep11 = await db.repasse.findUnique({ where: { id: atrasado.repasseId! }, include: { itens: true } });
  verifica(rep11?.itens.length === 2 && rep11.itens.some((i) => i.consultaId === c00.id) && rep11.itens.some((i) => i.remarcacaoId === r2.id),
    "dia 11 leva a consulta das 00:00 e a multa das 23:40 do dia 10", rep11?.itens.map((i) => i.chave));

  /* ---------- Reembolso integral depois do fechamento vira desconto ---------- */
  const pc1 = await db.pagamento.findUnique({ where: { consultaId: c1.id } });
  await db.reembolso.create({
    data: { pagamentoId: pc1!.id, valorCentavos: 20000, motivo: "falta_paciente", status: "aprovado", origem: "manual", solicitadoPor: pac.id, criadoEm: sp("2030-03-12", "08:00"), decididoEm: sp("2030-03-12", "09:00"), decididoPor: adm.id },
  });
  // dia 12: só uma consulta de 100 (líquido 90) → desconto de 180 aplica 90 e sobram 90
  await consultaPaga(med.id, pac.id, sp("2030-03-12", "11:00"), 100);
  const previa12 = await previaDoDia(med.id, sp("2030-03-12", "23:30"));
  verifica(previa12.totais.ajustesCentavos === 9000 && previa12.totais.liquidoCentavos === 0 && previa12.ajustesPendentesRestantesCentavos === 9000,
    "prévia do dia 12 já desconta 90 e mostra os 90 que sobram", { t: previa12.totais, resto: previa12.ajustesPendentesRestantesCentavos });
  const f12 = await fecharRepasseDoMedico(med.id, "2030-03-12", sp("2030-03-12", "23:30"));
  const rep12 = await db.repasse.findUnique({ where: { id: f12.repasseId! } });
  const ajustes = await db.repasseAjuste.findMany({ orderBy: { criadoEm: "asc" } });
  const aj = ajustes.find((a) => a.motivo === "reembolso");
  const saldo = ajustes.find((a) => a.motivo === "saldo_anterior");
  verifica(aj?.valorCentavos === 18000 && aj.valorAplicadoCentavos === 9000 && aj.repasseId === rep12?.id, "reembolso integral vira desconto de 180 (90%), 90 aplicados", aj);
  verifica(saldo?.valorCentavos === 9000 && saldo.repasseId === null && saldo.consultaId === c1.id, "sobra de 90 fica pendente para o próximo repasse", saldo);
  verifica(rep12?.liquidoCentavos === 0 && rep12.ajustesCentavos === 9000, "repasse do dia 12 fecha em 0", rep12);
  const f12b = await fecharRepasseDoMedico(med.id, "2030-03-13", sp("2030-03-13", "23:30"));
  verifica(f12b.situacao === "sem_itens" && (await db.repasseAjuste.count({ where: { motivo: "reembolso" } })) === 1,
    "sem itens no dia 13: nada fecha e o reembolso não vira desconto de novo");

  /* ---------- Concorrência: dois fechamentos ao mesmo tempo ---------- */
  await consultaPaga(med2.id, pac.id, sp("2030-03-14", "10:00"), 100);
  const [x, y] = await Promise.all([
    fecharRepasseDoMedico(med2.id, "2030-03-14", sp("2030-03-14", "23:30")),
    fecharRepasseDoMedico(med2.id, "2030-03-14", sp("2030-03-14", "23:30")),
  ]);
  verifica([x.situacao, y.situacao].sort().join(",") === "fechado,ja_fechado", "dois fechamentos simultâneos: um fecha, o outro vê fechado", [x, y]);

  /* ---------- Pagamento ---------- */
  const id10 = rep10!.id;
  verifica((await erroDe(marcarRepassePago({ repasseId: id10, adminId: adm.id, comprovantePath: "c.pdf", pixChaveConferida: "x" }))) === ERRO_SEM_CHAVE_PIX, "sem chave PIX: recusa");
  const pix = await db.dadosRecebimentoMedico.create({
    data: { medicoId: med.id, pixTipo: "email", pixChave: "med@pix.com", titularTipo: "pf", titularNome: "Med", titularDocumento: "12345678901" },
  });
  verifica(!chaveTrocadaRecente(pix), "chave recém-criada não conta como trocada");
  verifica(chaveTrocadaRecente({ criadoEm: new Date(Date.now() - 3 * 86_400_000), atualizadoEm: new Date(Date.now() - 3_600_000) }), "chave trocada há 1 h avisa");
  verifica((await erroDe(marcarRepassePago({ repasseId: id10, adminId: adm.id, comprovantePath: "c.pdf", pixChaveConferida: "outra@pix.com" }))) === ERRO_CHAVE_MUDOU, "chave diferente da conferida: recusa");
  const pago = await marcarRepassePago({ repasseId: id10, adminId: adm.id, comprovantePath: "repasses/c.pdf", pixChaveConferida: "med@pix.com" });
  const rpago = await db.repasse.findUnique({ where: { id: id10 } });
  verifica(pago.status === "pago" && rpago?.pixChave === "med@pix.com" && rpago.pagoPorId === adm.id && rpago.comprovantePath === "repasses/c.pdf", "marca como pago com a cópia da chave");
  verifica((await erroDe(marcarRepassePago({ repasseId: id10, adminId: adm.id, comprovantePath: "c.pdf", pixChaveConferida: "med@pix.com" }))) === ERRO_REPASSE_NAO_ABERTO, "pagar de novo: recusa");

  /* ---------- Troca de médico de consulta repassada ---------- */
  let erroTroca: unknown = null;
  try { await db.consulta.update({ where: { id: c1.id }, data: { medicoId: med2.id } }); } catch (e) { erroTroca = e; }
  verifica((erroTroca as { code?: string })?.code === "P2003", "banco recusa trocar o médico de consulta repassada (P2003)", erroTroca);
  const resp = falha(erroTroca);
  verifica(resp.status === 409 && (await resp.json()).erro === ERRO_JA_REPASSADO, "falha() transforma esse P2003 em 409");
  verifica(await consultaJaRepassada(c1.id), "consultaJaRepassada vê a consulta repassada");

  console.log(`\n${okN} ok, ${falhaN} falha(s)`);
  await limpar();
  await db.$disconnect();
  if (falhaN) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
