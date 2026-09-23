import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
const nome = `Teste UI ${Date.now()}`;
const email = `teste.ui.${Date.now()}@bion.app`;
const user = await db.user.create({
  data: {
    nome, email,
    senhaHash: await bcrypt.hash("bion123", 10),
    role: "PACIENTE",
    status: "ativo",
    precisaTrocarSenha: true,
    perfilPaciente: { create: { telefone: "11999990002", cpf: "000.000.002-00", idade: 35, genero: "Feminino", convenio: "Particular" } },
  },
});
console.log(JSON.stringify({ email, id: user.id, nome }));
await db.$disconnect();
