import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.pagamento.findMany({
  orderBy: { criadoEm: "desc" },
  take: 6,
  include: { consulta: { select: { pago: true, status: true, motivoConsulta: true } } },
});
for (const p of rows) {
  console.log({
    pagamento: p.id,
    status: p.status,
    via: p.via,
    consulta: p.consultaId,
    consultaPago: p.consulta.pago,
    consultaStatus: p.consulta.status,
    motivo: p.consulta.motivoConsulta?.slice(0, 40),
  });
}
await db.$disconnect();
