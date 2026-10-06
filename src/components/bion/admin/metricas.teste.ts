/**
 * Testes do Centro de Comando / Fila (funções puras) e do rótulo do atalho.
 * Rodar: bun src/components/bion/admin/metricas.teste.ts  (também com TZ=UTC e TZ=Asia/Tokyo)
 */
import type { AuditLog, Consulta, Medico, TicketSuporte } from "@/lib/bion-tipos";
import { centavosDoValor, contarPorCategoria, especialidades30d, montarFila, resumoHoje, resumoMedicos, serieDiaria, type RepasseWire, type ReembolsoWire } from "./metricas";
import { ehApple, rotuloAtalhoBusca } from "./ui/atalho";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  // Intl usa espaço não separável em "R$ 1,00": normaliza para comparar.
  const a = JSON.stringify(obtido).replace(/\u00a0/g, " ");
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
const t = (iso: string) => Date.parse(iso);
const AGORA = t("2026-10-04T10:00:00-03:00");

let n = 0;
function consulta(iso: string, status: Consulta["status"], extra: Partial<Consulta> = {}): Consulta {
  n++;
  return { id: `c${n}`, medico: "Dra. A", especialidade: "Clínica Geral", paciente: `P${n}`, data: "", hora: "", status, ts: t(iso), ...extra };
}

/* ---------- valor → centavos ---------- */
igual("valor inteiro", centavosDoValor("R$ 150"), 15000);
igual("valor com 1 casa", centavosDoValor("R$ 150,5"), 15050);
igual("valor com 2 casas", centavosDoValor("R$ 99,90"), 9990);
igual("valor com milhar", centavosDoValor("R$ 1.234,56"), 123456);
igual("valor vazio", centavosDoValor(undefined), 0);
igual("valor lixo", centavosDoValor("grátis"), 0);

/* ---------- hoje no fuso de SP ---------- */
const lista: Consulta[] = [
  consulta("2026-10-04T00:00:00-03:00", "concluida", { pago: true, valor: "R$ 100" }), // 1º minuto do dia (SP)
  consulta("2026-10-04T09:45:00-03:00", "confirmada", { pago: true, valor: "R$ 150,50" }), // agora - 15 min
  consulta("2026-10-04T10:20:00-03:00", "pendente_anamnese"), // agora + 20 min
  consulta("2026-10-04T11:00:00-03:00", "em_espera"),
  consulta("2026-10-04T15:00:00-03:00", "cancelada", { pago: true, valor: "R$ 999" }),
  consulta("2026-10-04T16:00:00-03:00", "aguardando_reagendamento"),
  consulta("2026-10-04T23:30:00-03:00", "confirmada"), // 02:30 UTC do dia 05: ainda é HOJE em SP
  consulta("2026-10-05T00:30:00-03:00", "confirmada"), // amanhã em SP
  consulta("2026-10-03T23:59:00-03:00", "concluida"), // ontem em SP (02:59 UTC do dia 04)
];
const r = resumoHoje(lista, AGORA);
igual("total do dia (SP)", r.total, 7);
igual("a realizar", r.agendadas, 4);
igual("concluídas", r.concluidas, 1);
igual("canceladas", r.canceladas, 1);
igual("aguardando reagendamento", r.reagendar, 1);
igual("agora ± 30 min", r.aoVivo.map((c) => c.id), ["c2", "c3"]);
igual("próximas em ordem", r.proximas.map((c) => c.id), ["c2", "c3", "c4", "c7"]);
igual("pagas (sem canceladas)", r.pagas, 2);
igual("bruto pago em centavos", r.brutoPagoCentavos, 25050);

const s = serieDiaria(lista, AGORA, 3);
igual("série: rótulos", s.map((x) => x.rotulo), ["sex, 02/10", "Ontem", "Hoje"]);
igual("série: totais sem canceladas", s.map((x) => x.total), [0, 1, 6]);

const esp = especialidades30d(
  [
    consulta("2026-10-01T10:00:00-03:00", "concluida", { especialidade: "Dermatologia" }),
    consulta("2026-10-02T10:00:00-03:00", "concluida", { especialidade: "Dermatologia" }),
    consulta("2026-10-03T10:00:00-03:00", "concluida", { especialidade: "Cardiologia" }),
    consulta("2026-10-03T10:00:00-03:00", "cancelada", { especialidade: "Cardiologia" }),
    consulta("2026-09-01T10:00:00-03:00", "concluida", { especialidade: "Pediatria" }), // > 30 dias
    consulta("2026-10-10T10:00:00-03:00", "confirmada", { especialidade: "Psicologia" }), // futuro
    consulta("2026-10-04T08:00:00-03:00", "concluida", { especialidade: "" }),
  ],
  AGORA,
);
igual("especialidades 30 dias", esp, [
  { nome: "Dermatologia", total: 2, pct: 50 },
  { nome: "Cardiologia", total: 1, pct: 25 },
  { nome: "Sem especialidade", total: 1, pct: 25 },
]);
igual("especialidades vazio", especialidades30d([], AGORA), []);

/* ---------- médicos ---------- */
const med = (id: string, status: Medico["status"]): Medico => ({
  id, nome: `Dr. ${id}`, crm: `${id}-SP`, especialidade: "Clínica", subespecialidades: [], valor: 0, avaliacao: 0, numAvaliacoes: 0,
  formacao: "", experiencia: "", idiomas: [], bio: "", status, horariosDisponiveis: [],
});
const medicos = [med("1", "ativo"), med("2", "pendente"), med("3", "suspenso"), med("4", "ativo")];
igual("resumo médicos", resumoMedicos(medicos), { ativos: 2, validacao: 1, suspensos: 1 });

/* ---------- fila ---------- */
const tickets: TicketSuporte[] = [
  { id: "t1", usuario: "Ana", perfil: "paciente", assunto: "Sala não abre", categoria: "tecnico", mensagem: "", data: "04/10", status: "aberto" },
  { id: "t2", usuario: "Bia", perfil: "medico", assunto: "Resolvido", categoria: "outro", mensagem: "", data: "03/10", status: "resolvido" },
];
const logs: AuditLog[] = [
  { id: "a1", ts: AGORA - 3_600_000, acao: "LOGIN_FALHOU_REPETIDO", categoria: "autenticacao", severidade: "critical", usuario: "x", role: "admin" },
  { id: "a2", ts: AGORA - 2 * 86_400_000, acao: "ANTIGO", categoria: "sistema", severidade: "critical", usuario: "x", role: "admin" },
  { id: "a3", ts: AGORA - 60_000, acao: "INFO", categoria: "sistema", severidade: "info", usuario: "x", role: "admin" },
];
const repasses: RepasseWire[] = [
  { id: "r1", medicoId: "m1", medico: "Dra. Ok", competencia: "2026-10-03", status: "fechado", liquidoCentavos: 91050, itens: 3, fechadoEm: "2026-10-04T02:30:00.000Z", recebimento: { chaveTrocadaRecente: false, cnpjDivergente: false } },
  { id: "r2", medicoId: "m2", medico: "Dr. Cnpj", competencia: "2026-10-03", status: "fechado", liquidoCentavos: 5000, itens: 1, fechadoEm: "2026-10-04T02:30:00.000Z", recebimento: { cnpjDivergente: true } },
  { id: "r3", medicoId: "m3", medico: "Dr. SemPix", competencia: "2026-10-02", status: "fechado", liquidoCentavos: 1000, itens: 1, fechadoEm: "2026-10-03T02:30:00.000Z", recebimento: null },
  { id: "r4", medicoId: "m4", medico: "Dr. Pago", competencia: "2026-10-01", status: "pago", liquidoCentavos: 1000, itens: 1, fechadoEm: null, recebimento: null },
];
const reembolsos: ReembolsoWire[] = [
  { id: "e1", status: "em_analise", valorCentavos: 15000, criadoEm: "2026-10-04T11:00:00.000Z", consulta: { id: "c", especialidade: "Clínica", dataInicio: "2026-10-03T13:00:00.000Z", medico: "Dra. A", paciente: "Paulo" } },
  { id: "e2", status: "negado", valorCentavos: 15000, criadoEm: "2026-10-01T11:00:00.000Z", consulta: null },
];
const fila = montarFila({ medicos, tickets, auditLogs: logs, repasses, reembolsos }, AGORA);
igual(
  "fila: ordem por urgência e idade",
  fila.map((i) => i.chave),
  ["repasse-r3", "repasse-r2", "audit-a1", "reembolso-e1", "medico-2", "chamado-t1", "repasse-r1"],
);
igual("fila: contagem", contarPorCategoria(fila), { validacao: 1, reembolso: 1, repasse: 3, chamado: 1, sistema: 1 });
const rr = fila.find((i) => i.chave === "repasse-r2")!;
igual("fila: repasse com CNPJ divergente", [rr.tom, rr.chips.map((c) => c.rotulo), rr.destino], ["critico", ["A pagar", "CNPJ divergente"], "admin-repasses?repasse=r2"]);
igual("fila: repasse detalhe", rr.detalhe, "03/10 · R$ 50,00 · 1 consulta");
igual("fila: sem PIX", fila[0].chips.map((c) => c.rotulo), ["A pagar", "Sem chave PIX"]);
const re = fila.find((i) => i.chave === "reembolso-e1")!;
igual("fila: reembolso", [re.titulo, re.detalhe, re.destino], ["Reembolso · Paulo", "Dra. A · consulta ontem 10:00 · R$ 150,00", "admin-agendamentos?aba=reembolsos"]);
igual("fila: médico em validação", [fila[4].titulo, fila[4].detalhe, fila[4].destino], ["Dr. 2", "Clínica · CRM 2-SP", "admin-medicos?aba=validacao&medico=2"]);
igual("fila: auditoria crítica humanizada", fila[2].titulo, "Login falhou repetido");
igual("fila: chamado abre a conversa", fila.find((i) => i.chave === "chamado-t1")!.destino, "suporte?chamado=t1");
igual("humanizar mantém siglas", montarFila({ medicos: [], tickets: [], repasses: null, reembolsos: null, auditLogs: [{ ...logs[0], acao: "LGPD_COFRE_CONSULTADO" }] }, AGORA)[0].titulo, "LGPD cofre consultado");
igual("fila: sem rotas ainda (null) não quebra", montarFila({ medicos: [], tickets: [], auditLogs: [], repasses: null, reembolsos: null }, AGORA), []);

/* ---------- atalho da busca ---------- */
igual("Mac", ehApple("MacIntel"), true);
igual("macOS (userAgentData)", ehApple("macOS"), true);
igual("iPhone", ehApple("iPhone"), true);
igual("Windows", ehApple("Win32"), false);
igual("Linux", ehApple("Linux x86_64"), false);
igual("Android", ehApple("Linux armv8l", "Mozilla/5.0 (Linux; Android 14)"), false);
igual("sem plataforma, UA de Mac", ehApple("", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), true);
igual("rótulo Mac", rotuloAtalhoBusca(true).curto, "⌘K");
igual("rótulo outros", rotuloAtalhoBusca(false).curto, "Ctrl K");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
