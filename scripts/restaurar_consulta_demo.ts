/**
 * Restaura o estado demo da consulta principal após testes da sala WebRTC
 * (status concluida → confirmada) e remove sinais/presenças de teste.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const consulta = await db.consulta.findFirst({
  where: { medico: { email: "ana.ribeiro@med.bion.app" }, paciente: { email: "marina.silva@email.com" } },
  orderBy: { dataInicio: "asc" },
});
if (!consulta) {
  console.log("consulta principal não encontrada");
  process.exit(0);
}

const atualizada = await db.consulta.update({
  where: { id: consulta.id },
  data: { status: "confirmada", resumoMedico: null },
});
console.log(`consulta ${atualizada.id} restaurada para "${atualizada.status}"`);

const delSinais = await db.sinalSala.deleteMany({});
const delPres = await db.presencaSala.deleteMany({});
console.log(`sinais removidos: ${delSinais.count} | presenças removidas: ${delPres.count}`);
await db.$disconnect();
