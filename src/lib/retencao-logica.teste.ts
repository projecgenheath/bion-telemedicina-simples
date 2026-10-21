/**
 * Testes dos prazos e da pseudonimização do cron de descarte (lib/retencao-logica.ts).
 * Rodar: bun src/lib/retencao-logica.teste.ts
 */
import { auditoriaDescartavel, CATEGORIAS_DESCARTE_AUDITORIA, filtroDescarteAuditoria, modoSimulacao, codigoPaciente, cortesRetencao, jaPseudonimizado, pseudonimizarTexto, subtrairMeses } from "./retencao-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}
const iso = (d: Date) => d.toISOString();

const agora = new Date("2026-10-21T06:00:00.000Z");
const c = cortesRetencao(agora);
igual("6 meses", iso(c.pseudonimizar), "2026-04-21T06:00:00.000Z");
igual("monitor 6 meses", iso(c.monitorIa), "2026-04-21T06:00:00.000Z");
igual("5 anos", iso(c.auditoria), "2021-10-21T06:00:00.000Z");
igual("31/08 − 6 = 28/02", iso(subtrairMeses(new Date("2026-08-31T12:00:00Z"), 6)), "2026-02-28T12:00:00.000Z");
igual("31/08 − 6 bissexto = 29/02", iso(subtrairMeses(new Date("2028-08-31T12:00:00Z"), 6)), "2028-02-29T12:00:00.000Z");
igual("virada de ano", iso(subtrairMeses(new Date("2026-03-15T00:00:00Z"), 6)), "2025-09-15T00:00:00.000Z");
igual("29/02 − 5 anos = 28/02", iso(subtrairMeses(new Date("2028-02-29T00:00:00Z"), 60)), "2023-02-28T00:00:00.000Z");
igual("um dia antes do corte entra", new Date("2026-04-20T06:00:00Z") < c.pseudonimizar, true);
igual("um dia depois do corte não entra", new Date("2026-04-22T06:00:00Z") < c.pseudonimizar, false);

const cod = codigoPaciente("cluser123");
igual("código estável", codigoPaciente("cluser123"), cod);
igual("formato", /^PAC-[0-9A-F]{8}$/.test(cod), true);
igual("ids diferentes, códigos diferentes", codigoPaciente("cluser124") !== cod, true);
igual("jaPseudonimizado", [jaPseudonimizado(cod), jaPseudonimizado("Maria")], [true, false]);

const n = "João da Silva";
igual("troca no assunto", pseudonimizarTexto('Chamado "x" aberto por João da Silva (tecnico)', n, cod), `Chamado "x" aberto por ${cod} (tecnico)`);
igual("maiúsculas", pseudonimizarTexto("JOÃO DA SILVA pediu", n, cod), `${cod} pediu`);
igual("sem acento", pseudonimizarTexto("Sou o Joao da Silva", n, cod), `Sou o ${cod}`);
igual("espaços extras", pseudonimizarTexto("João  da\nSilva", n, cod), cod);
igual("várias vezes", pseudonimizarTexto("João da Silva e João da Silva", n, cod), `${cod} e ${cod}`);
igual("não troca dentro de palavra", pseudonimizarTexto("Anaclara", "Ana", cod), "Anaclara");
igual("palavra inteira", pseudonimizarTexto("Oi, Ana.", "Ana", cod), `Oi, ${cod}.`);
igual("nome curto ignorado", pseudonimizarTexto("Li o laudo", "Li", cod), "Li o laudo");
igual("caracteres de regex no nome", pseudonimizarTexto("por Ana (Bia)", "Ana (Bia)", cod), `por ${cod}`);
const uma = pseudonimizarTexto("por João da Silva", n, cod);
igual("idempotente", pseudonimizarTexto(uma, n, cod), uma);
igual("texto sem nome inalterado", pseudonimizarTexto("Problema no vídeo", n, cod), "Problema no vídeo");

// Allowlist do descarte de 5 anos
igual("allowlist", [...CATEGORIAS_DESCARTE_AUDITORIA], ["autenticacao", "suporte", "sistema"]);
igual("login apaga", auditoriaDescartavel({ acao: "LOGIN", categoria: "autenticacao" }), true);
igual("suporte apaga", auditoriaDescartavel({ acao: "TICKET_RESPONDIDO", categoria: "suporte", entidade: "ticket" }), true);
igual("sistema apaga", auditoriaDescartavel({ acao: "RETENCAO_DESCARTE_CRON", categoria: "sistema", entidade: "Retencao" }), true);
for (const cat of ["prontuario", "documento", "consentimento", "consulta", "admin", "usuario", "financeiro"])
  igual(`categoria ${cat} nunca`, auditoriaDescartavel({ acao: "X", categoria: cat }), false);
for (const cat of ["autenticacao", "suporte", "sistema"]) {
  for (const acao of ["CONSENTIMENTO_REGISTRADO", "CONSENTIMENTO_IA_EXAME", "CONSENTIMENTO_IA_EXAME_REVOGADO",
    "EXCLUSAO_CONTA_SOLICITADA_PENDENTE", "EXCLUSAO_CONTA_FALHOU", "repasse_pago", "repasse_fechado_cron",
    "PRONTUARIO_PDF_EXPORTADO", "DOCUMENTO_VISUALIZADO", "DOCUMENTO_PDF_BAIXADO", "ARQUIVO_ENVIADO", "documento"])
    igual(`${acao} em ${cat} nunca`, auditoriaDescartavel({ acao, categoria: cat }), false);
  for (const entidade of ["prontuario", "documento", "arquivo", "Repasse", "pagamento", "consentimento"])
    igual(`entidade ${entidade} em ${cat} nunca`, auditoriaDescartavel({ acao: "ACESSO", categoria: cat, entidade }), false);
}
const f = filtroDescarteAuditoria(c.auditoria);
igual("filtro usa a allowlist", f.categoria.in, ["autenticacao", "suporte", "sistema"]);
igual("filtro tem corte", f.createdAt.lt === c.auditoria, true);
const txt = JSON.stringify(f);
for (const k of ["CONSENTIMENTO_", "REPASSE_", "PRONTUARIO_", "DOCUMENTO_", "EXCLUSAO_CONTA_FALHOU", "EXCLUSAO_CONTA_SOLICITADA_PENDENTE", "insensitive", "\"entidade\":null"])
  igual(`filtro exclui ${k}`, txt.includes(k), true);

// Simulação (dryRun)
igual("padrão sem env simula", modoSimulacao(undefined, null), true);
igual("env 0 simula", modoSimulacao("0", null), true);
igual("env true não ativa", modoSimulacao("true", null), true);
igual("env 1 ativa", modoSimulacao("1", null), false);
igual("env 1 + dryRun=1 simula", modoSimulacao("1", "1"), true);
igual("env 1 + dryRun=true simula", modoSimulacao("1", "true"), true);
igual("env 1 + dryRun=0 ativa", modoSimulacao("1", "0"), false);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
