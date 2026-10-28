/**
 * Testes do aceite de termos do paciente (estáticos + funções puras, sem banco).
 * Rodar: bun src/app/api/paciente/aceite-termos/route.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  URL_POLITICA_PRIVACIDADE,
  URL_TERMOS_POR_PERFIL,
  VERSAO_PRIVACIDADE,
  VERSAO_TERMOS_POR_PERFIL,
  CODIGO_ACEITE_TERMOS_PENDENTE,
  ERRO_ACEITE_TERMOS_PENDENTE,
  aceiteTermosPayload,
  mensagemRecusa,
  CHAVE_RECUSA_TERMOS,
  limparRecusaTermos,
  finalidadePrivacidade,
  finalidadeTermos,
  validarAceiteTermos,
} from "../../../../lib/aceite-termos";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const rotaPaciente = ler("src/app/api/paciente/aceite-termos/route.ts");
const layout = ler("src/app/(bion)/(app)/layout.tsx");
const guarda = ler("src/components/bion/GuardaAceiteTermos.tsx");
const componente = ler("src/components/bion/AceiteTermos.tsx");
const servidor = ler("src/lib/server/aceite-termos.ts");
const consultas = ler("src/app/api/consultas/route.ts");
const renovacoes = ler("src/app/api/renovacoes/route.ts");
const conta = ler("src/app/api/paciente/conta/route.ts");
let ok = 0;
let falhas = 0;
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else { falhas++; console.error(`FALHOU: ${nome}`); }
}
const postDe = (s: string) => s.slice(s.indexOf("export async function POST"));

// Rota
checa("rota do paciente usa o handler genérico com PACIENTE", rotaPaciente.includes('criarRotaAceiteTermos("PACIENTE")'));
checa("rota exporta GET e POST", /export const \{ GET, POST \}/.test(rotaPaciente));

// (1) Uma tela: Termos v1 + Privacidade v1 juntos, com links
checa("versão dos termos do paciente é v1", /^termos-paciente-v1-/.test(VERSAO_TERMOS_POR_PERFIL.PACIENTE ?? ""));
checa("versão da privacidade é v1", /^privacidade-v1-/.test(VERSAO_PRIVACIDADE));
const p = aceiteTermosPayload("PACIENTE");
checa("payload leva as duas versões juntas", p.versaoTermos === VERSAO_TERMOS_POR_PERFIL.PACIENTE && p.versaoPrivacidade === VERSAO_PRIVACIDADE && p.aceito === true);
checa("payload sem marketing no re-aceite", !("marketing" in p) || !p.marketing);
checa("valida o payload atual", validarAceiteTermos("PACIENTE", p).ok);
checa("recusa termos de versão antiga", !validarAceiteTermos("PACIENTE", { ...p, versaoTermos: "termos-paciente-v0" }).ok);
checa("recusa privacidade de versão antiga", !validarAceiteTermos("PACIENTE", { ...p, versaoPrivacidade: "privacidade-v0" }).ok);
checa("recusa sem aceito=true", !validarAceiteTermos("PACIENTE", { ...p, aceito: false }).ok);
checa("links para os dois textos", componente.includes("href={urlTermos}") && componente.includes("href={urlPrivacidade}") && URL_TERMOS_POR_PERFIL.PACIENTE === "/termos-de-uso" && URL_POLITICA_PRIVACIDADE === "/politica-de-privacidade");
checa("guarda do paciente ligada no layout, com recusa", layout.includes('<GuardaAceiteTermos perfil="PACIENTE" permitirRecusa>'));
checa("guarda do médico inalterada (sem recusa)", layout.includes('<GuardaAceiteTermos perfil="MEDICO">'));

// (2) Recusa: modo limitado; servidor bloqueia agendamento novo
checa("guarda tem botão 'Agora não' só com permitirRecusa", /permitirRecusa \? \([\s\S]*?Agora não/.test(guarda));
checa("modo recusado ainda renderiza o app (consultas pagas)", /estado === "recusado"[\s\S]*?\{children\}/.test(guarda));
checa("portão do servidor devolve 403 com código", /exigirAceiteTermosPaciente[\s\S]*?status: 403/.test(servidor) && servidor.includes("CODIGO_ACEITE_TERMOS_PENDENTE"));
checa("portão falha fechado", /catch \{\s*pendente = true;/.test(servidor));
for (const [nome, src] of [["POST /api/consultas", consultas], ["POST /api/renovacoes", renovacoes]] as const) {
  const post = postDe(src);
  const iPortao = post.indexOf("exigirAceiteTermosPaciente(usuario)");
  checa(`${nome} exige o aceite`, iPortao > -1 && post.includes("if (semAceite) return semAceite"));
  checa(`${nome}: portão antes de ler o corpo e de gravar`, iPortao > -1 && iPortao < post.indexOf("req.json") && (post.indexOf("db.") === -1 || iPortao < post.indexOf("db.")));
}
checa("exclusão da conta não depende do aceite", !conta.includes("exigirAceiteTermosPaciente"));
checa("consultas: portão só no POST (agendar)", (consultas.match(/exigirAceiteTermosPaciente\(usuario\)/g) ?? []).length === 1);

// (3) Versão e data/hora gravadas em Consentimento (sem migração)
checa("finalidade dos termos carrega a versão", finalidadeTermos(p.versaoTermos).includes(p.versaoTermos));
checa("finalidade da privacidade carrega a versão", finalidadePrivacidade(p.versaoPrivacidade).includes(p.versaoPrivacidade));
checa("grava em consentimento com createdAt", /consentimento\.create[\s\S]*?createdAt: true/.test(servidor));
checa("grava termos e privacidade na mesma transação", /gravarAceiteAtualizacao[\s\S]*?\$transaction[\s\S]*?fT[\s\S]*?fP/.test(servidor));

// Texto fixo do bloqueio (servidor + telas)
const TEXTO = "Para pedir uma nova consulta ou renovação, aceite os termos atualizados.";
checa("texto do 403 é exatamente o combinado", ERRO_ACEITE_TERMOS_PENDENTE === TEXTO);
checa("servidor usa a constante compartilhada", servidor.includes("erro: ERRO_ACEITE_TERMOS_PENDENTE, codigo: CODIGO_ACEITE_TERMOS_PENDENTE") && !/Para agendar, aceite/.test(servidor));
checa("mensagemRecusa: código → texto fixo", mensagemRecusa({ codigo: CODIGO_ACEITE_TERMOS_PENDENTE, erro: "x" }, "padrão") === TEXTO);
checa("mensagemRecusa: outro erro mantém o do servidor", mensagemRecusa({ erro: "Horário ocupado." }, "padrão") === "Horário ocupado.");
checa("mensagemRecusa: sem erro → padrão", mensagemRecusa(null, "padrão") === "padrão");
const chat = ler("src/components/bion/paciente/ChatBion.tsx");
checa("chat de agendamento mostra o texto fixo no 403 de termos", /recusa\?\.termos\)[\s\S]{0,250}texto: ERRO_ACEITE_TERMOS_PENDENTE/.test(chat) && chat.includes("json.codigo === CODIGO_ACEITE_TERMOS_PENDENTE"));
checa("agendamento pelo store usa mensagemRecusa", ler("src/lib/bion-store.tsx").includes("mensagemRecusa(json"));
checa("pedido de renovação usa mensagemRecusa", ler("src/components/bion/paciente/usePedidosRenovacao.ts").includes("mensagemRecusa(j,"));
checa("faixa do modo limitado usa o texto fixo", guarda.includes("{ERRO_ACEITE_TERMOS_PENDENTE}"));

// Recusa ("Agora não") limpa no logout e após o aceite
checa("chave da recusa", CHAVE_RECUSA_TERMOS === "bion:aceite-termos:recusado");
{
  const mem = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  const antes = g.window;
  g.window = { sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } };
  mem.set(CHAVE_RECUSA_TERMOS, "1");
  limparRecusaTermos();
  checa("limparRecusaTermos apaga a chave", !mem.has(CHAVE_RECUSA_TERMOS));
  g.window = antes;
  let semErro = true;
  try { limparRecusaTermos(); } catch { semErro = false; }
  checa("limparRecusaTermos sem window não quebra", semErro);
}
const store = ler("src/lib/bion-store.tsx");
checa("sair() limpa a recusa", /const sair = useCallback\(async \(\) => \{[\s\S]{0,200}limparRecusaTermos\(\)/.test(store));
checa("aceite registrado limpa a recusa", /method: "POST"[\s\S]*?if \(!json\?\.pendente\) limparRecusaTermos\(\)/.test(guarda));
checa("GET sem pendência limpa a recusa", /if \(!json\.pendente\) \{\s*limparRecusaTermos\(\);/.test(guarda));

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
