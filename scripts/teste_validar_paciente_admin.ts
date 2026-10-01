/**
 * Teste unitário da validação do cadastro/edição de paciente pelo ADMIN
 * (POST /api/pacientes e PATCH /api/pacientes/[id]).
 * Uso: bun scripts/teste_validar_paciente_admin.ts
 */
import { campoDuplicadoPrisma, validarPacienteAdmin } from "../src/lib/server/validar-paciente-admin";
import { dataNascimentoParaIso } from "../src/lib/idade";

let passou = 0;
let falhou = 0;

function verificar(nome: string, cond: boolean, detalhe?: unknown) {
  if (cond) {
    passou++;
  } else {
    falhou++;
    console.error(`✗ ${nome}`, detalhe ?? "");
  }
}

// "Agora" fixo: 30/09/2026 22:00 em São Paulo (01/10/2026 01:00 UTC).
const AGORA = new Date("2026-10-01T01:00:00Z");
const v = (corpo: unknown, atual?: { cpf: string; telefone: string }) =>
  validarPacienteAdmin(corpo, { agora: AGORA, ...(atual ? { atual } : {}) });

// --- corpo / whitelist ---
verificar("corpo null → erro", !v(null).ok);
verificar("corpo array → erro", !v([]).ok);
{
  const r = v({ id: "x", desde: "01/01/2020", email: "a@b.c", role: "ADMIN" });
  verificar("ignora chaves desconhecidas", r.ok && r.valor.campos.length === 0 && Object.keys(r.valor.dados).length === 0, r);
}

// --- data de nascimento ---
{
  const r = v({ dataNascimento: "1990-05-17" });
  verificar(
    "data válida → Date meia-noite UTC + idade calculada",
    r.ok &&
      r.valor.dados.dataNascimento instanceof Date &&
      dataNascimentoParaIso(r.valor.dados.dataNascimento) === "1990-05-17" &&
      r.valor.dados.dataNascimento.toISOString() === "1990-05-17T00:00:00.000Z" &&
      r.valor.dados.idade === 36 &&
      r.valor.campos.includes("dataNascimento") &&
      r.valor.campos.includes("idade"),
    r,
  );
}
{
  const r = v({ dataNascimento: "1990-05-17", idade: 10 });
  verificar("data vence idade enviada junto", r.ok && r.valor.dados.idade === 36, r);
}
{
  // Aniversário "amanhã" em SP (01/10) ainda não chegou, embora em UTC já seja 01/10.
  const r = v({ dataNascimento: "2000-10-01" });
  verificar("idade pelo dia de São Paulo, não UTC", r.ok && r.valor.dados.idade === 25, r);
}
{
  const r = v({ dataNascimento: "2026-09-30" });
  verificar("nascido hoje (SP) → idade 0", r.ok && r.valor.dados.idade === 0, r);
}
verificar("data futura (amanhã em SP) → erro", !v({ dataNascimento: "2026-10-01" }).ok);
verificar("data futura distante → erro", !v({ dataNascimento: "2030-01-01" }).ok);
verificar("idade > 130 → erro", !v({ dataNascimento: "1890-01-01" }).ok);
verificar("31/02 → erro", !v({ dataNascimento: "1990-02-31" }).ok);
verificar("formato BR → erro", !v({ dataNascimento: "17/05/1990" }).ok);
verificar("com hora → erro", !v({ dataNascimento: "1990-05-17T03:00:00Z" }).ok);
verificar("número → erro", !v({ dataNascimento: 19900517 }).ok);
{
  const r = v({ dataNascimento: "1990-05-17" });
  const e = v({ dataNascimento: "2030-01-01" });
  verificar("erro de data tem campo", !e.ok && e.campo === "dataNascimento" && r.ok, e);
}
{
  const r = v({ dataNascimento: null });
  verificar("null limpa a data", r.ok && r.valor.dados.dataNascimento === null && r.valor.dados.idade === undefined, r);
  const r2 = v({ dataNascimento: "" });
  verificar("'' limpa a data", r2.ok && r2.valor.dados.dataNascimento === null, r2);
}

// --- CPF ---
{
  const r = v({ cpf: "52998224725" });
  verificar("CPF válido sem máscara → formatado", r.ok && r.valor.dados.cpf === "529.982.247-25", r);
}
{
  const e = v({ cpf: "123.456.789-00" });
  verificar("CPF com DV errado → erro (campo cpf)", !e.ok && e.campo === "cpf", e);
}
verificar("CPF repetido (111...) → erro", !v({ cpf: "111.111.111-11" }).ok);
verificar("CPF número → erro", !v({ cpf: 52998224725 }).ok);
{
  const r = v({ cpf: "" });
  verificar("CPF '' limpa (cadastro)", r.ok && r.valor.dados.cpf === "", r);
}
{
  // Edição: CPF legado inválido reenviado igual → não revalida nem regrava.
  const r = v({ cpf: "123.456.789-00", status: "inativo" }, { cpf: "123.456.789-00", telefone: "" });
  verificar("edição: CPF legado igual ao gravado é ignorado", r.ok && r.valor.dados.cpf === undefined && r.valor.campos.join() === "status", r);
}
{
  const e = v({ cpf: "123.456.789-01" }, { cpf: "123.456.789-00", telefone: "" });
  verificar("edição: CPF NOVO inválido → erro", !e.ok, e);
}
{
  const r = v({ cpf: "52998224725" }, { cpf: "529.982.247-25", telefone: "" });
  verificar("edição: mesmo CPF só sem máscara → sem alteração", r.ok && r.valor.campos.length === 0, r);
}
{
  const r = v({ cpf: "529.982.247-25" }, { cpf: "123.456.789-00", telefone: "" });
  verificar("edição: admin pode corrigir CPF", r.ok && r.valor.dados.cpf === "529.982.247-25", r);
}

// --- telefone ---
{
  const r = v({ telefone: "+55 11 91234-5678" });
  verificar("telefone celular com +55 → normalizado", r.ok && r.valor.dados.telefone === "(11) 91234-5678", r);
}
{
  const e = v({ telefone: "1234" });
  verificar("telefone curto → erro (campo telefone)", !e.ok && e.campo === "telefone", e);
}
verificar("telefone com letras → erro", !v({ telefone: "11 9abc-1234" }).ok);
{
  const r = v({ telefone: "11 9999" }, { cpf: "", telefone: "11 9999" });
  verificar("edição: telefone legado igual é ignorado", r.ok && r.valor.dados.telefone === undefined, r);
}

// --- demais campos ---
verificar("idade fracionária → erro", !v({ idade: 30.5 }).ok);
verificar("idade negativa → erro", !v({ idade: -1 }).ok);
verificar("idade texto → erro", !v({ idade: "30" }).ok);
verificar("status desconhecido → erro", !v({ status: "admin" }).ok);
verificar("status inativo ok", (() => { const r = v({ status: "inativo" }); return r.ok && r.valor.dados.status === "inativo"; })());
verificar("nome curto → erro", !v({ nome: "Jo" }).ok);
verificar("nome número → erro", !v({ nome: 123 }).ok);
verificar("convênio vazio → Particular", (() => { const r = v({ convenio: "  " }); return r.ok && r.valor.dados.convenio === "Particular"; })());

// --- P2002 (índice único) ---
verificar("P2002 índice de CPF → cpf", campoDuplicadoPrisma({ code: "P2002", meta: { target: "PerfilPaciente_cpf_digitos_key" } }) === "cpf");
verificar("P2002 e-mail → email", campoDuplicadoPrisma({ code: "P2002", meta: { target: ["email"] } }) === "email");
verificar("P2002 sem meta → outro", campoDuplicadoPrisma({ code: "P2002" }) === "outro");
verificar("outro código → null", campoDuplicadoPrisma({ code: "P2025" }) === null);
verificar("Error comum → null", campoDuplicadoPrisma(new Error("x")) === null);

console.log(`\n${passou} ok, ${falhou} falha(s)`);
if (falhou) process.exit(1);
