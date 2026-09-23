/**
 * Remove consultas de TESTE criadas hoje pela suíte de hardening/regressão
 * (motivo "Teste de hardening", "limpeza do teste", "Teste webhook",
 * "E2E") com seus pagamentos/anamneses. Idempotente.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const alvos = await db.consulta.findMany({
    where: {
      createdAt: { gte: inicio },
      OR: [
        { motivoConsulta: { contains: "hardening" } },
        { motivoConsulta: { contains: "Hardening" } },
        { motivoConsulta: { contains: "Teste webhook" } },
        { motivoConsulta: { contains: "limpeza do teste" } },
        { motivoConsulta: { contains: "item 9" } },
      ],
    },
    select: { id: true, motivoConsulta: true, status: true },
  });
  console.log(`consultas de teste de hoje: ${alvos.length}`);
  for (const c of alvos) {
    const a = await db.anamnese.deleteMany({ where: { consultaId: c.id } });
    const p = await db.pagamento.deleteMany({ where: { consultaId: c.id } });
    const r = await db.consulta.delete({ where: { id: c.id } });
    console.log(`removida ${r.id} (${c.motivoConsulta?.slice(0, 40)}) anamnese=${a.count} pagamento=${p.count}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
