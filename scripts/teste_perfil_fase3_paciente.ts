/**
 * Fase 3 do redesign do paciente — testes puros + regressões no código.
 * Rodar: bun scripts/teste_perfil_fase3_paciente.ts
 *
 *  1. contagemConsulta(): textos da contagem regressiva (fuso de São Paulo);
 *  2. rotuloHistorico(): nenhuma consulta pendente aparece como "Confirmada";
 *  3. Regressões lidas dos arquivos do paciente (botão Pular da triagem,
 *     Documentos só com consultas realizadas, impressora imprime, tema lido
 *     do <html>, janelas sem fundo preto fixo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contagemConsulta, intervaloContagem } from "../src/components/bion/paciente/contagem-consulta";
import { rotuloHistorico } from "../src/components/bion/paciente/etiqueta-consulta";

let falhas = 0;
let total = 0;
const conferir = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}: ${JSON.stringify(obtido)}${ok ? "" : ` (esperado ${JSON.stringify(esperado)})`}`);
};

/* 1. contagem regressiva ------------------------------------------------ */
const SP = (iso: string) => Date.parse(`${iso}-03:00`);
const agora = SP("2026-10-05T10:00:00");
const c = (iso: string) => contagemConsulta(SP(iso), agora).texto;
conferir("começa em 12 min", c("2026-10-05T10:12:00"), "Começa em 12 min");
conferir("menos de 1 min arredonda para 1", c("2026-10-05T10:00:20"), "Começa em 1 min");
conferir("hoje, em 1 h 30 min", c("2026-10-05T11:30:00"), "Hoje, em 1 h 30 min");
conferir("hoje, em 6 h (sem minutos)", c("2026-10-05T16:10:00"), "Hoje, em 6 h");
conferir("amanhã de madrugada (dia de calendário SP)", c("2026-10-06T01:00:00"), "Amanhã");
conferir("em 2 dias", c("2026-10-07T09:00:00"), "Em 2 dias");
conferir("23:30 de hoje vista às 22:00 → hoje", contagemConsulta(SP("2026-10-05T23:30:00"), SP("2026-10-05T22:00:00")).texto, "Hoje, em 1 h 30 min");
conferir("00:30 de amanhã vista às 23:00 → amanhã", contagemConsulta(SP("2026-10-06T00:30:00"), SP("2026-10-05T23:00:00")).texto, "Amanhã");
conferir("já começou", contagemConsulta(SP("2026-10-05T09:50:00"), agora), { texto: "Acontecendo agora", urgente: true, agora: true });
conferir("urgente só com menos de 1 h", [contagemConsulta(SP("2026-10-05T10:59:00"), agora).urgente, contagemConsulta(SP("2026-10-05T11:01:00"), agora).urgente], [true, false]);
conferir("atualiza a cada 15 s perto da consulta", intervaloContagem(SP("2026-10-05T11:00:00"), agora), 15_000);
conferir("atualiza a cada 60 s longe da consulta", intervaloContagem(SP("2026-10-07T11:00:00"), agora), 60_000);

/* 2. rótulo do histórico ------------------------------------------------ */
const r = (status: string, pago?: boolean) => rotuloHistorico(status, pago).texto;
conferir("concluida → Realizada", r("concluida", true), "Realizada");
conferir("cancelada → Cancelada", r("cancelada", true), "Cancelada");
conferir("pendente_anamnese → Falta a triagem", r("pendente_anamnese", true), "Falta a triagem");
conferir("pendente_anamnese sem pagamento → Aguardando pagamento", r("pendente_anamnese", false), "Aguardando pagamento");
conferir("em_espera → Aguardando pagamento", r("em_espera"), "Aguardando pagamento");
conferir("confirmada sem pagamento → Aguardando pagamento", r("confirmada", false), "Aguardando pagamento");
conferir("confirmada paga → Confirmada", r("confirmada", true), "Confirmada");
conferir("aguardando_reagendamento", r("aguardando_reagendamento", true), "Aguardando reagendamento");
conferir("status desconhecido não vira Confirmada", r("qualquer"), "Agendada");

/* 3. regressões no código ---------------------------------------------- */
const pasta = join(import.meta.dir, "../src/components/bion/paciente");
const ler = (f: string) => readFileSync(join(pasta, f), "utf8");
const triagem = ler("TriagemSlides.tsx");
conferir("Pular da triagem chama a função (sem `void pularTudo}`)", /void pularTudo\s*\}/.test(triagem), false);
conferir("Pular da triagem: `void pularTudo()` presente", triagem.includes("void pularTudo()"), true);
const docs = ler("DocumentosPainel.tsx");
conferir("Documentos não lista consultas confirmadas (futuras)", /c\.status === "confirmada"/.test(docs), false);
conferir("Impressora abre o documento já imprimindo", docs.includes("imprimir: true") && docs.includes("window.print()"), true);
const perfil = ler("PerfilPainel.tsx");
conferir("Perfil lê o tema do <html> (useTemaHtml)", perfil.includes("useTemaHtml()"), true);
conferir("Perfil não lê mais o tema só do localStorage", perfil.includes('getItem("bion-tema")'), false);
for (const f of ["CancelarRemarcarSheet.tsx", "PedirReembolsoSheet.tsx", "TriagemSlides.tsx", "DadosPessoaisSheet.tsx"]) {
  conferir(`${f}: sem fundo preto fixo (bg-zinc-950/900, bg-black/80)`, /(?<![:\w-])bg-(?:zinc-9[05]0|black\/80)\b/.test(ler(f)), false);
}
const css = ler("paciente.css");
conferir("paciente.css: animações desligadas com prefers-reduced-motion", /prefers-reduced-motion[\s\S]*bpp-sheet-painel[\s\S]*animation: none/.test(css), true);
conferir("paciente.css: fallback sem backdrop-filter", (css.match(/@supports not \(\(backdrop-filter/g) ?? []).length >= 2, true);
const seletoresSoltos = css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("}")
  .map((b) => b.split("{")[0].trim())
  .filter((sel) => sel && !sel.startsWith("@") && !/^(from|to|\d+%)/.test(sel))
  .flatMap((sel) => sel.split(",").map((x) => x.trim()))
  .filter((x) => x && !x.includes(".bp-app-paciente") && !/^(\.bp-painel|\.bp-secao-[123]|\.bp-impressao.*|body:has\(\.bp-impressao\) \*)$/.test(x));
conferir("paciente.css: todo seletor novo com escopo .bp-app-paciente", seletoresSoltos, []);

console.log(`\n${total - falhas}/${total} ok`);
if (falhas) process.exit(1);
