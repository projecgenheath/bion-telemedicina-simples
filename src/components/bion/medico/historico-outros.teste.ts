/**
 * Histórico com outros profissionais: normalização da coleta e aviso de consentimento.
 * Rodar: bun src/components/bion/medico/historico-outros.teste.ts
 */
import { readFileSync } from "node:fs";
import {
  AVISO_CONSENTIMENTO_HISTORICO,
  coletaAnamnese,
  itensDeOutrosProfissionais,
  lerHistoricoClinico,
  lerItemHistorico,
  temColeta,
} from "./historico-outros";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; return; }
  falhas++;
  console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
}
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else { falhas++; console.log(`FALHA ${nome}`); }
}

igual("coleta nula", coletaAnamnese(null), {});
igual("coleta array", coletaAnamnese(["x"]), {});
igual("coleta escalar", coletaAnamnese("texto"), {});
igual("ignora etapa que não é objeto", coletaAnamnese({ queixa: { dor: "peito" }, lixo: 1, lista: [] }), { queixa: { dor: "peito" } });
checa("tem coleta", temColeta({ queixa: { dor: "peito" } }));
checa("sem coleta", !temColeta({}));

const item = lerItemHistorico({
  consultaId: "c1",
  dataInicio: "2026-11-01T13:00:00.000Z",
  especialidade: "Clínica",
  medico: "Dra. Ana",
  deOutroMedico: true,
  anamnese: { status: "concluida", coleta: { queixa: { relato: "dor" } } },
  evolucao: { conduta: { texto: "repouso" }, cid: "R07" },
});
igual("lê item completo", item, {
  consultaId: "c1",
  dataInicio: "2026-11-01T13:00:00.000Z",
  especialidade: "Clínica",
  medico: "Dra. Ana",
  deOutroMedico: true,
  anamnese: { status: "concluida", coleta: { queixa: { relato: "dor" } } },
  evolucao: { conduta: { texto: "repouso" }, cid: "R07" },
});
igual("sem consultaId é nulo", lerItemHistorico({ medico: "X" }), null);
igual("anamnese inválida vira null", lerItemHistorico({ consultaId: "c2", anamnese: "x", deOutroMedico: false })?.anamnese, null);
igual("deOutroMedico só com true", lerItemHistorico({ consultaId: "c3", deOutroMedico: "sim" })?.deOutroMedico, false);

const lista = lerHistoricoClinico([
  { consultaId: "a", deOutroMedico: true, medico: "A" },
  { consultaId: "b", deOutroMedico: false, medico: "B" },
  { medico: "sem id" },
]);
igual("lista ignora inválidos", lista.map((i) => i.consultaId), ["a", "b"]);
igual("filtra outros profissionais", itensDeOutrosProfissionais(lista).map((i) => i.consultaId), ["a"]);

checa("aviso menciona consentimento", AVISO_CONSENTIMENTO_HISTORICO.includes("consentiu"));
checa("aviso menciona anamneses", AVISO_CONSENTIMENTO_HISTORICO.includes("anamneses"));
checa("aviso menciona Auditoria", AVISO_CONSENTIMENTO_HISTORICO.includes("Auditoria"));
checa("aviso não inventa CNPJ", !/CNPJ|nossos termos jurídicas/i.test(AVISO_CONSENTIMENTO_HISTORICO));

const painel = readFileSync(new URL("./evolucao/PainelEvolucao.tsx", import.meta.url), "utf8");
checa("painel usa o cartão do histórico", painel.includes("CartaoHistoricoClinico"));
checa("painel mostra a coleta (não só o status)", painel.includes("AvisoConsentimentoHistorico"));
checa("painel continua sem base de outro médico", painel.includes("!h.deOutroMedico"));

const prontuario = readFileSync(new URL("./ProntuarioPaciente.tsx", import.meta.url), "utf8");
checa("prontuário lista anamneses de outros profissionais", prontuario.includes("itensDeOutrosProfissionais") && prontuario.includes("CartaoHistoricoClinico"));
checa("prontuário traz o aviso de consentimento", prontuario.includes("AvisoConsentimentoHistorico"));

console.log(`historico-outros: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
