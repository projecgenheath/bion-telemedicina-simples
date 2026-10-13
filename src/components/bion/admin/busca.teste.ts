/**
 * Testes da busca global do lançador (Ctrl K / ⌘K).
 * Rodar: bun --conditions react-server src/components/bion/admin/busca.teste.ts
 */
import type { Consulta, Medico, PacienteRegistro, TicketSuporte } from "@/lib/bion-tipos";
import { buscarGlobal, casa, normalizarBusca } from "./busca";

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

igual("normaliza", normalizarBusca("  Privacidade  &  LGPD "), "privacidade & lgpd");
igual("casa todas as palavras, sem acento", casa("lgpd cofre", "Privacidade & LGPD", "cofre anonimizar"), true);
igual("falta uma palavra", casa("lgpd pix", "Privacidade & LGPD"), false);
igual("termo vazio casa tudo", casa("", "x"), true);

const medicos = [{ id: "m1", nome: "Dra. Ana Lima", crm: "CRM-SP 123456", especialidade: "Cardiologia" }] as Medico[];
const pacientes = [{ id: "p1", nome: "José Ávila", email: "jose@exemplo.com", cpf: "123.456.789-09" }] as PacienteRegistro[];
const consultas = [
  { id: "c1", paciente: "José Ávila", medico: "Dra. Ana Lima", especialidade: "Cardiologia", data: "06 Out", hora: "14:00", ts: 2 },
  { id: "c2", paciente: "José Ávila", medico: "Dra. Ana Lima", especialidade: "Cardiologia", data: "01 Out", hora: "09:00", ts: 1 },
] as Consulta[];
const tickets = [{ id: "t1", assunto: "Vídeo travando", usuario: "José Ávila", data: "Hoje às 09:00" }] as TicketSuporte[];
const d = { medicos, pacientes, consultas, tickets };
const r = (t: string) => buscarGlobal(t, d).map((x) => `${x.tipo}:${x.id}`);

igual("1 caractere não busca", r("a"), []);
igual("médico por CRM", r("crm-sp 123456"), ["medico:admin-medicos?medico=m1"]);
igual("só dígitos também tenta o CPF", r("123456"), ["medico:admin-medicos?medico=m1", "paciente:admin-pacientes?paciente=p1"]);
igual("paciente por CPF (dígitos), sem mostrar o CPF", buscarGlobal("123.456.789", d).filter((x) => x.tipo === "paciente").map((x) => [x.id, x.detalhe]), [["admin-pacientes?paciente=p1", "jose@exemplo.com"]]);
igual("pessoa sem acento acha paciente, consultas (mais recentes primeiro) e chamado", r("jose avila"), [
  "paciente:admin-pacientes?paciente=p1",
  "consulta:admin-agendamentos?consulta=c1",
  "consulta:admin-agendamentos?consulta=c2",
  "chamado:suporte?chamado=t1",
]);
igual("atalho do cofre", r("cofre").slice(0, 1), ["atalho:privacidade?secao=lgpd-cofre"]);
igual("atalho por sinônimo", r("reembolso")[0], "atalho:admin-agendamentos?aba=reembolsos");
igual("chamado pelo assunto", r("video"), ["chamado:suporte?chamado=t1"]);
igual("limite por tipo", buscarGlobal("jose", d, 1).filter((x) => x.tipo === "consulta").length, 1);

console.log(`busca: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
