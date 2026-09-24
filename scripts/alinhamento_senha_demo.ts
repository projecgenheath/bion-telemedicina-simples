/**
 * Alinhamento de senha demo (política P0 — fb859d4):
 * a outra linha de trabalho mudou o padrão demo de "bion123" para
 * "bion123456" (seeds, Login, validação), mas o BANCO de produção continuou
 * com os hashes antigos — a tela de login exibia uma senha que não funciona.
 *
 * Este script troca a senha de TODOS os usuários que ainda autenticam com
 * "bion123" (comparação por hash — quem já trocou a própria senha não é
 * tocado) para "bion123456", tornando código e banco coerentes.
 *
 * Uso: set -a; source .env; set +a; bun run scripts/alinhamento_senha_demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const NOVA_SENHA = "bion123456";
const ANTIGA_SENHA = "bion123";

async function main() {
  const db = new PrismaClient();
  try {
    const usuarios = await db.user.findMany({
      select: { id: true, nome: true, email: true, role: true, senhaHash: true },
    });
    let trocados = 0;
    for (const u of usuarios) {
      if (!u.senhaHash) continue;
      const usaAntiga = await bcrypt.compare(ANTIGA_SENHA, u.senhaHash);
      if (!usaAntiga) continue; // já trocou a senha (ou nunca foi demo) → preserva
      const novoHash = await bcrypt.hash(NOVA_SENHA, 10);
      await db.user.update({ where: { id: u.id }, data: { senhaHash: novoHash } });
      trocados += 1;
      console.log(`  atualizado: ${u.email} (${u.role}) — ${u.nome}`);
    }
    console.log(`\nTotal: ${usuarios.length} usuários verificados, ${trocados} com senha demo atualizada para a política P0.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("FALHA:", e);
  process.exit(1);
});
