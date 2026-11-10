/**
 * Testes de triagem-rodape.ts. Rodar: bun src/components/bion/paciente/triagem-rodape.teste.ts
 */
import { acaoRodapeTriagem } from "./triagem-rodape";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

const TOTAL = 12; // ETAPAS_ANAMNESE tem 12 etapas; o helper só usa o total.

// O bug original: último card, etapa atual, SEM resposta → era "Enviar ao
// médico" e o rascunho digitado se perdia. Agora é "Continuar" (envia).
eq(
  "última etapa atual sem resposta → continuar (não descarta o rascunho)",
  acaoRodapeTriagem({ pronta: false, indiceCard: TOTAL - 1, totalEtapas: TOTAL, indiceServidor: TOTAL - 1, respondida: false }),
  "continuar",
);

// Última etapa já respondida (servidor ainda não marcou pronta) → pode concluir.
eq(
  "última etapa respondida → enviar ao médico",
  acaoRodapeTriagem({ pronta: false, indiceCard: TOTAL - 1, totalEtapas: TOTAL, indiceServidor: TOTAL - 1, respondida: true }),
  "enviar-medico",
);

// Pronta: qualquer card oferece a conclusão (comportamento histórico).
eq(
  "pronta no último card → enviar ao médico",
  acaoRodapeTriagem({ pronta: true, indiceCard: TOTAL - 1, totalEtapas: TOTAL, indiceServidor: TOTAL - 1, respondida: true }),
  "enviar-medico",
);
eq(
  "pronta num card do meio → enviar ao médico",
  acaoRodapeTriagem({ pronta: true, indiceCard: 3, totalEtapas: TOTAL, indiceServidor: TOTAL - 1, respondida: true }),
  "enviar-medico",
);

// Etapa atual no meio do fluxo → Continuar.
eq(
  "etapa atual no meio → continuar",
  acaoRodapeTriagem({ pronta: false, indiceCard: 4, totalEtapas: TOTAL, indiceServidor: 4, respondida: false }),
  "continuar",
);

// Card anterior já respondido (não é o último) → voltar à pergunta atual.
eq(
  "card anterior respondido → ir para a pergunta",
  acaoRodapeTriagem({ pronta: false, indiceCard: 2, totalEtapas: TOTAL, indiceServidor: 5, respondida: true }),
  "ir-para-pergunta",
);

// Primeira etapa como atual → Continuar (não "Enviar").
eq(
  "primeira etapa atual → continuar",
  acaoRodapeTriagem({ pronta: false, indiceCard: 0, totalEtapas: TOTAL, indiceServidor: 0, respondida: false }),
  "continuar",
);

console.log(`triagem-rodape: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
