/**
 * Limpeza dos dados criados pelo teste do cenário do print:
 *  - remove a consulta de teste (+ anamnese e pagamento vinculados);
 *  - remove a Medicao "peso 80" criada hoje para a Marina;
 *  - restaura perfilPaciente.peso = "66" (valor anterior conhecido).
 * Uso: bun scripts/limpar_cenario_print.ts <CONSULTA_ID>
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const consultaId = process.argv[2];
const PESO_ANTERIOR = "66";

async function main() {
  if (!consultaId) throw new Error("informe o CONSULTA_ID");
  const marina = await db.user.findFirst({
    where: { email: "marina.silva@email.com" },
    select: { id: true, nome: true },
  });
  if (!marina) throw new Error("marina não encontrada");

  const anamnese = await db.anamnese.deleteMany({ where: { consultaId } });
  const pagamento = await db.pagamento.deleteMany({ where: { consultaId } });
  const consulta = await db.consulta.deleteMany({ where: { id: consultaId, pacienteId: marina.id } });
  console.log(`consulta: ${consulta.count} · anamnese: ${anamnese.count} · pagamento: ${pagamento.count}`);

  const meiaNoite = new Date();
  meiaNoite.setHours(0, 0, 0, 0);
  const medicoes = await db.medicao.deleteMany({
    where: { usuarioId: marina.id, tipo: "peso", valor1: 80, criadoEm: { gte: meiaNoite } },
  });
  console.log(`medições de peso 80 de hoje removidas: ${medicoes.count}`);

  const perfil = await db.perfilPaciente.updateMany({
    where: { userId: marina.id, peso: "80" },
    data: { peso: PESO_ANTERIOR },
  });
  console.log(`perfil restaurado para ${PESO_ANTERIOR} kg: ${perfil.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
