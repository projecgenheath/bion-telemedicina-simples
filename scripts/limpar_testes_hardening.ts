import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Cancela consultas criadas pelos testes de hardening (deixa a trilha coerente
// e o banco demo limpo). IDs conhecidos dos testes manuais + motivo "Teste".
const idsManuais = ["cmu7lx0ip003hr7xmq6c14vo5", "cmu7m1cy2003xr7xmag47k96x"];

const alvos = await db.consulta.findMany({
  where: {
    OR: [
      { id: { in: idsManuais } },
      { motivoConsulta: { startsWith: "Teste de hardening" } },
      { motivoConsulta: { startsWith: "Teste webhook" } },
    ],
    status: { in: ["pendente_anamnese", "confirmada", "em_espera"] },
  },
  select: { id: true, status: true, pago: true, motivoConsulta: true },
});

for (const c of alvos) {
  await db.consulta.update({
    where: { id: c.id },
    data: { status: "cancelada", motivoCancelamento: "limpeza do ambiente de teste" },
  });
  console.log("cancelada:", c.id, c.motivoConsulta?.slice(0, 40), "(pago:", String(c.pago) + ")");
}

console.log(`\n${alvos.length} consulta(s) de teste cancelada(s).`);
await db.$disconnect();
