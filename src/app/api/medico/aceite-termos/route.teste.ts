/**
 * Testes estáticos da rota de aceite do médico (sem banco).
 * Rodar: bun src/app/api/medico/aceite-termos/route.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const rota = ler("src/app/api/medico/aceite-termos/route.ts");
const servidor = ler("src/lib/server/aceite-termos.ts");
const admin = ler("src/app/api/medicos/route.ts");
let ok = 0;
let falhas = 0;
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else { falhas++; console.error(`FALHOU: ${nome}`); }
}
const post = rota.slice(rota.indexOf("export async function POST"));
checa("GET exige papel MEDICO", /export async function GET[\s\S]*?exigirPapel\("MEDICO"\)/.test(rota));
checa("POST confere Origin antes da sessão", post.indexOf("origemPermitida") > -1 && post.indexOf("origemPermitida") < post.indexOf("exigirPapel"));
checa("POST exige papel MEDICO", post.includes('exigirPapel("MEDICO")'));
checa("POST tem limitarAsync por médico", /limitarAsync\(`aceite-termos:medico:\$\{medico\.id\}`/.test(post));
checa("POST valida por perfil MEDICO", post.includes('validarAceiteTermos("MEDICO"'));
checa("usuário vem da sessão (sem id no corpo)", !/body\.(medicoId|userId|id)\b/.test(rota));
checa("grava em transação", /gravarAceiteAtualizacao[\s\S]*?\$transaction/.test(servidor));
checa("auditoria do aceite sem nome", !/gravarAceiteAtualizacao[\s\S]*detalhes:[^\n]*(nome|email)/.test(servidor));
checa("auditoria MEDICO_CRIADO sem nome/CRM", !/MEDICO_CRIADO[\s\S]{0,300}(user\.nome|body\.crm)/.test(admin));
console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
