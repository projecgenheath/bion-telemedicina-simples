/**
 * Teste da entrada do paciente na sala (sem pré-sala).
 * Módulo: src/components/bion/paciente/entrada-sala.ts (janela de lib/janela-sala.ts).
 * Rodar:
 *   TZ=America/Sao_Paulo bun scripts/teste_entrada_sala_paciente.ts
 *   TZ=UTC bun scripts/teste_entrada_sala_paciente.ts
 *   TZ=Asia/Tokyo bun scripts/teste_entrada_sala_paciente.ts
 * O resultado deve ser o mesmo nos três fusos: os textos usam o horário de São Paulo.
 */
import {
  acaoSalaPaciente,
  botaoPrincipalProxima,
  hrefSala,
  proximaMudancaSala,
  rotuloAbertura,
  type AcaoSala,
} from "../src/components/bion/paciente/entrada-sala";

const MIN = 60_000;
// Consulta às 14:30 de 06/10/2026 (São Paulo, UTC-3).
const INICIO = Date.parse("2026-10-06T14:30:00-03:00");
const consulta = { id: "cons_abc-123", ts: INICIO };
const m = (n: number) => INICIO + n * MIN;

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    console.log(`ok    ${nome}`);
  } else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

const ENTRAR: AcaoSala = { tipo: "entrar", href: "/consulta?consulta=cons_abc-123" };
const aguardar = (rotulo: string): AcaoSala => ({ tipo: "aguardar", abreEm: m(-30), rotulo });

// Janela: abre 30 min antes, fecha 2 h depois (inclusive nas bordas).
igual("31 min antes → aguardar (abre às 14:00)", acaoSalaPaciente(consulta, m(-31)), aguardar("A sala abre às 14:00"));
igual("30 min e 1 s antes → ainda aguardar", acaoSalaPaciente(consulta, m(-30) - 1_000).tipo, "aguardar");
igual("30 min antes → entrar", acaoSalaPaciente(consulta, m(-30)), ENTRAR);
igual("no horário → entrar", acaoSalaPaciente(consulta, m(0)), ENTRAR);
igual("durante (45 min depois) → entrar", acaoSalaPaciente(consulta, m(45)), ENTRAR);
igual("119 min depois → entrar", acaoSalaPaciente(consulta, m(119)), ENTRAR);
igual("120 min depois → entrar (borda inclusiva)", acaoSalaPaciente(consulta, m(120)), ENTRAR);
igual("121 min depois → nenhuma", acaoSalaPaciente(consulta, m(121)), { tipo: "nenhuma" });

// Outro dia: o rótulo leva a data (dd/mm) no horário de São Paulo.
igual("véspera às 20:00 → abre em 06/10 às 14:00", acaoSalaPaciente(consulta, Date.parse("2026-10-05T20:00:00-03:00")), aguardar("A sala abre em 06/10 às 14:00"));
// 22:30 em SP já é dia 07 em UTC e em Tóquio: o "mesmo dia" é o de São Paulo.
const noite = { id: "x", ts: Date.parse("2026-10-06T23:00:00-03:00") };
igual("consulta 23:00, agora 18:00 do mesmo dia (SP) → sem data", acaoSalaPaciente(noite, Date.parse("2026-10-06T18:00:00-03:00")).tipo === "aguardar" &&
  (acaoSalaPaciente(noite, Date.parse("2026-10-06T18:00:00-03:00")) as { rotulo: string }).rotulo, "A sala abre às 22:30");
igual("abertura 00:15 do dia seguinte (SP) → com data", rotuloAbertura(Date.parse("2026-10-07T00:15:00-03:00"), Date.parse("2026-10-06T23:00:00-03:00")), "A sala abre em 07/10 às 00:15");

// Botão principal do card: sala aberta → triagem pendente → aguardar → nenhum.
igual("triagem pendente antes da janela → triagem", botaoPrincipalProxima(acaoSalaPaciente(consulta, m(-60)), true), "triagem");
igual("sem triagem pendente antes da janela → aguardar", botaoPrincipalProxima(acaoSalaPaciente(consulta, m(-60)), false), "aguardar");
igual("triagem pendente com a sala aberta → sala", botaoPrincipalProxima(acaoSalaPaciente(consulta, m(-10)), true), "sala");
igual("sala fechada sem triagem → nenhum", botaoPrincipalProxima(acaoSalaPaciente(consulta, m(121)), false), "nenhum");
igual("sala fechada com triagem pendente → triagem", botaoPrincipalProxima(acaoSalaPaciente(consulta, m(121)), true), "triagem");

// Endereço: o id vai codificado (o page.tsx da consulta valida o formato).
igual("href codifica o id", hrefSala("a b/c"), "/consulta?consulta=a%20b%2Fc");

// Relógio: próxima mudança = abertura; depois, o fechamento (+1 ms); depois, nenhuma.
igual("próxima mudança antes da janela = abertura", proximaMudancaSala([INICIO], m(-60)), m(-30));
igual("próxima mudança com a sala aberta = fechamento", proximaMudancaSala([INICIO], m(10)), m(120) + 1);
igual("sem mudança depois de fechada", proximaMudancaSala([INICIO], m(121)), null);
igual("várias consultas: a mais próxima", proximaMudancaSala([INICIO + 86_400_000, INICIO], m(-60)), m(-30));

console.log(`\nTZ=${process.env.TZ ?? "(padrão)"} · ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
