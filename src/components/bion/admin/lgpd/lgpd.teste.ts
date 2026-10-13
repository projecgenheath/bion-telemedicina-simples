/**
 * Testes das regras puras de Privacidade & LGPD (Torre BION).
 * Rodar: bun --conditions react-server src/components/bion/admin/lgpd/lgpd.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo)
 */
import type { AuditLog, Consentimento } from "@/lib/bion-tipos";
import {
  codigoConfere,
  codigoConfirmacao,
  corpoBuscaCofre,
  dataLgpd,
  estadoContaLgpd,
  eventosLgpd,
  explicacaoAcao,
  filtrarConsentimentos,
  motivoRepeteTermo,
  nascimentoCofre,
  sucessoAcao,
  validarBuscaCofre,
} from "./lgpd";

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

/* ---------------- confirmação (mesma regra da tela antiga) ---------------- */
igual("código = 6 últimos do id", codigoConfirmacao("cm1abcdefXYZ123"), "XYZ123");
igual("confere com espaços nas pontas", codigoConfere("  XYZ123 ", "cm1abcdefXYZ123"), true);
igual("caixa importa (como antes)", codigoConfere("xyz123", "cm1abcdefXYZ123"), false);
igual("vazio não confere", codigoConfere("", "abc"), false);

/* ---------------- datas no fuso da clínica ---------------- */
// 02:30 UTC de 06/10 ainda é 05/10 em SP (a tela antiga mostrava 06/10 em Tóquio/UTC).
igual("data em SP", dataLgpd("2026-10-06T02:30:00.000Z"), "05/10/2026");
igual("data inválida", [dataLgpd("x"), dataLgpd(null)], ["—", "—"]);
igual("nascimento é dia de calendário", nascimentoCofre("1990-03-07"), "07/03/1990");
igual("nascimento livre antigo", nascimentoCofre("março de 1990"), "março de 1990");
igual("nascimento vazio", nascimentoCofre(null), "—");

/* ---------------- situação ---------------- */
igual("situações", [estadoContaLgpd({ anonimizado: true, status: "ativo" }).rotulo, estadoContaLgpd({ anonimizado: false, status: "ativo" }).rotulo, estadoContaLgpd({ anonimizado: false, status: "inativo" }).rotulo], ["Anonimizado", "Ativo", "Inativo"]);

/* ---------------- textos iguais aos da tela antiga ---------------- */
igual("explicação: arquivar acrescenta a frase", explicacaoAcao("excluir").includes(" A conta é arquivada sem acesso.") && !explicacaoAcao("anonimizar").includes("arquivada"), true);
igual("explicação: prontuário preservado", explicacaoAcao("anonimizar").includes("preservado por 20 anos (Lei 13.787/2018)"), true);
igual("sucesso", [sucessoAcao("anonimizar"), sucessoAcao("excluir")], [
  "Cadastro e login anonimizados; prontuário preservado. Auditoria registrada.",
  "Dados anonimizados e conta arquivada; prontuário preservado. Auditoria registrada.",
]);

/* ---------------- cofre ---------------- */
igual("CPF com 11 dígitos", validarBuscaCofre("cpf", "123.456.789-09", "Ofício 123/2026").ok, true);
igual("CPF curto", validarBuscaCofre("cpf", "123.456", "Ofício 123/2026").erros.termo, "O CPF precisa ter 11 dígitos.");
igual("nome curto", validarBuscaCofre("nome", "Al", "Ofício 123/2026").ok, false);
igual("motivo curto", validarBuscaCofre("nome", "Ana Lima", "abc").erros.motivo, "Informe o motivo (ex.: nº do processo ou do ofício).");
igual("motivo longo", validarBuscaCofre("nome", "Ana Lima", "x".repeat(301)).ok, false);
igual("motivo repete o CPF", motivoRepeteTermo("cpf", "123.456.789-09", "pedido sobre 12345678909"), true);
igual("motivo sem o CPF", motivoRepeteTermo("cpf", "123.456.789-09", "Processo 0001234-56.2026"), false);
igual("motivo repete o nome (sem acento)", motivoRepeteTermo("nome", "José Ávila", "pedido de jose avila"), true);
igual("corpo da busca", corpoBuscaCofre("nome", "  Ana Lima ", " Ofício 1 "), { nome: "Ana Lima", motivo: "Ofício 1" });

/* ---------------- registro e consentimentos ---------------- */
const log = (id: string, acao: string, ts: number, categoria = "admin"): AuditLog => ({ id, acao, ts, categoria, severidade: "info", usuario: "Admin", role: "admin" }) as AuditLog;
igual(
  "eventos LGPD (mais recentes primeiro)",
  eventosLgpd([log("1", "PACIENTE_ANONIMIZADO", 10), log("2", "LOGIN", 30), log("3", "LGPD_COFRE_CONSULTADO", 20), log("4", "Consentimento registrado", 5, "consentimento")]).map((l) => l.id),
  ["3", "1", "4"],
);
const cons: Consentimento[] = [
  { id: "c1", paciente: "Ana Lima", quem: "Dr. Beto", perfil: "medico", finalidade: "Acompanhamento clínico", documentos: 2, quando: "Hoje", aceito: true },
  { id: "c2", paciente: "José Ávila", quem: "Dra. Carla", perfil: "medico", finalidade: "Segunda opinião", documentos: 1, quando: "Ontem", aceito: false },
];
igual("consentimentos: busca sem acento", filtrarConsentimentos(cons, "jose").map((c) => c.id), ["c2"]);
igual("consentimentos: revogados", filtrarConsentimentos(cons, "", "revogados").map((c) => c.id), ["c2"]);
igual("consentimentos: por finalidade", filtrarConsentimentos(cons, "clinico", "aceitos").map((c) => c.id), ["c1"]);

console.log(`lgpd: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}]`);
if (falhas) process.exit(1);
