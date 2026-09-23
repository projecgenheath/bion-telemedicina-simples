import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const users = await db.user.count({ where: { nome: { contains: "Teste V4" } } });
const tickets = await db.ticket.count({ where: { assunto: { contains: "Teste V7" } } });
const msgs = await db.mensagem.count({ where: { texto: "Mensagem de teste do polling incremental." } });
const peso = await db.perfilPaciente.findUnique({ where: { userId: (await db.user.findUnique({ where: { email: "marina.silva@email.com" } }))!.id }, select: { peso: true } });
console.log(JSON.stringify({ usersTeste: users, ticketsTeste: tickets, msgsTeste: msgs, pesoMarina: peso?.peso }));
await db.$disconnect();
