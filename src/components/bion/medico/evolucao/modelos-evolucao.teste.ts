/**
 * Testes dos modelos pessoais de evolução e do "usar como base"
 * (item 16 da auditoria de melhorias da área médica): mescla
 * conservadora, fonte do histórico (só conduta + CID) e persistência
 * local validada. Rodar: bun src/components/bion/medico/evolucao/modelos-evolucao.teste.ts
 */
import { readFileSync } from "node:fs";
import {
  CHAVE_MODELOS_EVOLUCAO,
  LIMITE_MODELOS,
  adicionarModelo,
  fonteDoHistorico,
  lerModelos,
  mesclarConteudo,
  novoModelo,
  removerModelo,
  temConteudo,
  textosVazios,
  type ConteudoEvolucao,
  type ModeloEvolucao,
} from "./modelos-evolucao";

let ok = 0, falhas = 0;
function igual(nome: string, a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) ok++; else { falhas++; console.error(`✗ ${nome}\n   obtido:   ${x}\n   esperado: ${y}`); }
}
function checa(nome: string, cond: boolean) {
  if (cond) ok++; else { falhas++; console.error(`FALHOU: ${nome}`); }
}

const vazio: ConteudoEvolucao = { textos: textosVazios(), cid: "" };
const comConduta: ConteudoEvolucao = {
  textos: { ...textosVazios(), conduta: "Repouso e retorno em 7 dias" },
  cid: "J06.9",
};

// ── temConteudo ──
igual("vazio não tem conteúdo", temConteudo(vazio), false);
igual("só espaços não é conteúdo", temConteudo({ textos: { ...textosVazios(), dados: "   " }, cid: " " }), false);
igual("conduta é conteúdo", temConteudo(comConduta), true);
igual("só CID é conteúdo", temConteudo({ textos: textosVazios(), cid: "A90" }), true);

// ── mesclarConteudo: fonte vazia nunca apaga ──
{
  const r = mesclarConteudo(comConduta, { textos: {}, cid: null });
  igual("fonte vazia não aplica", r.aplicou, false);
  igual("fonte vazia não sobrescreve", r.sobrescreveu, false);
  igual("fonte vazia preserva o destino", r.resultado, comConduta);
}
{
  const r = mesclarConteudo(comConduta, { textos: { conduta: "  " }, cid: "" });
  igual("fonte só com espaços não aplica", r.aplicou, false);
  igual("fonte só com espaços preserva", r.resultado, comConduta);
}
// ── mesclarConteudo: preencher destino vazio não é sobrescrita ──
{
  const r = mesclarConteudo(vazio, { textos: { conduta: "Dipirona 1g" }, cid: "R51" });
  igual("preencher vazio aplica", r.aplicou, true);
  igual("preencher vazio não sobrescreve", r.sobrescreveu, false);
  igual("conduta copiada", r.resultado.textos.conduta, "Dipirona 1g");
  igual("cid copiado", r.resultado.cid, "R51");
  igual("demais seções intactas", r.resultado.textos.dados, "");
}
// ── mesclarConteudo: substituir texto diferente É sobrescrita ──
{
  const r = mesclarConteudo(comConduta, { textos: { conduta: "Outra conduta" } });
  igual("trocar conduta sobrescreve", r.sobrescreveu, true);
  igual("conduta trocada", r.resultado.textos.conduta, "Outra conduta");
  igual("CID fora da fonte fica", r.resultado.cid, "J06.9");
}
{
  const r = mesclarConteudo(comConduta, { textos: { conduta: "Repouso e retorno em 7 dias" }, cid: "J06.9" });
  igual("fonte idêntica aplica sem sobrescrever", r.aplicou && !r.sobrescreveu, true);
}
{
  const atual: ConteudoEvolucao = { textos: { ...textosVazios(), dados: "Dor há 2 dias" }, cid: "" };
  const r = mesclarConteudo(atual, { textos: { conduta: "Conduta X" } });
  igual("seção fora da fonte não muda", r.resultado.textos.dados, "Dor há 2 dias");
  igual("preencher outra seção não sobrescreve", r.sobrescreveu, false);
}

// ── fonteDoHistorico: o payload só tem conduta + CID ──
igual("sem evolução anterior", fonteDoHistorico({ evolucao: null }), null);
igual("conduta vazia e sem CID", fonteDoHistorico({ evolucao: { conduta: { texto: " " }, cid: null } }), null);
igual(
  "conduta + CID viram fonte",
  fonteDoHistorico({ evolucao: { conduta: { texto: "Alta com retorno" }, cid: "J06.9" } }),
  { textos: { conduta: "Alta com retorno" }, cid: "J06.9" },
);
igual(
  "só CID vira fonte sem textos",
  fonteDoHistorico({ evolucao: { conduta: { texto: "" }, cid: "A90" } }),
  { textos: {}, cid: "A90" },
);
igual(
  "conduta em formato inesperado não vira fonte",
  fonteDoHistorico({ evolucao: { conduta: { texto: 42 }, cid: null } }),
  null,
);

// ── novoModelo ──
igual("nome vazio não vira modelo", novoModelo("  ", comConduta), null);
igual("evolução vazia não vira modelo", novoModelo("IVAS", vazio), null);
{
  const m = novoModelo("  IVAS — retorno  ", comConduta, new Date("2026-10-30T12:00:00.000Z"));
  checa("modelo criado", m !== null);
  igual("nome aparado", m?.nome, "IVAS — retorno");
  igual("textos copiados", m?.textos.conduta, "Repouso e retorno em 7 dias");
  igual("criadoEm do relógio injetado", m?.criadoEm, "2026-10-30T12:00:00.000Z");
}

// ── lerModelos: armazenamento não confiável ──
igual("nada guardado", lerModelos(null), []);
igual("JSON inválido", lerModelos("{ops"), []);
igual("JSON que não é lista", lerModelos("{}"), []);
{
  const bom: ModeloEvolucao = {
    id: "m1", nome: "IVAS", textos: { ...textosVazios(), conduta: "X" }, cid: "", criadoEm: "2026-10-30T12:00:00.000Z",
  };
  const sujo = JSON.stringify([bom, { id: 7 }, null, { ...bom, id: "m2", textos: { conduta: "sem as outras seções" } }]);
  const lidos = lerModelos(sujo);
  igual("só o modelo válido sobrevive", lidos.map((m) => m.id), ["m1"]);
}
{
  const muitos = Array.from({ length: LIMITE_MODELOS + 5 }, (_, i) => ({
    id: `m${i}`, nome: `M${i}`, textos: textosVazios(), cid: "", criadoEm: "2026-10-30T12:00:00.000Z",
  }));
  igual("leitura corta no teto", lerModelos(JSON.stringify(muitos)).length, LIMITE_MODELOS);
}

// ── adicionar / remover ──
{
  const base: ModeloEvolucao[] = [
    { id: "a", nome: "A", textos: textosVazios(), cid: "", criadoEm: "2026-10-29T12:00:00.000Z" },
  ];
  const novo: ModeloEvolucao = { id: "b", nome: "B", textos: textosVazios(), cid: "", criadoEm: "2026-10-30T12:00:00.000Z" };
  igual("novo entra na frente", adicionarModelo(base, novo).map((m) => m.id), ["b", "a"]);
  igual("remover por id", removerModelo(adicionarModelo(base, novo), "a").map((m) => m.id), ["b"]);
  igual("chave de armazenamento versionada", CHAVE_MODELOS_EVOLUCAO, "bion:modelos-evolucao:v1");
}

// ── Guardas estáticas da fiação no painel ──
const painel = readFileSync(new URL("./PainelEvolucao.tsx", import.meta.url), "utf8");
checa("painel usa a mescla única para base e modelos", painel.includes("mesclarConteudo"));
checa("painel extrai a base do histórico", painel.includes("fonteDoHistorico"));
checa("painel confirma antes de sobrescrever", painel.includes("sobrescreveu") && painel.includes("window.confirm"));
checa("painel NÃO oferece base de outro médico", painel.includes("!h.deOutroMedico"));
checa("painel avisa que o modelo fica neste aparelho", painel.includes("neste aparelho"));
checa("aplicar passa pelo autosave existente (mesmo debounce de 1,2 s)", painel.includes("timer.current = setTimeout(() => void salvar(t, c), 1200)"));

console.log(`modelos-evolucao: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
