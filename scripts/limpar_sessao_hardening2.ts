/**
 * Limpeza FINAL em produção: remove TODAS as consultas de hoje da Marina
 * (todos os artefatos dos testes E2E desta sessão), com anamnese/pagamento,
 * restaura peso 66 kg e remove medições/pesos de teste de hoje.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const marina = await db.user.findFirst({
    where: { email: "marina.silva@email.com" },
    select: { id: true },
  });
  if (!marina) throw new Error("marina não encontrada");
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  const consultas = await db.consulta.findMany({
    where: { pacienteId: marina.id, createdAt: { gte: inicio } },
    select: { id: true, dataInicio: true, status: true },
  });
  console.log(`consultas de teste da Marina hoje: ${consultas.length}`);
  for (const c of consultas) {
    const a = await db.anamnese.deleteMany({ where: { consultaId: c.id } });
    const p = await db.pagamento.deleteMany({ where: { consultaId: c.id } });
    await db.consulta.delete({ where: { id: c.id } });
    console.log(`removida ${c.id} · anamnese=${a.count} pagamento=${p.count}`);
  }

  const meiaNoite = new Date();
  meiaNoite.setHours(0, 0, 0, 0);
  const medicoes = await db.medicao.deleteMany({
    where: { usuarioId: marina.id, tipo: { in: ["peso", "altura"] }, criadoEm: { gte: meiaNoite } },
  });
  console.log(`medições de hoje removidas: ${medicoes.count}`);

  const perfil = await db.perfilPaciente.updateMany({
    where: { userId: marina.id, peso: { not: "66" } },
    data: { peso: "66" },
  });
  console.log(`perfil com peso restaurado para 66 kg: ${perfil.count}`);

  // Arquivo marcado do teste V6 (se existir)
  const arqs = await db.arquivo.deleteMany({
    where: { usuarioId: marina.id, nome: { startsWith: "HARDENING_V6_" } },
  });
  console.log(`arquivos de teste V6 removidos: ${arqs.count}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
