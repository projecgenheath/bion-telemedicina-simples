/**
 * Testes do filtro da trava de medicoLivreAgora.
 * Rodar: bun src/lib/medico-livre-logica.teste.ts
 */
import { filtroEvolucaoPendente } from "./medico-livre-logica";

let ok = 0, falhas = 0;
function igual(nome: string, a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) ok++; else { falhas++; console.error(`✗ ${nome}\n   obtido:   ${x}\n   esperado: ${y}`); }
}

// Simula o where do Prisma sobre uma lista de evoluções.
type Ev = { medicoId: string; status: string; consultaId: string };
const casa = (w: ReturnType<typeof filtroEvolucaoPendente>, e: Ev) =>
  e.medicoId === w.medicoId && e.status === w.status && (!("consultaId" in w) || e.consultaId !== w.consultaId!.not);
const evs: Ev[] = [
  { medicoId: "m1", status: "rascunho", consultaId: "c1" },
  { medicoId: "m1", status: "concluida", consultaId: "c2" },
  { medicoId: "m2", status: "rascunho", consultaId: "c3" },
];
const trava = (m: string, exceto?: string | null) => evs.some((e) => casa(filtroEvolucaoPendente(m, exceto), e));

igual("sem exceção: rascunho de qualquer consulta trava", trava("m1"), true);
igual("rascunho da própria consulta não trava", trava("m1", "c1"), false);
igual("rascunho de outra consulta trava", trava("m1", "c9"), true);
igual("concluída não trava", trava("m1", "c1"), false);
igual("null = sem exceção", trava("m2", null), true);
igual("rascunho de outro médico não trava", trava("m3"), false);
igual("where sem exceção", filtroEvolucaoPendente("m1"), { medicoId: "m1", status: "rascunho" });
igual("where com exceção", filtroEvolucaoPendente("m1", "c1"), { medicoId: "m1", status: "rascunho", consultaId: { not: "c1" } });

console.log(`${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
