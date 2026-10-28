/**
 * Testes do portão jurídico da BION IA (novo aceite da versão NVIDIA).
 * Rodar: bun --conditions react-server src/lib/consentimento-ia.teste.ts
 */
import {
  CODIGO_CONSENTIMENTO_IA_PENDENTE,
  FINALIDADE_CONSENTIMENTO_IA,
  FINALIDADE_REVOGACAO_IA,
  PREFIXO_FINALIDADE_IA,
  VERSAO_CONSENTIMENTO_IA,
  consentimentoIaVigente,
  corpoConsentimentoIaPendente,
  ehConsentimentoIaPendente,
} from "./consentimento-ia";
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } from "./aceite-termos";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.log(`✗ ${nome}\n   obtido:   ${JSON.stringify(obtido)}\n   esperado: ${JSON.stringify(esperado)}`);
  }
}

igual("versões v1", [VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE], ["privacidade-v1-2026-10-27", "termos-paciente-v1-2026-10-27"]);
igual("finalidade com prefixo, NVIDIA e versões", [
  FINALIDADE_CONSENTIMENTO_IA.startsWith(PREFIXO_FINALIDADE_IA),
  FINALIDADE_CONSENTIMENTO_IA.includes("NVIDIA"),
  FINALIDADE_CONSENTIMENTO_IA.includes(VERSAO_PRIVACIDADE),
  FINALIDADE_CONSENTIMENTO_IA.includes(VERSAO_TERMOS_PACIENTE),
], [true, true, true, true]);
igual("versão do consentimento da IA", VERSAO_CONSENTIMENTO_IA, "ia-nvidia-v2-2026-10-28");
igual(
  "aceite da v1 (texto anterior): pendente",
  consentimentoIaVigente({ aceito: true, finalidade: `${PREFIXO_FINALIDADE_IA}: NVIDIA (versão ia-nvidia-v1-2026-10-27)` }),
  false,
);
igual("sem registro: pendente", consentimentoIaVigente(null), false);
igual("aceite atual: vigente", consentimentoIaVigente({ aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA }), true);
igual("revogado: pendente", consentimentoIaVigente({ aceito: false, finalidade: FINALIDADE_REVOGACAO_IA }), false);
igual(
  "aceite de versão antiga: pendente",
  consentimentoIaVigente({ aceito: true, finalidade: `${PREFIXO_FINALIDADE_IA}: Google (versão ia-v0)` }),
  false,
);
igual("409 reconhecido", ehConsentimentoIaPendente(409, corpoConsentimentoIaPendente()), true);
igual("409 sem código não", ehConsentimentoIaPendente(409, { erro: "x" }), false);
igual("403 reconhecido", ehConsentimentoIaPendente(403, corpoConsentimentoIaPendente()), true);
igual("outro status não", ehConsentimentoIaPendente(400, { codigo: CODIGO_CONSENTIMENTO_IA_PENDENTE }), false);
igual("corpo traz versão", corpoConsentimentoIaPendente().versao, VERSAO_CONSENTIMENTO_IA);

// Portão do servidor com banco falso (sem conexão real).
{
  let registro: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
  let quebrar = false;
  (globalThis as unknown as { prisma: unknown }).prisma = {
    consentimento: {
      findFirst: async () => {
        if (quebrar) throw new Error("db fora");
        return registro;
      },
    },
  };
  const { exigirConsentimentoIa } = await import("./server/consentimento-ia");
  const pac = { id: "p1", role: "PACIENTE" };
  let r = await exigirConsentimentoIa(pac);
  igual("portão: sem aceite → 403", r?.status, 403);
  igual("portão: código no corpo", ((await r!.json()) as { codigo: string }).codigo, CODIGO_CONSENTIMENTO_IA_PENDENTE);
  registro = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  igual("portão: aceite atual passa", await exigirConsentimentoIa(pac), null);
  registro = { aceito: false, finalidade: FINALIDADE_REVOGACAO_IA, createdAt: new Date() };
  igual("portão: revogado → 403", (await exigirConsentimentoIa(pac))?.status, 403);
  registro = null;
  igual("portão: médico não é afetado", await exigirConsentimentoIa({ id: "m1", role: "MEDICO" }), null);
  quebrar = true;
  r = await exigirConsentimentoIa(pac);
  igual("portão: erro no banco bloqueia (falha fechada)", r?.status, 403);
}

console.log(`consentimento-ia: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
