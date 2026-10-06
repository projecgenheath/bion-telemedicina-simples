/**
 * Testes das regras puras da Auditoria (Torre BION).
 * Rodar: bun --conditions react-server src/components/bion/admin/auditoria/auditoria.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso da máquina)
 */
import type { AuditLog } from "@/lib/bion-tipos";
import { montarFila } from "../metricas";
import {
  CABECALHO_CSV,
  FILTROS_VAZIOS,
  agruparPorDiaEHora,
  contarPor,
  csvAuditoria,
  csvLinha,
  destinoEntidade,
  detalheExportacaoCsv,
  detalheExportacaoPdf,
  entidadeDe,
  filtrarEventos,
  filtrosAtivos,
  fimDoDia,
  formatarDataAuditoria,
  horaSegundos,
  inicioDoDia,
  jsonFormatado,
  opcoesFiltro,
  piorSeveridade,
  resumo24h,
  rotuloAcao,
  rotuloCategoria,
  rotuloHora,
  rotuloPerfil,
} from "./trilha";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
const sp = (s: string) => Date.parse(`${s}-03:00`);
const agora = sp("2026-10-06T09:30:00");

let n = 0;
const ev = (quando: string, extra: Partial<AuditLog> = {}): AuditLog => ({
  id: `l${++n}`,
  ts: sp(quando),
  acao: "CONSULTA_CANCELADA",
  categoria: "consulta",
  severidade: "info",
  usuario: "Admin Fictício",
  role: "admin",
  ...extra,
});
const logs: AuditLog[] = [
  ev("2026-10-05T23:30:00", { severidade: "critical", acao: "LGPD_DADOS_EXCLUIDOS", categoria: "admin", entidade: "paciente", entidadeId: "pac-1" }), // 02:30 UTC do dia 06
  ev("2026-10-05T23:05:00", { severidade: "warning", usuario: "Dra. Exemplo", role: "medico", entidade: "consulta", entidadeId: "c1", detalhes: "Remarcou, com vírgula" }),
  ev("2026-10-06T00:10:00", { categoria: "sistema", acao: "LLM_TURNO", usuario: "BION IA", role: "sistema" as AuditLog["role"], entidade: "llm", detalhes: '{"ok":true,"ms":850}' }),
  ev("2026-10-06T09:15:00", { acao: "Editou o valor da consulta", entidade: "Repasse", entidadeId: "r1" }),
  ev("2026-10-01T10:00:00", { severidade: "critical", acao: "ACESSO_NEGADO", categoria: "autenticacao", usuario: "Paciente Fictício", role: "paciente" }),
];

/* ---------------- período no fuso da clínica ---------------- */
igual("início do dia SP", inicioDoDia("2026-10-05"), sp("2026-10-05T00:00:00"));
igual("fim do dia SP (exclusivo)", fimDoDia("2026-10-05"), sp("2026-10-06T00:00:00"));
igual("dia inválido", Number.isNaN(inicioDoDia("05/10/2026")), true);
const so5 = filtrarEventos(logs, { ...FILTROS_VAZIOS, de: "2026-10-05", ate: "2026-10-05" });
igual("23:30 de SP fica no dia 05 (mesmo sendo 06 em UTC)", so5.map((l) => l.id), ["l1", "l2"]);
igual("dia 06 começa à 00:00 de SP", filtrarEventos(logs, { ...FILTROS_VAZIOS, de: "2026-10-06" }).map((l) => l.id), ["l4", "l3"]);

/* ---------------- filtros ---------------- */
igual("sem filtro: todos, mais recente primeiro", filtrarEventos(logs, FILTROS_VAZIOS).map((l) => l.id), ["l4", "l3", "l1", "l2", "l5"]);
igual("severidade", filtrarEventos(logs, { ...FILTROS_VAZIOS, severidade: "critical" }).map((l) => l.id), ["l1", "l5"]);
igual("categoria", filtrarEventos(logs, { ...FILTROS_VAZIOS, categoria: "consulta" }).map((l) => l.id), ["l4", "l2"]);
igual("perfil", filtrarEventos(logs, { ...FILTROS_VAZIOS, perfil: "medico" }).map((l) => l.id), ["l2"]);
igual("usuário", filtrarEventos(logs, { ...FILTROS_VAZIOS, usuario: "BION IA" }).map((l) => l.id), ["l3"]);
igual("entidade normaliza maiúsculas (Repasse = repasse)", filtrarEventos(logs, { ...FILTROS_VAZIOS, entidade: "repasse" }).map((l) => l.id), ["l4"]);
igual("busca sem acento acha frase humanizada", filtrarEventos(logs, { ...FILTROS_VAZIOS, busca: "lgpd dados" }).map((l) => l.id), ["l1"]);
igual("busca no detalhe", filtrarEventos(logs, { ...FILTROS_VAZIOS, busca: "VÍRGULA" }).map((l) => l.id), ["l2"]);
igual("busca pelo id da entidade", filtrarEventos(logs, { ...FILTROS_VAZIOS, busca: "pac-1" }).map((l) => l.id), ["l1"]);
igual("filtros ativos (busca não conta)", filtrosAtivos({ ...FILTROS_VAZIOS, busca: "x", severidade: "warning", de: "2026-10-01", entidade: "medico" }), 3);
igual("contar por severidade", contarPor(logs, "severidade"), { critical: 2, warning: 1, info: 2 });
igual("opções do filtro", opcoesFiltro(logs), { usuarios: ["Admin Fictício", "BION IA", "Dra. Exemplo", "Paciente Fictício"], entidades: ["consulta", "llm", "paciente", "repasse"] });
igual("resumo 24 h", resumo24h(logs, agora), { criticos: 1, avisos: 1, total: 4 });
igual("entidadeDe", entidadeDe({ entidade: " Repasse" }), "repasse");

/* ---------------- linha do tempo ---------------- */
const grupos = agruparPorDiaEHora(filtrarEventos(logs, FILTROS_VAZIOS));
igual("dias no fuso SP", grupos.map((g) => [g.dia, g.total]), [["2026-10-06", 2], ["2026-10-05", 2], ["2026-10-01", 1]]);
igual("horas no fuso SP", grupos.map((g) => g.horas.map((h) => h.hora)), [[9, 0], [23], [10]]);
igual("23:30 e 23:05 no mesmo grupo das 23h, pior = crítico", [grupos[1].horas[0].itens.map((l) => l.id), grupos[1].horas[0].pior], [["l1", "l2"], "critical"]);
igual("pior severidade", [piorSeveridade([{ severidade: "info" }, { severidade: "warning" }]), piorSeveridade([])], ["warning", "info"]);
igual("rótulo da hora", rotuloHora(9), "09:00");
igual("hora com segundos em SP", horaSegundos(sp("2026-10-05T23:30:07")), "23:30:07");

/* ---------------- rótulos e detalhe ---------------- */
igual("ação em código vira frase", rotuloAcao("AUDITORIA_CSV_EXPORTADA"), "Auditoria CSV exportada");
igual("ação em texto livre fica igual", rotuloAcao("Aprovou Dr. João"), "Aprovou Dr. João");
igual("categoria", [rotuloCategoria("prontuario"), rotuloCategoria("nova_coisa")], ["Prontuário", "Nova coisa"]);
igual("perfil", [rotuloPerfil("medico"), rotuloPerfil("sistema")], ["Médico", "Sistema"]);
igual("JSON formatado", jsonFormatado('{"ok":true,"ms":850}'), '{\n  "ok": true,\n  "ms": 850\n}');
igual("texto comum não é JSON", jsonFormatado("valor: 140 → 150"), null);
igual("JSON quebrado não é JSON", jsonFormatado("{ok:"), null);
igual("ver médico", destinoEntidade({ entidade: "medico", entidadeId: "med 1" }), { view: "admin-medicos?medico=med%201", rotulo: "Abrir ficha do médico" });
igual("ver repasse (entidade com maiúscula)", destinoEntidade({ entidade: "Repasse", entidadeId: "r1" })?.view, "admin-repasses?repasse=r1");
igual("ver consulta", destinoEntidade({ entidade: "consulta", entidadeId: "c1" })?.view, "admin-agendamentos?consulta=c1");
igual("reembolso sem id ainda abre a aba", destinoEntidade({ entidade: "reembolso" })?.view, "admin-agendamentos?aba=reembolsos");
igual("médico sem id não tem destino", destinoEntidade({ entidade: "medico" }), null);
igual("entidade sem tela", destinoEntidade({ entidade: "lembrete", entidadeId: "x" }), null);

/* ---------------- exportação: MESMA lógica do AuditTrail antigo ---------------- */
// Cópia literal do csvLinha do AuditTrail antigo (removido; está no histórico do git).
function csvLinhaAntigo(valores: (string | number | undefined)[]) {
  return valores
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}
const amostras: (string | number | undefined)[][] = [
  ["simples", 1, undefined, ""],
  ['com "aspas"', "com, vírgula", "com\nquebra", "ok"],
  ["ponto;e;vírgula", '"', ",", 0],
];
for (const a of amostras) igual(`csvLinha igual ao antigo: ${JSON.stringify(a)}`, csvLinha(a), csvLinhaAntigo(a));
igual("cabeçalho igual ao antigo", CABECALHO_CSV, ["Data/Hora", "Usuário", "Perfil", "Ação", "Categoria", "Severidade", "Entidade", "Detalhes"]);
const csv = csvAuditoria([logs[1], logs[0]]);
const linhas = csv.split("\n");
igual("CSV começa com BOM", csv.charCodeAt(0), 0xfeff);
igual("CSV linha 1 = cabeçalho", linhas[0].slice(1), "Data/Hora,Usuário,Perfil,Ação,Categoria,Severidade,Entidade,Detalhes");
igual("CSV usa valores crus (role, acao, categoria, severidade) e a data em SP", linhas[1], `${csvLinhaAntigo([formatarDataAuditoria(logs[1].ts)])},Dra. Exemplo,medico,CONSULTA_CANCELADA,consulta,warning,consulta,"Remarcou, com vírgula"`);
igual("data do CSV no fuso SP", formatarDataAuditoria(sp("2026-10-05T23:30:00")).replace(/\s/g, " "), "05/10/2026, 23:30:00");
igual("CSV sem entidade/detalhes vira vazio", csvAuditoria([ev("2026-10-06T08:00:00")]).split("\n")[1].endsWith(",info,,"), true);
igual("CSV vazio só com cabeçalho", csvAuditoria([]).split("\n").length, 1);
igual("texto registrado na auditoria (CSV)", detalheExportacaoCsv(2), "Exportação CSV da auditoria (2 registro(s))");
igual("texto registrado na auditoria (PDF)", detalheExportacaoPdf(3, 1), "Exportação PDF da auditoria (3 registro(s), 1 página(s))");

/* ---------------- Fila: evento crítico abre direto o detalhe ---------------- */
const fila = montarFila({ medicos: [], tickets: [], auditLogs: logs, repasses: [], reembolsos: [] }, agora);
igual("fila leva ao evento", fila.map((i) => i.destino), ["auditoria?evento=l1"]);

console.log(`auditoria: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? "padrão"}]`);
if (falhas) process.exit(1);
