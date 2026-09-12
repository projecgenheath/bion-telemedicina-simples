/**
 * Inspeciona os últimos sinais WebRTC da consulta (debug da Fase 2).
 * Uso: export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"') && bun scripts/ver_sinais.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const consultas = await db.consulta.findMany({
  where: { status: { in: ["confirmada", "concluida"] } },
  orderBy: { updatedAt: "desc" },
  take: 3,
  select: {
    id: true,
    status: true,
    sinaisSala: {
      orderBy: { createdAt: "asc" },
      select: { tipo: true, deRole: true, consumido: true },
    },
  },
});
for (const c of consultas) {
  console.log(`consulta ${c.id} [${c.status}]`);
  for (const s of c.sinaisSala) {
    console.log(`   ${s.tipo.padEnd(10)} de=${s.deRole.padEnd(8)} consumido=${s.consumido}`);
  }
}
await db.$disconnect();
