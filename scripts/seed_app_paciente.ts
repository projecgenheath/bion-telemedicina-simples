/**
 * Seed do app imersivo do paciente: medições (peso/altura/PA), exames
 * laboratoriais e campos novos do perfil. Idempotente — pula usuários que já
 * tenham dados. Rodar com DATABASE_URL apontando para o banco desejado.
 *
 * Uso: DATABASE_URL='...' bun scripts/seed_app_paciente.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);

const item = (nome: string, valor: number, unidade: string, refMin?: number, refMax?: number) => ({
  nome,
  valor,
  unidade,
  ...(refMin !== undefined ? { refMin } : {}),
  ...(refMax !== undefined ? { refMax } : {}),
});

async function main() {
  const planos: Record<
    string,
    {
      profissao: string;
      estadoCivil: string;
      comorbidades: string[];
      peso: number[];
      altura: number[];
      pa: [number, number][];
      exames: { titulo: string; dias: number; itens: ReturnType<typeof item>[] }[];
    }
  > = {
    "marina.silva@email.com": {
      profissao: "Professora",
      estadoCivil: "Casada",
      comorbidades: ["Hipotensão leve"],
      peso: [68.4, 67.8, 67.1, 66.5, 66.0, 65.4],
      altura: [165],
      pa: [
        [118, 76],
        [121, 78],
        [116, 74],
        [119, 77],
        [117, 75],
      ],
      exames: [
        {
          titulo: "Hemograma completo",
          dias: 45,
          itens: [
            item("Hemoglobina", 13.5, "g/dL", 12, 16),
            item("Leucócitos", 7200, "/mm3", 4500, 11000),
            item("Plaquetas", 250000, "/mm3", 150000, 400000),
          ],
        },
        {
          titulo: "Hemograma completo",
          dias: 5,
          itens: [
            item("Hemoglobina", 13.9, "g/dL", 12, 16),
            item("Leucócitos", 7600, "/mm3", 4500, 11000),
            item("Plaquetas", 262000, "/mm3", 150000, 400000),
          ],
        },
        {
          titulo: "Glicemia em jejum",
          dias: 45,
          itens: [item("Glicose", 94, "mg/dL", 70, 99)],
        },
        {
          titulo: "Glicemia em jejum",
          dias: 5,
          itens: [item("Glicose", 91, "mg/dL", 70, 99)],
        },
        {
          titulo: "Perfil lipídico",
          dias: 5,
          itens: [
            item("Colesterol total", 180, "mg/dL", undefined, 200),
            item("HDL", 52, "mg/dL", 40, undefined),
            item("LDL", 108, "mg/dL", undefined, 130),
            item("Triglicerídeos", 121, "mg/dL", undefined, 150),
          ],
        },
      ],
    },
    "joao.pereira@email.com": {
      profissao: "Analista de sistemas",
      estadoCivil: "Solteiro",
      comorbidades: [],
      peso: [84.2, 83.1, 82.0],
      altura: [178],
      pa: [
        [132, 86],
        [128, 83],
      ],
      exames: [
        {
          titulo: "Glicemia em jejum",
          dias: 20,
          itens: [item("Glicose", 104, "mg/dL", 70, 99)],
        },
      ],
    },
    "carlos.souza@email.com": {
      profissao: "Motorista",
      estadoCivil: "Casado",
      comorbidades: ["Diabetes tipo 2"],
      peso: [92.5, 91.8],
      altura: [172],
      pa: [[138, 88]],
      exames: [
        {
          titulo: "Hemoglobina glicada",
          dias: 30,
          itens: [item("HbA1c", 7.2, "%", undefined, 5.7)],
        },
      ],
    },
  };

  for (const [email, plano] of Object.entries(planos)) {
    const user = await db.user.findFirst({ where: { email, role: "PACIENTE" } });
    if (!user) {
      console.log(`PACIENTE_AUSENTE ${email}`);
      continue;
    }

    const jaTem = await db.medicao.count({ where: { usuarioId: user.id } });
    if (jaTem > 0) {
      console.log(`JA_POSSUI_DADOS ${email} (${jaTem} medições)`);
      continue;
    }

    // Campos novos do perfil
    await db.perfilPaciente.updateMany({
      where: { userId: user.id },
      data: {
        profissao: plano.profissao,
        estadoCivil: plano.estadoCivil,
        comorbidades: JSON.stringify(plano.comorbidades),
        peso: String(plano.peso.at(-1)),
        altura: String(plano.altura.at(-1)),
        ...(plano.comorbidades.length ? {} : {}),
      },
    });

    // Medições: peso (espalhados), altura (1), PA
    for (let i = 0; i < plano.peso.length; i++) {
      await db.medicao.create({
        data: { usuarioId: user.id, tipo: "peso", valor1: plano.peso[i], criadoEm: diasAtras((plano.peso.length - i) * 14) },
      });
    }
    for (const a of plano.altura) {
      await db.medicao.create({ data: { usuarioId: user.id, tipo: "altura", valor1: a, criadoEm: diasAtras(180) } });
    }
    for (let i = 0; i < plano.pa.length; i++) {
      await db.medicao.create({
        data: {
          usuarioId: user.id,
          tipo: "pa",
          valor1: plano.pa[i][0],
          valor2: plano.pa[i][1],
          criadoEm: diasAtras((plano.pa.length - i) * 10),
        },
      });
    }

    // Exames laboratoriais
    for (const ex of plano.exames) {
      await db.exameLaboratorial.create({
        data: {
          usuarioId: user.id,
          titulo: ex.titulo,
          dataColeta: diasAtras(ex.dias),
          itens: JSON.stringify(ex.itens),
          origem: "bion-ia",
          arquivoNome: "laudo-laboratorial.pdf",
        },
      });
    }

    console.log(`SEED_OK ${email}: ${plano.peso.length + plano.altura.length + plano.pa.length} medições, ${plano.exames.length} exames`);
  }

  // Consultas demo: garante valor e status de pagamento coerentes
  const consultas = await db.consulta.findMany({ where: { valor: 0 }, include: { medico: { include: { perfilMedico: true } } } });
  for (const c of consultas) {
    const valor = c.medico.perfilMedico?.valor ?? 150;
    await db.consulta.update({ where: { id: c.id }, data: { valor, pago: c.status === "concluida" } });
  }
  console.log(`VALORES_ATUALIZADOS ${consultas.length} consultas`);
}

main()
  .catch((e) => {
    console.error("SEED_ERRO", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
