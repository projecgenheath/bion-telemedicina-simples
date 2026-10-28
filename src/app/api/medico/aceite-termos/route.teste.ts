/**
 * Testes estáticos da rota de aceite do médico (sem banco).
 * Rodar: bun src/app/api/medico/aceite-termos/route.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const rotaMedico = ler("src/app/api/medico/aceite-termos/route.ts");
const rota = ler("src/lib/server/rota-aceite-termos.ts");
const guarda = ler("src/components/bion/GuardaAceiteTermos.tsx");
const servidor = ler("src/lib/server/aceite-termos.ts");
const admin = ler("src/app/api/medicos/route.ts");
let ok = 0;
let falhas = 0;
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else { falhas++; console.error(`FALHOU: ${nome}`); }
}
const post = rota.slice(rota.indexOf("async function POST"));
checa("rota do médico usa o handler genérico com MEDICO", rotaMedico.includes('criarRotaAceiteTermos("MEDICO")'));
checa("GET exige o papel do perfil", /async function GET[\s\S]*?exigirPapel\(perfil\)/.test(rota));
checa("versão lida de VERSAO_TERMOS_POR_PERFIL[perfil]", rota.includes("VERSAO_TERMOS_POR_PERFIL[perfil]"));
checa("guarda genérica por perfil", guarda.includes("aceiteTermosPayload(perfil)") && guarda.includes("perfil={perfil}"));
checa("rota do médico continua só MEDICO", !/criarRotaAceiteTermos\("PACIENTE"\)/.test(rotaMedico));
checa("guarda do médico segue sem recusa (bloqueio total)", /<GuardaAceiteTermos perfil="MEDICO">/.test(ler("src/app/(bion)/(app)/layout.tsx")) && !/perfil="MEDICO"[^>]*permitirRecusa/.test(ler("src/app/(bion)/(app)/layout.tsx")));
checa("POST confere Origin antes da sessão", post.indexOf("origemPermitida") > -1 && post.indexOf("origemPermitida") < post.indexOf("exigirPapel"));
checa("POST exige o papel do perfil", post.includes("exigirPapel(perfil)"));
checa("POST tem limitarAsync por médico", /limitarAsync\(`aceite-termos:\$\{perfil\.toLowerCase\(\)\}:\$\{usuario\.id\}`/.test(post));
checa("POST valida pelo perfil", post.includes("validarAceiteTermos(perfil, body)"));
checa("usuário vem da sessão (sem id no corpo)", !/body\.(medicoId|userId|id)\b/.test(rota));
checa("grava em transação", /gravarAceiteAtualizacao[\s\S]*?\$transaction/.test(servidor));
checa("auditoria do aceite sem nome", !/gravarAceiteAtualizacao[\s\S]*detalhes:[^\n]*(nome|email)/.test(servidor));
checa("auditoria MEDICO_CRIADO sem nome/CRM", !/MEDICO_CRIADO[\s\S]{0,300}(user\.nome|body\.crm)/.test(admin));
console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
