/** Médico suspenso: multa de remarcação volta ao paciente e chamada de renovação é recusada. Rodar: bun --conditions=react-server test ./src/lib/server/medico-suspenso-multa.teste.ts */
import { describe, expect, test } from "bun:test";
import type { Prisma } from "@prisma/client";
import { conferirMedicoAtivoNaTransacao } from "./bloqueio-agenda";
import { impedimentoMultaRemarcacao } from "./financeiro";
import { ERRO_MEDICO_INDISPONIVEL } from "@/lib/anonimizar-medico-logica";

type Linha = { userStatus: string; perfilStatus: string; email: string };
function txFalsa(medico: Linha | null, o: { ocupado?: boolean; bloqueado?: boolean } = {}) {
  const chamadas: string[] = [];
  const tx = {
    $queryRaw: async () => { chamadas.push("medico"); return medico ? [medico] : []; },
    consulta: { findFirst: async () => { chamadas.push("consulta"); return o.ocupado ? { id: "outra" } : null; } },
    bloqueioAgenda: { findUnique: async () => { chamadas.push("bloqueio"); return o.bloqueado ? { id: "b" } : null; } },
  } as unknown as Prisma.TransactionClient;
  return { tx, chamadas };
}
const ativo: Linha = { userStatus: "ativo", perfilStatus: "ativo", email: "m@x.com" };
const suspenso: Linha = { ...ativo, userStatus: "suspenso" };
const base = {
  consultaId: "c1", medicoId: "m1", statusConsulta: "confirmada", statusReserva: "pendente",
  reservaVigente: true, novaData: new Date("2026-11-10T14:00:00-03:00"),
};

describe("conferirMedicoAtivoNaTransacao (chamada de renovação)", () => {
  test("médico ativo passa", async () => expect(await conferirMedicoAtivoNaTransacao(txFalsa(ativo).tx, "m1")).toBeNull());
  test("médico suspenso é recusado", async () =>
    expect(await conferirMedicoAtivoNaTransacao(txFalsa(suspenso).tx, "m1")).toBe(ERRO_MEDICO_INDISPONIVEL));
  test("perfil inativo é recusado", async () =>
    expect(await conferirMedicoAtivoNaTransacao(txFalsa({ ...ativo, perfilStatus: "suspenso" }).tx, "m1")).toBe(ERRO_MEDICO_INDISPONIVEL));
  test("médico inexistente é recusado", async () =>
    expect(await conferirMedicoAtivoNaTransacao(txFalsa(null).tx, "m1")).toBe(ERRO_MEDICO_INDISPONIVEL));
});

describe("impedimentoMultaRemarcacao", () => {
  test("médico ativo e horário livre: aplica", async () => expect(await impedimentoMultaRemarcacao(txFalsa(ativo).tx, base)).toBeNull());
  test("médico suspenso: devolve a multa, antes de qualquer outra checagem", async () => {
    const { tx, chamadas } = txFalsa(suspenso);
    expect(await impedimentoMultaRemarcacao(tx, base)).toBe("medico_suspenso");
    expect(chamadas).toEqual(["medico"]);
  });
  test("suspenso vence mesmo com reserva expirada", async () =>
    expect(await impedimentoMultaRemarcacao(txFalsa(suspenso).tx, { ...base, reservaVigente: false })).toBe("medico_suspenso"));
  test("reserva vencida", async () =>
    expect(await impedimentoMultaRemarcacao(txFalsa(ativo).tx, { ...base, reservaVigente: false })).toBe("reserva_invalida"));
  test("consulta encerrada", async () =>
    expect(await impedimentoMultaRemarcacao(txFalsa(ativo).tx, { ...base, statusConsulta: "cancelada" })).toBe("reserva_invalida"));
  test("horário ocupado", async () =>
    expect(await impedimentoMultaRemarcacao(txFalsa(ativo, { ocupado: true }).tx, base)).toBe("horario_ocupado"));
  test("dia bloqueado", async () =>
    expect(await impedimentoMultaRemarcacao(txFalsa(ativo, { bloqueado: true }).tx, base)).toBe("dia_bloqueado"));
  test("horário vedado 23h", async () =>
    expect(await impedimentoMultaRemarcacao(txFalsa(ativo).tx, { ...base, novaData: new Date("2026-11-10T23:00:00-03:00") })).toBe("horario_vedado"));
});
