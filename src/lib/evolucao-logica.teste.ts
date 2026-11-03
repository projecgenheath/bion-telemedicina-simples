/**
 * Testes das correções O1/O2/O3 da auditoria de melhorias da área médica:
 * predicados puros da evolução (O3) + guardas estáticas da fiação
 * (O1: confirmação do modelo; O2: fim do truncamento do resumo).
 * Rodar: bun src/lib/evolucao-logica.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { condutaPreenchida, evolucaoIniciada, evolucaoImpedeConclusao, type EvolucaoConteudo } from "./evolucao-logica";
import { LIMITE_RESUMO_MEDICO } from "./resumo-medico";

let ok = 0, falhas = 0;
function igual(nome: string, a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) ok++; else { falhas++; console.error(`✗ ${nome}\n   obtido:   ${x}\n   esperado: ${y}`); }
}
function checa(nome: string, cond: boolean) {
  if (cond) ok++; else { falhas++; console.error(`FALHOU: ${nome}`); }
}

// ── condutaPreenchida (a definição ÚNICA, usada nas duas rotas) ──
igual("conduta null", condutaPreenchida(null), false);
igual("conduta undefined", condutaPreenchida(undefined), false);
igual("conduta casco {}", condutaPreenchida("{}"), false);
igual("conduta texto vazio", condutaPreenchida('{"texto":""}'), false);
igual("conduta texto só espaços", condutaPreenchida('{"texto":"   "}'), false);
igual("conduta preenchida", condutaPreenchida('{"texto":"Repouso e retorno em 7 dias"}'), true);
igual("conduta string solta", condutaPreenchida('"Repouso"'), true);
igual("conduta outro campo texto", condutaPreenchida('{"resumo":"Alta"}'), true);
igual("conduta texto numérico não conta", condutaPreenchida('{"texto":123}'), false);
igual("conduta JSON inválido", condutaPreenchida("não é json"), false);

// ── evolucaoIniciada: casco automático ≠ evolução começada ──
const casco: EvolucaoConteudo = { dados: "{}", triagem: "{}", exames: "{}", medicamentos: "{}", conduta: "{}", cid: null, documentos: "[]" };
igual("casco intocado não é iniciada", evolucaoIniciada(casco), false);
igual("seções {texto:''} (abriu e apagou) não é iniciada", evolucaoIniciada({ ...casco, dados: '{"texto":""}', conduta: '{"texto":""}' }), false);
igual("dados com texto é iniciada", evolucaoIniciada({ ...casco, dados: '{"texto":"Dor há 3 dias"}' }), true);
igual("só CID é iniciada", evolucaoIniciada({ ...casco, cid: "J06.9" }), true);
igual("CID vazio não é iniciada", evolucaoIniciada({ ...casco, cid: "  " }), false);
igual("documento anexado é iniciada", evolucaoIniciada({ ...casco, documentos: '[{"id":"a1"}]' }), true);
igual("só conduta é iniciada", evolucaoIniciada({ ...casco, conduta: '{"texto":"Repouso"}' }), true);

// ── evolucaoImpedeConclusao: os cenários do O3 ──
igual("sem impedimento: casco em rascunho (fluxo do resumo lateral)", evolucaoImpedeConclusao({ ...casco, status: "rascunho" }), false);
igual("impede: iniciou (dados) e conduta vazia", evolucaoImpedeConclusao({ ...casco, status: "rascunho", dados: '{"texto":"Dor"}' }), true);
igual("impede: iniciou (CID) e conduta vazia", evolucaoImpedeConclusao({ ...casco, status: "rascunho", cid: "J06.9" }), true);
igual("não impede: conduta preenchida", evolucaoImpedeConclusao({ ...casco, status: "rascunho", dados: '{"texto":"Dor"}', conduta: '{"texto":"Repouso"}' }), false);
igual("não impede: já concluída", evolucaoImpedeConclusao({ ...casco, status: "concluida", dados: '{"texto":"Dor"}' }), false);

// ── O2: o teto do resumo ──
igual("teto do resumo é 10.000", LIMITE_RESUMO_MEDICO, 10_000);

// ── Guardas estáticas da fiação ──
const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const rotaConsultas = ler("src/app/api/consultas/[id]/route.ts");
const rotaConcluirEvolucao = ler("src/app/api/medico/consultas/[id]/evolucao/concluir/route.ts");
const painelLateral = ler("src/components/bion/consulta/PainelLateral.tsx");
const hookSala = ler("src/components/bion/consulta/useSalaConsulta.ts");
const telaSala = ler("src/components/bion/consulta/SalaConsultaTela.tsx");

checa("O2: rota NÃO trunca mais o resumo em 300", !rotaConsultas.includes("textoDoCorpo(body.resumo)?.slice(0, 300)"));
checa("O2: rota valida o resumo pelo LIMITE_RESUMO_MEDICO", rotaConsultas.includes("resumoConclusao.length > LIMITE_RESUMO_MEDICO"));
checa("O2: textarea usa o mesmo teto (maxLength)", painelLateral.includes("maxLength={LIMITE_RESUMO_MEDICO}"));
checa("O3: rota de consultas usa o portão evolucaoImpedeConclusao", rotaConsultas.includes("evolucaoImpedeConclusao(evAtual)") && rotaConsultas.includes("evolucaoImpedeConclusao(rascunho)"));
checa("O3: portão responde 409 com a mensagem padrão", rotaConsultas.includes("ERRO_EVOLUCAO_SEM_CONDUTA") && rotaConsultas.includes("evolucaoSemConduta: true"));
checa("O3: concluir evolução importa a definição única de conduta", rotaConcluirEvolucao.includes('from "@/lib/evolucao-logica"') && !rotaConcluirEvolucao.includes("function condutaPreenchida"));
checa("O1: hook só pede confirmação com texto digitado", hookSala.includes("if (anotacoes.trim())") && hookSala.includes("setConfirmarModeloResumo(true)"));
checa("O1: tela da sala renderiza a confirmação do modelo", telaSala.includes("sala.confirmarModeloResumo") && telaSala.includes("Substituir pelo modelo"));

console.log(`evolucao-logica: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
