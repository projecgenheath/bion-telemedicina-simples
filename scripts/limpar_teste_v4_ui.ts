import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const alvos = await db.user.findMany({ where: { email: { contains: "teste.ui." }, role: "PACIENTE" }, select: { id: true, email: true } });
for (const u of alvos) { await db.user.delete({ where: { id: u.id } }); console.log("removido", u.email); }
// Sessões podem ter ficado; cascata cuida. Limpa audits do teste UI.
const auds = await db.auditLog.findMany({ where: { usuarioNome: { contains: "Teste UI" } }, select: { id: true } });
for (const a of auds) await db.auditLog.delete({ where: { id: a.id } });
console.log("audits removidos:", auds.length);
await db.$disconnect();
