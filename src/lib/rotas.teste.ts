/**
 * Guarda de papel do layout autenticado compartilhado.
 * Cobre o retorno do pagamento do paciente e prova que médico e admin
 * continuam indo para o mesmo destino de antes.
 * Rodar: bun src/lib/rotas.teste.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Role,
  destinoGuardaPapel,
  ehRotaRetornoPagamento,
  ehRotaTelaCheia,
  pathLimpo,
  pacientePodeVer,
  viewDoPath,
  SO_ADMIN,
  SO_CLINICA,
  SO_MEDICO,
  SO_PACIENTE,
} from "./rotas";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(obtido)}\n  esperado: ${JSON.stringify(esperado)}`);
  }
}

/** Lógica anterior, inline no layout: paciente só permanecia em tela cheia. */
function destinoAntes(role: Role, path: string): string | null {
  const p = pathLimpo(path);
  const view = viewDoPath(p);
  if (role === "paciente" && !ehRotaTelaCheia(p)) return "/paciente";
  if (SO_ADMIN.includes(view) && role !== "admin") return "/painel";
  if (SO_MEDICO.includes(view) && role !== "medico") return "/painel";
  if (SO_PACIENTE.includes(view) && role !== "paciente") return "/painel";
  if (SO_CLINICA.includes(view) && role === "admin") return "/painel";
  return null;
}

const retornos = [
  "/pagamento/sucesso",
  "/pagamento/cancelado",
  "/pagamento/sucesso?consulta=c1",
  "/pagamento/cancelado?consulta=c1",
  "/pagamento/sucesso?tipo=renovacao",
  "/pagamento/cancelado?tipo=multa",
  "/pagamento/sucesso/",
  "/pagamento/cancelado/",
];

const demais = [
  "/paciente",
  "/consulta",
  "/consulta/abc",
  "/suporte",
  "/privacidade",
  "/ajuda",
  "/painel",
  "/agendar",
  "/perfil",
  "/historico",
  "/consultas",
  "/mensagens",
  "/lembretes",
  "/notificacoes",
  "/receitas",
  "/prontuario",
  "/bion-ia",
  "/avaliacoes",
  "/medico-perfil",
  "/medico-pacientes",
  "/usuarios",
  "/admin-pacientes",
  "/admin-medicos",
  "/admin-agendamentos",
  "/admin-repasses",
  "/auditoria",
  "/llm-monitor",
  "/relatorios",
  "/travas",
  "/pagamento",
];

igual("pathLimpo tira query e barra", pathLimpo("/pagamento/sucesso?consulta=c1/"), "/pagamento/sucesso");
igual("pathLimpo vazio", pathLimpo(""), "/");

for (const p of retornos) {
  igual(`retorno pagamento: ${p}`, ehRotaRetornoPagamento(p), true);
  igual(`retorno NÃO é tela cheia: ${p}`, ehRotaTelaCheia(p), false);
  igual(`paciente pode ver retorno: ${p}`, pacientePodeVer(p), true);
}

igual(" /pagamento sozinho não é retorno", ehRotaRetornoPagamento("/pagamento"), false);
igual("paciente não fica em /pagamento", pacientePodeVer("/pagamento"), false);

for (const p of ["/paciente", "/consulta", "/consulta/xyz", "/suporte", "/privacidade", "/ajuda"]) {
  igual(`tela cheia: ${p}`, ehRotaTelaCheia(p), true);
}

// Paciente: agora alcança as telas de status; o resto não muda.
for (const p of retornos) {
  igual(`paciente permanece no retorno: ${p}`, destinoGuardaPapel("paciente", p), null);
  igual(`antes o paciente era mandado a /paciente: ${p}`, destinoAntes("paciente", p), "/paciente");
}
for (const p of demais) {
  igual(`paciente demais inalterado: ${p}`, destinoGuardaPapel("paciente", p), destinoAntes("paciente", p));
}

// Médico: todos os destinos iguais aos de antes, inclusive no retorno do pagamento.
for (const p of [...retornos, ...demais]) {
  igual(`médico inalterado: ${p}`, destinoGuardaPapel("medico", p), destinoAntes("medico", p));
}
igual("médico em /pagamento/sucesso permanece (como antes)", destinoGuardaPapel("medico", "/pagamento/sucesso"), null);
igual("médico em /paciente vai ao painel (como antes)", destinoGuardaPapel("medico", "/paciente"), "/painel");
igual("médico em /consultas permanece (como antes)", destinoGuardaPapel("medico", "/consultas"), null);
igual("médico em /usuarios vai ao painel (como antes)", destinoGuardaPapel("medico", "/usuarios"), "/painel");
igual("médico em /medico-perfil permanece (como antes)", destinoGuardaPapel("medico", "/medico-perfil"), null);
igual("retorno do pagamento não tira o AppShell do médico", ehRotaTelaCheia("/pagamento/sucesso"), false);

// Admin: todos os destinos iguais aos de antes.
for (const p of [...retornos, ...demais]) {
  igual(`admin inalterado: ${p}`, destinoGuardaPapel("admin", p), destinoAntes("admin", p));
}
igual("admin em /pagamento/sucesso permanece (como antes)", destinoGuardaPapel("admin", "/pagamento/sucesso"), null);
igual("admin em /consultas vai ao painel (como antes)", destinoGuardaPapel("admin", "/consultas"), "/painel");
igual("admin em /usuarios permanece (como antes)", destinoGuardaPapel("admin", "/usuarios"), null);
igual("admin em /bion-ia vai ao painel (como antes)", destinoGuardaPapel("admin", "/bion-ia"), "/painel");
igual("admin em /paciente vai ao painel (como antes)", destinoGuardaPapel("admin", "/paciente"), "/painel");

// O layout compartilhado de fato usa a função testada.
const layout = readFileSync(resolve(import.meta.dir, "../app/(bion)/(app)/layout.tsx"), "utf8");
igual("layout importa destinoGuardaPapel", layout.includes("destinoGuardaPapel"), true);
igual("layout importa pacientePodeVer", layout.includes("pacientePodeVer"), true);
igual("layout chama destinoGuardaPapel na guarda", /destinoGuardaPapel\(\s*sessao\.role,\s*path\s*\)/.test(layout), true);
igual("layout não redireciona o paciente no antigo if de tela cheia", layout.includes("destinoPaciente && !telaCheiaPaciente"), false);

console.log(`rotas (guarda pagamento): ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
