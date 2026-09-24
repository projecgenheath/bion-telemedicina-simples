// Alinha senhas demo do SQLite LOCAL para bion123456 (espelho do script
// alinhamento_senha_demo.ts que rodou no Supabase na FASE 1).
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const hash = await bcrypt.hash("bion123456", 10);
const usuarios = await db.user.findMany({ select: { id: true, email: true } });
let n = 0;
for (const u of usuarios) {
  await db.user.update({ where: { id: u.id }, data: { senhaHash: hash } });
  n++;
}
console.log(`${n} usuários locais alinhados para bion123456`);
await db.$disconnect();
