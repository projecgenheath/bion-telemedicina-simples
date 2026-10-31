/**
 * Testes do item 27 (sala unificada): autossalvamento do resumo da sala.
 * O resumo lateral (Consulta.resumoMedico) e a evolução estruturada
 * (Evolucao) têm destinos DIFERENTES — os campos não se unificam; o que
 * se garante aqui é a fiação do autosave: ação dedicada no servidor que
 * grava SÓ o resumo (sem mudar status, sem passar pelo portão O3, com o
 * teto O2), debounce + hidratação no hook, indicador no painel e saída
 * que só avisa quando há texto genuinamente não salvo.
 * Rodar: bun src/lib/resumo-medico.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { LIMITE_RESUMO_MEDICO } from "./resumo-medico";

let ok = 0, falhas = 0;
function checa(nome: string, cond: boolean) {
  if (cond) ok++; else { falhas++; console.error(`FALHOU: ${nome}`); }
}

const raiz = process.cwd();
const le = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const rota = le("src/app/api/consultas/[id]/route.ts");
const hookSala = le("src/components/bion/consulta/useSalaConsulta.ts");
const painel = le("src/components/bion/consulta/PainelLateral.tsx");
const chamada = le("src/components/bion/medico/ChamadaMedico.tsx");

// ── Servidor: a ação salvarResumo existe e é um rascunho puro ──
checa("rota tem a ação salvarResumo", rota.includes('body.acao === "salvarResumo"'));
const ini = rota.indexOf('body.acao === "salvarResumo"');
const fim = rota.indexOf("const data:", ini);
const ramo = ini >= 0 && fim > ini ? rota.slice(ini, fim) : "";
checa("ramo salvarResumo foi isolado para inspeção", ramo.length > 0);
checa("salvarResumo grava só o resumoMedico", ramo.includes("resumoMedico: textoResumo"));
checa("salvarResumo NÃO muda status", !ramo.includes("data.status") && !ramo.includes("status: \"concluida\""));
checa("salvarResumo NÃO passa pelo portão O3", !ramo.includes("evolucaoImpedeConclusao"));
checa("salvarResumo valida o teto O2 (400, sem truncar)", ramo.includes("textoResumo.length > LIMITE_RESUMO_MEDICO"));
checa("salvarResumo recusa consulta encerrada (409)", ramo.includes("status: 409"));
checa("salvarResumo é só do médico dono", ramo.includes("!ehDonoMedico"));

// ── Hook: debounce de 1,2 s, hidratação e baseline do que já salvou ──
checa("hook chama a ação salvarResumo", hookSala.includes('acao: "salvarResumo"'));
checa("hook usa debounce de 1200 ms (ritmo do PainelEvolucao)", hookSala.includes(", 1200)"));
checa("hook hidrata o resumo salvo ao abrir a sala", hookSala.includes("consultaAtual.resumoMedico"));
checa("hook mantém a baseline do último texto salvo", hookSala.includes("ultimoResumoSalvoRef"));
checa("hook expõe o estado do salvamento", hookSala.includes("resumoStatus") && hookSala.includes("resumoPendente"));
checa("hook expõe o retry do salvamento", hookSala.includes("tentarSalvarResumoDeNovo"));

// ── Saída honesta: modal de perda só com texto não salvo ──
checa("sair consulta o resumoPendente", chamada.includes("sala.resumoPendente"));
checa("sair NÃO usa mais 'tem qualquer anotação' como critério", !chamada.includes("if (anotacoes.trim())"));
checa("concluir continua enviando o resumo atual", chamada.includes('body: JSON.stringify({ acao: "concluir", resumo: anotacoes })'));

// ── Painel: rótulo do destino + indicador de salvamento + teto O2 ──
checa("painel rotula o campo como Resumo da consulta", painel.includes("Resumo da consulta"));
checa("painel explica que a evolução estruturada é outro painel", painel.includes("evolução estruturada"));
checa("painel mostra Salvando…", painel.includes("Salvando…"));
checa("painel mostra Não salvou com retry", painel.includes("Não salvou") && painel.includes("Tentar de novo"));
checa("painel mantém o teto O2 no textarea", painel.includes("maxLength={LIMITE_RESUMO_MEDICO}"));
checa("o teto continua sendo 10.000", LIMITE_RESUMO_MEDICO === 10_000);

console.log(`resumo-medico: ${ok} ok, ${falhas} falhas`);
if (falhas > 0) process.exit(1);
