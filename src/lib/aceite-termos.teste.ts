/**
 * Testes da validação do aceite dos termos no cadastro.
 * Rodar: bun src/lib/aceite-termos.teste.ts
 */
import {
  aceiteTermosPayload,
  ERRO_ACEITE_TERMOS,
  ERRO_VERSAO_TERMOS,
  finalidadeMarketing,
  finalidadePrivacidade,
  finalidadeTermos,
  marketingAtivo,
  ERRO_VERSAO_MARKETING,
  ERRO_TERMOS_PERFIL_INDEFINIDO,
  type PerfilAceite,
  VERSAO_MARKETING_OPTIN,
  validarAceiteTermos,
  VERSAO_PRIVACIDADE,
  VERSAO_TERMOS_PACIENTE,
  VERSAO_TERMOS_MEDICO,
  VERSAO_TERMOS_POR_PERFIL,
  URL_TERMOS_POR_PERFIL,
  URL_POLITICA_PRIVACIDADE,
  aceitePendente,
} from "./aceite-termos";
import { origemConfere } from "./server/origem";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU: ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}
const erro2 = (p: PerfilAceite, v: unknown) => { const r = validarAceiteTermos(p, v); return r.ok ? null : r.erro; };
const erro = (v: unknown) => { const r = validarAceiteTermos("PACIENTE", v); return r.ok ? null : r.erro; };

igual("sem aceite", erro(undefined), ERRO_ACEITE_TERMOS);
igual("null", erro(null), ERRO_ACEITE_TERMOS);
igual("string", erro("sim"), ERRO_ACEITE_TERMOS);
igual("aceito false", erro({ aceito: false, versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_ACEITE_TERMOS);
igual("aceito 'true' string", erro({ aceito: "true", versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_ACEITE_TERMOS);
igual("sem versões", erro({ aceito: true }), ERRO_ACEITE_TERMOS);
igual("sem versão privacidade", erro({ aceito: true, versaoTermos: VERSAO_TERMOS_PACIENTE }), ERRO_ACEITE_TERMOS);
igual("versão termos antiga", erro({ aceito: true, versaoTermos: "termos-paciente-v-1", versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_VERSAO_TERMOS);
igual("versão privacidade errada", erro({ aceito: true, versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: "x" }), ERRO_VERSAO_TERMOS);
igual("payload padrão válido, sem marketing", validarAceiteTermos("PACIENTE", aceiteTermosPayload("PACIENTE")), { ok: true, valor: { versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE, marketing: false } });
igual("com marketing", validarAceiteTermos("PACIENTE", aceiteTermosPayload("PACIENTE", true)), { ok: true, valor: { versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE, marketing: true } });
igual("marketing versão errada", erro({ ...aceiteTermosPayload("PACIENTE"), marketing: { aceito: true, versao: "x" } }), ERRO_VERSAO_MARKETING);
igual("marketing false = não", validarAceiteTermos("PACIENTE", { ...aceiteTermosPayload("PACIENTE"), marketing: { aceito: false, versao: "x" } }).ok && (validarAceiteTermos("PACIENTE", { ...aceiteTermosPayload("PACIENTE"), marketing: { aceito: false } }) as { valor: { marketing: boolean } }).valor.marketing, false);
igual("marketing sem termos não passa", erro({ marketing: { aceito: true, versao: VERSAO_MARKETING_OPTIN } }), ERRO_ACEITE_TERMOS);
igual("estado marketing", [marketingAtivo(null), marketingAtivo({ aceito: true }), marketingAtivo({ aceito: false })], [false, true, false]);
igual("finalidade marketing", [finalidadeMarketing(true).includes("aceito"), finalidadeMarketing(false).includes("revogado"), finalidadeMarketing(true).includes(VERSAO_MARKETING_OPTIN)], [true, true, true]);
igual("ignora campos extras", validarAceiteTermos("PACIENTE", { ...aceiteTermosPayload("PACIENTE"), nome: "X" }).ok, true);
// Médico (termos-medico-v2-2026-10-28)
igual("versão do médico", VERSAO_TERMOS_POR_PERFIL.MEDICO, "termos-medico-v2-2026-10-28");
igual("payload do médico válido", validarAceiteTermos("MEDICO", aceiteTermosPayload("MEDICO")), { ok: true, valor: { versaoTermos: VERSAO_TERMOS_MEDICO, versaoPrivacidade: VERSAO_PRIVACIDADE, marketing: false } });
igual("médico com termos do paciente é recusado", erro2("MEDICO", aceiteTermosPayload("PACIENTE")), ERRO_VERSAO_TERMOS);
igual("paciente com termos do médico é recusado", erro2("PACIENTE", aceiteTermosPayload("MEDICO")), ERRO_VERSAO_TERMOS);
igual("médico sem aceite é recusado", erro2("MEDICO", { aceito: false, versaoTermos: VERSAO_TERMOS_MEDICO, versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_ACEITE_TERMOS);
igual("perfil sem termos continua recusado", (() => { const o = VERSAO_TERMOS_POR_PERFIL.MEDICO; (VERSAO_TERMOS_POR_PERFIL as Record<PerfilAceite, string | null>).MEDICO = null; const r = erro2("MEDICO", aceiteTermosPayload("PACIENTE")); (VERSAO_TERMOS_POR_PERFIL as Record<PerfilAceite, string | null>).MEDICO = o; return r; })(), ERRO_TERMOS_PERFIL_INDEFINIDO);
const fTM = finalidadeTermos(VERSAO_TERMOS_MEDICO);
const fP = finalidadePrivacidade(VERSAO_PRIVACIDADE);
igual("pendente sem nada", aceitePendente("MEDICO", []), true);
igual("pendente só termos", aceitePendente("MEDICO", [fTM]), true);
igual("pendente só privacidade", aceitePendente("MEDICO", [fP]), true);
igual("pendente com termos antigos", aceitePendente("MEDICO", [finalidadeTermos("termos-medico-v-1"), fP]), true);
igual("pendente com termos do paciente", aceitePendente("MEDICO", [finalidadeTermos(VERSAO_TERMOS_PACIENTE), fP]), true);
igual("não pendente com os dois", aceitePendente("MEDICO", [fTM, fP]), false);
igual("links do médico", [URL_TERMOS_POR_PERFIL.MEDICO, URL_POLITICA_PRIVACIDADE], ["/termos-medico", "/politica-de-privacidade"]);
igual("origem igual", origemConfere("https://bion.app", "bion.app"), true);
igual("origem com porta", origemConfere("http://localhost:3000/x", "localhost:3000"), true);
igual("origem diferente", origemConfere("https://mal.com", "bion.app"), false);
igual("sem origem", origemConfere(null, "bion.app"), false);
igual("origem inválida", origemConfere("lixo", "bion.app"), false);
igual("versões fixas", [VERSAO_TERMOS_PACIENTE, VERSAO_PRIVACIDADE, VERSAO_MARKETING_OPTIN], ["termos-paciente-v2-2026-10-28", "privacidade-v2-2026-10-28", "marketing-optin-v0-2026-10-21"]);
igual("finalidades com versão", finalidadeTermos(VERSAO_TERMOS_PACIENTE).includes(VERSAO_TERMOS_PACIENTE) && finalidadePrivacidade(VERSAO_PRIVACIDADE).includes(VERSAO_PRIVACIDADE), true);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
