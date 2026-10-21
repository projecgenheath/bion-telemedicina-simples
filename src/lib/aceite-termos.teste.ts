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
  VERSAO_MARKETING_OPTIN,
  validarAceiteTermos,
  VERSAO_PRIVACIDADE,
  VERSAO_TERMOS_PACIENTE,
} from "./aceite-termos";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU: ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}
const erro = (v: unknown) => { const r = validarAceiteTermos(v); return r.ok ? null : r.erro; };

igual("sem aceite", erro(undefined), ERRO_ACEITE_TERMOS);
igual("null", erro(null), ERRO_ACEITE_TERMOS);
igual("string", erro("sim"), ERRO_ACEITE_TERMOS);
igual("aceito false", erro({ aceito: false, versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_ACEITE_TERMOS);
igual("aceito 'true' string", erro({ aceito: "true", versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_ACEITE_TERMOS);
igual("sem versões", erro({ aceito: true }), ERRO_ACEITE_TERMOS);
igual("sem versão privacidade", erro({ aceito: true, versaoTermos: VERSAO_TERMOS_PACIENTE }), ERRO_ACEITE_TERMOS);
igual("versão termos antiga", erro({ aceito: true, versaoTermos: "termos-paciente-v-1", versaoPrivacidade: VERSAO_PRIVACIDADE }), ERRO_VERSAO_TERMOS);
igual("versão privacidade errada", erro({ aceito: true, versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: "x" }), ERRO_VERSAO_TERMOS);
igual("payload padrão válido, sem marketing", validarAceiteTermos(aceiteTermosPayload()), { ok: true, valor: { versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE, marketing: false } });
igual("com marketing", validarAceiteTermos(aceiteTermosPayload(true)), { ok: true, valor: { versaoTermos: VERSAO_TERMOS_PACIENTE, versaoPrivacidade: VERSAO_PRIVACIDADE, marketing: true } });
igual("marketing versão errada", erro({ ...aceiteTermosPayload(), marketing: { aceito: true, versao: "x" } }), ERRO_VERSAO_MARKETING);
igual("marketing false = não", validarAceiteTermos({ ...aceiteTermosPayload(), marketing: { aceito: false, versao: "x" } }).ok && (validarAceiteTermos({ ...aceiteTermosPayload(), marketing: { aceito: false } }) as { valor: { marketing: boolean } }).valor.marketing, false);
igual("marketing sem termos não passa", erro({ marketing: { aceito: true, versao: VERSAO_MARKETING_OPTIN } }), ERRO_ACEITE_TERMOS);
igual("estado marketing", [marketingAtivo(null), marketingAtivo({ aceito: true }), marketingAtivo({ aceito: false })], [false, true, false]);
igual("finalidade marketing", [finalidadeMarketing(true).includes("aceito"), finalidadeMarketing(false).includes("revogado"), finalidadeMarketing(true).includes(VERSAO_MARKETING_OPTIN)], [true, true, true]);
igual("ignora campos extras", validarAceiteTermos({ ...aceiteTermosPayload(), nome: "X" }).ok, true);
igual("termos do médico exigem versão própria", validarAceiteTermos(aceiteTermosPayload(), "termos-medico-v0").ok, false);
igual("versões fixas", [VERSAO_TERMOS_PACIENTE, VERSAO_PRIVACIDADE, VERSAO_MARKETING_OPTIN], ["termos-paciente-v0-2026-10-20", "privacidade-v0-2026-10-20", "marketing-optin-v0-2026-10-21"]);
igual("finalidades com versão", finalidadeTermos(VERSAO_TERMOS_PACIENTE).includes(VERSAO_TERMOS_PACIENTE) && finalidadePrivacidade(VERSAO_PRIVACIDADE).includes(VERSAO_PRIVACIDADE), true);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
