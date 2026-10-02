/**
 * Teste do bloqueio de dia da agenda do médico (datas, validação, motivo,
 * consulta ao banco por dia de São Paulo e agenda do dia).
 * Rodar:
 *   bun scripts/teste_bloqueio_agenda.ts
 *   TZ=UTC bun scripts/teste_bloqueio_agenda.ts
 *   TZ=Asia/Tokyo bun scripts/teste_bloqueio_agenda.ts
 * O resultado deve ser o mesmo em qualquer TZ do processo.
 */
import type { Prisma } from "@prisma/client";
import type { Consulta } from "../src/lib/bion-tipos";
import {
  bloquearDiaTravado,
  chaveTravaDia,
  criarSeDiaLivre,
  MAX_BLOQUEIOS_FUTUROS,
  travarDiaDoMedico,
  dateParaDiaIso,
  diaBloqueado,
  diaIsoSaoPaulo,
  diaParaDate,
  hojeSaoPaulo,
  limparMotivo,
  somarDiasIso,
  validarDiaBloqueio,
  type ClienteBanco,
} from "../src/lib/server/bloqueio-agenda";
import { agendaDoDia, semDiasBloqueados } from "../src/components/bion/medico/metricas";

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
const A = (s: string) => new Date(s);

/* ---------- dia de São Paulo de um instante ---------- */
igual("22:00 SP (01:00Z do dia seguinte) fica no mesmo dia", diaIsoSaoPaulo(A("2026-10-02T01:00:00Z")), "2026-10-01");
igual("23:59 SP", diaIsoSaoPaulo(A("2026-10-02T02:59:59Z")), "2026-10-01");
igual("00:00 SP é o dia novo", diaIsoSaoPaulo(A("2026-10-02T03:00:00Z")), "2026-10-02");
igual("02:59Z ainda é ontem em SP", diaIsoSaoPaulo(A("2026-10-02T02:59:00Z")), "2026-10-01");
igual("meio-dia SP", diaIsoSaoPaulo(A("2026-10-01T15:00:00Z")), "2026-10-01");
igual("virada do ano 22:00 SP", diaIsoSaoPaulo(A("2027-01-01T01:00:00Z")), "2026-12-31");

/* ---------- DATE do Prisma = meia-noite UTC ---------- */
igual("diaParaDate meia-noite UTC", diaParaDate("2026-10-01").toISOString(), "2026-10-01T00:00:00.000Z");
igual("dateParaDiaIso inverso", dateParaDiaIso(diaParaDate("2026-02-28")), "2026-02-28");
igual(
  "22:00 SP → DATE do mesmo dia (não o início do dia SP 03:00Z)",
  diaParaDate(diaIsoSaoPaulo(A("2026-10-02T01:00:00Z"))).toISOString(),
  "2026-10-01T00:00:00.000Z",
);

/* ---------- somarDiasIso ---------- */
igual("+1 virada de mês", somarDiasIso("2026-10-31", 1), "2026-11-01");
igual("+1 virada de ano", somarDiasIso("2026-12-31", 1), "2027-01-01");
igual("+1 bissexto 2028", somarDiasIso("2028-02-28", 1), "2028-02-29");
igual("+1 não bissexto 2027", somarDiasIso("2027-02-28", 1), "2027-03-01");
igual("+365", somarDiasIso("2026-10-01", 365), "2027-10-01");
igual("+60", somarDiasIso("2026-10-01", 60), "2026-11-30");
igual("-1", somarDiasIso("2026-10-01", -1), "2026-09-30");

/* ---------- validarDiaBloqueio ---------- */
const AGORA = A("2026-10-01T13:00:00Z"); // 10:00 SP de 01/10
const v = (x: unknown, agora = AGORA, o?: { horizonte?: boolean }) => {
  const r = validarDiaBloqueio(x, agora, o);
  return r.ok ? r.valor.dia : `erro:${r.erro}`;
};
igual("hojeSaoPaulo", hojeSaoPaulo(AGORA), "2026-10-01");
igual("hoje vale", v("2026-10-01"), "2026-10-01");
igual("amanhã vale", v("2026-10-02"), "2026-10-02");
igual("ontem não", v("2026-09-30").startsWith("erro:"), true);
igual("+365 vale", v("2027-10-01"), "2027-10-01");
igual("+366 não", v("2027-10-02").startsWith("erro:"), true);
igual("+366 vale sem horizonte (desbloquear)", v("2027-10-02", AGORA, { horizonte: false }), "2027-10-02");
igual("30/02 não", v("2027-02-30"), "erro:Data inválida.");
igual("29/02 em ano não bissexto não", v("2027-02-29"), "erro:Data inválida.");
igual("29/02/2028 vale (sem horizonte)", v("2028-02-29", AGORA, { horizonte: false }), "2028-02-29");
igual("mês 13 não", v("2026-13-01"), "erro:Data inválida.");
igual("formato BR não", v("01/10/2026").startsWith("erro:Informe"), true);
igual("sem zero à esquerda não", v("2026-10-1").startsWith("erro:Informe"), true);
igual("número não", v(20261001).startsWith("erro:Informe"), true);
igual("null não", v(null).startsWith("erro:Informe"), true);
igual("espaços aparados", v(" 2026-10-02 "), "2026-10-02");
// 23:30 SP de 01/10 = 02:30Z de 02/10: "hoje" ainda é 01/10 (em UTC já seria 02/10).
const NOITE = A("2026-10-02T02:30:00Z");
igual("23:30 SP: hoje é 01/10", v("2026-10-01", NOITE), "2026-10-01");
igual("23:30 SP: 30/09 é passado", v("2026-09-30", NOITE).startsWith("erro:"), true);
// 00:30 SP de 02/10 = 03:30Z: 01/10 já passou.
igual("00:30 SP: 01/10 é passado", v("2026-10-01", A("2026-10-02T03:30:00Z")).startsWith("erro:"), true);
const r = validarDiaBloqueio("2026-10-05", AGORA);
igual("meio-dia em SP (15:00Z)", r.ok ? r.valor.meioDia.toISOString() : null, "2026-10-05T15:00:00.000Z");

/* ---------- limparMotivo ---------- */
const m = (x: unknown) => {
  const r = limparMotivo(x);
  return r.ok ? r.valor : `erro:${r.erro}`;
};
igual("undefined → vazio", m(undefined), "");
igual("null → vazio", m(null), "");
igual("apara e junta espaços", m("  Férias \n\t em família  "), "Férias em família");
igual("remove controle", m("Con\u0000gresso\u0007"), "Con gresso");
igual("120 caracteres vale", m("a".repeat(120)).length, 120);
igual("121 não", m("a".repeat(121)).startsWith("erro:"), true);
igual("121 com espaços nas bordas vale (aparado)", m(` ${"a".repeat(120)} `).length, 120);
igual("número não", m(5).startsWith("erro:"), true);
igual("objeto não", m({}).startsWith("erro:"), true);

/* ---------- diaBloqueado (cliente falso) ---------- */
type Where = { medicoId_dia: { medicoId: string; dia: Date } };
const chamadas: Where[] = [];
const bloqueados = new Set(["m1|2026-10-01"]);
const falso = {
  bloqueioAgenda: {
    findUnique: async ({ where }: { where: Where }) => {
      chamadas.push(where);
      const k = `${where.medicoId_dia.medicoId}|${dateParaDiaIso(where.medicoId_dia.dia)}`;
      return bloqueados.has(k) ? { id: "b1" } : null;
    },
  },
} as unknown as ClienteBanco;

(async () => {
  igual("22:00 SP de 01/10 bloqueado", await diaBloqueado(falso, "m1", A("2026-10-02T01:00:00Z")), true);
  igual("where usa DATE meia-noite UTC", chamadas[0]?.medicoId_dia.dia.toISOString(), "2026-10-01T00:00:00.000Z");
  igual("where usa o médico", chamadas[0]?.medicoId_dia.medicoId, "m1");
  igual("00:00 SP de 02/10 livre", await diaBloqueado(falso, "m1", A("2026-10-02T03:00:00Z")), false);
  igual("09:00 SP de 01/10 bloqueado", await diaBloqueado(falso, "m1", A("2026-10-01T12:00:00Z")), true);
  igual("outro médico livre", await diaBloqueado(falso, "m2", A("2026-10-01T12:00:00Z")), false);
  igual("00:30 SP de 01/10 bloqueado", await diaBloqueado(falso, "m1", A("2026-10-01T03:30:00Z")), true);
  igual("23:30 SP de 30/09 livre", await diaBloqueado(falso, "m1", A("2026-10-01T02:30:00Z")), false);

  /* ---------- agenda do dia (médico) ---------- */
  const consulta = (p: Partial<Consulta> & { id: string; dataISO: string }): Consulta => ({
    medicoId: "m1",
    especialidade: "Clínica",
    paciente: `Paciente ${p.id}`,
    data: "",
    hora: "",
    status: "confirmada",
    ts: Date.parse(p.dataISO),
    pago: true,
    remarcacaoPendente: null,
    ...p,
  });
  const AG = Date.parse("2026-10-01T13:00:00Z");
  const lista = [
    consulta({ id: "a", dataISO: "2026-10-02T13:00:00Z" }), // 02/10 10:00 ativa
    consulta({ id: "b", dataISO: "2026-10-02T14:00:00Z", status: "cancelada" }), // 02/10 11:00 cancelada
  ];
  const grade = ["09:00", "10:00", "11:00"];
  igual(
    "dia bloqueado: livre vira bloqueado; ocupado/encerrada ficam",
    agendaDoDia(lista, "2026-10-02", grade, AG, true).map((s) => [s.hora, s.estado]),
    [["09:00", "bloqueado"], ["10:00", "ocupado"], ["11:00", "encerrada"]],
  );
  igual(
    "dia normal sem mudança",
    agendaDoDia(lista, "2026-10-02", grade, AG).map((s) => [s.hora, s.estado]),
    [["09:00", "livre"], ["10:00", "ocupado"], ["11:00", "encerrada"]],
  );
  igual(
    "semDiasBloqueados",
    semDiasBloqueados([{ iso: "2026-10-01" }, { iso: "2026-10-02" }, { iso: "2026-10-03" }], new Set(["2026-10-02"])).map((d) => d.iso),
    ["2026-10-01", "2026-10-03"],
  );
  igual("semDiasBloqueados sem bloqueios", semDiasBloqueados([{ iso: "2026-10-01" }], new Set()).length, 1);

  await testesCorrida();

  console.log(`${ok} ok, ${falhas} falha(s) — TZ do processo: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  if (falhas) process.exit(1);
})();

/* ================================================================== */
/* Corridas agendar × bloquear (banco falso com trava por chave)       */
/* ================================================================== */

type ConsultaFake = { id: string; dia: string; ativa: boolean; via: string };
const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Banco em memória: bloqueios, consultas e pg_advisory_xact_lock simulado
 * (a trava é liberada no fim da $transaction). `trava: false` = controle sem
 * trava, para provar que o teste detecta a corrida.
 */
function bancoFake(opcoes: { trava: boolean }) {
  const bloqueios = new Map<string, { dia: Date; motivo: string; criadoEm: Date }>();
  const consultas: ConsultaFake[] = [];
  const travas = new Map<string, Promise<void>>();
  const sqls: { sql: string; valores: unknown[] }[] = [];
  const k = (w: { medicoId_dia: { medicoId: string; dia: Date } }) =>
    `${w.medicoId_dia.medicoId}|${dateParaDiaIso(w.medicoId_dia.dia)}`;

  async function adquirir(chave: string): Promise<() => void> {
    while (travas.has(chave)) await travas.get(chave);
    let liberar!: () => void;
    travas.set(chave, new Promise<void>((r) => (liberar = r)));
    return () => {
      travas.delete(chave);
      liberar();
    };
  }

  function novoTx(liberacoes: (() => void)[]) {
    return {
      $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
        sqls.push({ sql: partes.join("?"), valores });
        if (opcoes.trava) liberacoes.push(await adquirir(String(valores[0])));
        return 1;
      },
      bloqueioAgenda: {
        findUnique: async ({ where }: { where: { medicoId_dia: { medicoId: string; dia: Date } } }) => {
          await pausa(1);
          return bloqueios.has(k(where)) ? { id: "b" } : null;
        },
        count: async ({ where }: { where: { medicoId: string } }) => {
          await pausa(1);
          return [...bloqueios.keys()].filter((x) => x.startsWith(`${where.medicoId}|`)).length;
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { medicoId_dia: { medicoId: string; dia: Date } };
          create: { motivo: string; dia: Date };
          update: { motivo: string };
        }) => {
          await pausa(1);
          const atual = bloqueios.get(k(where));
          const novo = atual ? { ...atual, motivo: update.motivo } : { dia: create.dia, motivo: create.motivo, criadoEm: new Date() };
          bloqueios.set(k(where), novo);
          return novo;
        },
      },
    } as unknown as Prisma.TransactionClient;
  }

  return {
    bloqueios,
    consultas,
    sqls,
    async $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      const liberacoes: (() => void)[] = [];
      try {
        return await fn(novoTx(liberacoes));
      } finally {
        liberacoes.forEach((f) => f());
      }
    },
    ativasNoDia: (dia: string) => consultas.filter((c) => c.dia === dia && c.ativa),
    /** Invariante: dia bloqueado não tem consulta ativa. */
    invarianteOk: (medicoId: string, dia: string) =>
      !bloqueios.has(`${medicoId}|${dia}`) || consultas.every((c) => c.dia !== dia || !c.ativa),
  };
}

const DIA = "2026-10-05";
const INSTANTE = A("2026-10-05T13:00:00Z"); // 10:00 SP
const AGORA_C = A("2026-10-01T13:00:00Z");

/** POST /api/consultas (núcleo): trava → confere bloqueio → cria (criação lenta). */
function agendar(b: ReturnType<typeof bancoFake>, id: string, demoraMs = 20) {
  return b.$transaction((tx) =>
    criarSeDiaLivre(tx, "m1", INSTANTE, async () => {
      await pausa(demoraMs);
      b.consultas.push({ id, dia: DIA, ativa: true, via: "agendamento" });
      return id;
    }),
  );
}

/** POST /api/medico/agenda/bloqueios (núcleo), com contar/cancelar sobre o banco falso. */
function bloquear(
  b: ReturnType<typeof bancoFake>,
  cancelarConsultas: boolean,
  aposPrimeiraContagem?: () => void,
) {
  let contagens = 0;
  return b.$transaction((tx) =>
    bloquearDiaTravado(
      tx,
      { medicoId: "m1", dia: DIA, motivo: "Férias", cancelarConsultas, agora: AGORA_C },
      {
        contar: async () => {
          await pausa(1);
          const n = b.ativasNoDia(DIA).length;
          if (++contagens === 1) aposPrimeiraContagem?.();
          return { consultas: n, reservas: 0 };
        },
        cancelar: async () => {
          await pausa(1);
          const alvo = b.ativasNoDia(DIA);
          alvo.forEach((c) => (c.ativa = false));
          return { canceladas: alvo.length, ids: alvo.map((c) => c.id) };
        },
      },
    ),
  );
}

async function testesCorrida() {
  /* ---------- trava: SQL e chave ---------- */
  {
    const b = bancoFake({ trava: true });
    const dia = await b.$transaction((tx) => travarDiaDoMedico(tx, "m1", A("2026-10-02T01:00:00Z")));
    igual("trava: dia de SP de 22:00", dia, "2026-10-01");
    igual("trava: SQL pg_advisory_xact_lock(hashtext(...))", b.sqls[0]?.sql.replace(/\s+/g, " "), "SELECT pg_advisory_xact_lock(hashtext(?::text))");
    igual("trava: chave medicoId:dia", b.sqls[0]?.valores, ["m1:2026-10-01"]);
    igual("chaveTravaDia", chaveTravaDia("m1", "2026-10-05"), "m1:2026-10-05");
  }

  /* ---------- corrida 1: agendamento passou na checagem, bloqueio chega durante a criação ---------- */
  {
    const b = bancoFake({ trava: true });
    const pAg = agendar(b, "c1");
    await pausa(5); // agendamento já passou pela checagem e está criando
    const pBl = bloquear(b, true);
    const [ag, bl] = await Promise.all([pAg, pBl]);
    igual("corrida1 (trava): agendamento entrou antes", ag.bloqueado, false);
    igual("corrida1 (trava): bloqueio gravado", bl.tipo, "ok");
    igual(
      "corrida1 (trava): bloqueio esperou e cancelou a consulta",
      bl.tipo === "ok" ? (bl.cancelamento as { canceladas: number } | null)?.canceladas : null,
      1,
    );
    igual("corrida1 (trava): nenhuma consulta ativa no dia bloqueado", b.invarianteOk("m1", DIA), true);
  }
  {
    // Controle SEM trava: a mesma sequência deixa consulta ativa no dia bloqueado.
    const b = bancoFake({ trava: false });
    const pAg = agendar(b, "c1");
    await pausa(5);
    const pBl = bloquear(b, true);
    await Promise.all([pAg, pBl]);
    igual("controle sem trava: a corrida é detectada (invariante quebra)", b.invarianteOk("m1", DIA), false);
  }
  {
    // Sem cancelarConsultas: o bloqueio espera, vê a consulta e pede confirmação (nada gravado).
    const b = bancoFake({ trava: true });
    const pAg = agendar(b, "c1");
    await pausa(5);
    const pBl = bloquear(b, false);
    const [, bl] = await Promise.all([pAg, pBl]);
    igual("corrida1 sem cancelar: pede confirmação", bl.tipo === "confirmar" ? [bl.tipo, bl.consultas] : bl.tipo, ["confirmar", 1]);
    igual("corrida1 sem cancelar: bloqueio NÃO gravado", b.bloqueios.size, 0);
    igual("corrida1 sem cancelar: consulta segue ativa", b.ativasNoDia(DIA).length, 1);
  }
  {
    // Bloqueio primeiro: o agendamento espera a trava e recebe "bloqueado".
    const b = bancoFake({ trava: true });
    const pBl = bloquear(b, true);
    await pausa(1);
    const pAg = agendar(b, "c2");
    const [bl, ag] = await Promise.all([pBl, pAg]);
    igual("bloqueio antes: bloqueio ok", bl.tipo, "ok");
    igual("bloqueio antes: agendamento recusado (409)", ag.bloqueado, true);
    igual("bloqueio antes: nenhuma consulta criada", b.consultas.length, 0);
  }
  {
    // Vários agendamentos concorrentes + bloqueio: invariante sempre vale.
    const b = bancoFake({ trava: true });
    const ps: Promise<unknown>[] = [agendar(b, "a", 15), agendar(b, "b", 3)];
    await pausa(2);
    ps.push(bloquear(b, true));
    ps.push(agendar(b, "c", 5));
    await Promise.all(ps);
    igual("vários: invariante", b.invarianteOk("m1", DIA), true);
    igual("vários: dia bloqueado", b.bloqueios.size, 1);
  }

  /* ---------- corrida 2: consulta entra entre a contagem e o upsert (sem cancelarConsultas) ---------- */
  {
    const b = bancoFake({ trava: true });
    const bl = await bloquear(b, false, () => {
      // Caminho que não passa pela trava (ex.: remarcação) grava logo após a contagem.
      b.consultas.push({ id: "r1", dia: DIA, ativa: true, via: "remarcacao" });
    });
    igual("corrida2: bloqueio gravado", bl.tipo, "ok");
    igual("corrida2: recontagem detectou", bl.tipo === "ok" ? bl.apareceuDepois : null, true);
    igual(
      "corrida2: consulta que apareceu foi cancelada",
      bl.tipo === "ok" ? (bl.cancelamento as { ids: string[] } | null)?.ids : null,
      ["r1"],
    );
    igual("corrida2: invariante", b.invarianteOk("m1", DIA), true);
  }
  {
    const b = bancoFake({ trava: true });
    const bl = await bloquear(b, false);
    igual(
      "dia vazio sem cancelar: bloqueia sem cancelar nada",
      bl.tipo === "ok" ? [bl.cancelamento, bl.apareceuDepois] : bl.tipo,
      [null, false],
    );
  }

  /* ---------- teto de bloqueios futuros (dentro da trava) ---------- */
  {
    const b = bancoFake({ trava: true });
    for (let i = 0; i < MAX_BLOQUEIOS_FUTUROS; i++) {
      b.bloqueios.set(`m1|${somarDiasIso("2026-11-01", i)}`, { dia: new Date(), motivo: "", criadoEm: new Date() });
    }
    const bl = await bloquear(b, false);
    igual("teto: 121º dia recusado", bl.tipo, "limite");
    b.bloqueios.set(`m1|${DIA}`, { dia: new Date(), motivo: "", criadoEm: new Date() });
    const de_novo = await bloquear(b, false);
    igual("teto: dia já bloqueado atualiza (idempotente)", de_novo.tipo, "ok");
  }
}
