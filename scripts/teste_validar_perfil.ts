/**
 * Teste unitário dos validadores do PATCH /api/perfil (achados A1/A2).
 * Uso: bun scripts/teste_validar_perfil.ts   (ou: bunx tsx scripts/teste_validar_perfil.ts)
 */
import {
  FOTO_MAX_CHARS,
  cpfPodeSerAlterado,
  validarCpf,
  validarFotoPerfil,
  validarPatchPerfil,
  validarTelefone,
} from "../src/lib/server/validar-perfil";
import {
  alturaCanonica,
  calcularImc,
  formatarAltura,
  formatarPeso,
  lerAlturaCm,
  lerPesoKg,
  pesoCanonico,
} from "../src/lib/medidas-paciente";
import {
  dataNascimentoParaIso,
  formatarDataNascimento,
  hojeEmSaoPaulo,
  hojeIsoSaoPaulo,
  idadeDeNascimento,
  isoParaDataNascimento,
  lerDataIso,
} from "../src/lib/idade";
import { validarDataNascimento } from "../src/lib/server/validar-perfil";
import { anonimizarMensagensIa, removerIdentificadores } from "../src/lib/server/anonimizar-ia";

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

// --- corpo / whitelist ---
verificar("rejeita corpo null", !validarPatchPerfil(null).ok);
verificar("rejeita corpo array", !validarPatchPerfil([]).ok);
{
  const r = validarPatchPerfil({ email: "x@y.z", role: "ADMIN", qualquer: 1 });
  verificar("ignora chaves desconhecidas", r.ok && r.valor.campos.length === 0 && !("role" in r.valor.perfil), r);
}

// --- listas clínicas ---
verificar("alergias null → erro", !validarPatchPerfil({ alergias: null }).ok);
verificar("alergias string → erro", !validarPatchPerfil({ alergias: "penicilina" }).ok);
verificar("alergias com número → erro", !validarPatchPerfil({ alergias: ["a", 1] }).ok);
{
  const r = validarPatchPerfil({ alergias: [" Dipirona ", "", "dipirona", "Frutos  do mar"] });
  verificar(
    "alergias normalizadas (trim, vazios, duplicatas)",
    r.ok && r.valor.perfil.alergias === JSON.stringify(["Dipirona", "Frutos do mar"]),
    r,
  );
}
verificar("lista > 50 itens → erro", !validarPatchPerfil({ medicamentos: Array.from({ length: 51 }, (_, i) => `m${i}`) }).ok);
verificar("item > 120 chars → erro", !validarPatchPerfil({ comorbidades: ["x".repeat(121)] }).ok);

// --- tipos primitivos ---
verificar("nome número → erro", !validarPatchPerfil({ nome: 123 }).ok);
verificar("nome curto → erro", !validarPatchPerfil({ nome: "ab" }).ok);
verificar("nome longo → erro", !validarPatchPerfil({ nome: "a".repeat(121) }).ok);
verificar("idade string → erro", !validarPatchPerfil({ idade: "abc" }).ok);
verificar("idade negativa → erro", !validarPatchPerfil({ idade: -1 }).ok);
verificar("idade 999 → erro", !validarPatchPerfil({ idade: 999 }).ok);
verificar("idade 42 ok", validarPatchPerfil({ idade: 42 }).ok);
verificar("tipo sanguíneo inválido → erro", !validarPatchPerfil({ tipoSanguineo: "Z+" }).ok);
{
  const r = validarPatchPerfil({ tipoSanguineo: " ab+ " });
  verificar("tipo sanguíneo normalizado", r.ok && r.valor.perfil.tipoSanguineo === "AB+", r);
}
{
  const r = validarPatchPerfil({ peso: "", altura: 165 });
  verificar("peso '' → null, altura número → string", r.ok && r.valor.perfil.peso === null && r.valor.perfil.altura === "165", r);
}

// --- M3: peso/altura (leitura tolerante, gravação canônica kg/cm) ---
for (const [entrada, esperado] of [
  [62, 62], ["62", 62], ["62 kg", 62], ["62kg", 62], ["62,5", 62.5], ["62.5 kg", 62.5], [" 62,54 Kg ", 62.5], ["62 quilos", 62],
] as const) {
  verificar(`lerPesoKg(${JSON.stringify(entrada)}) = ${esperado}`, lerPesoKg(entrada) === esperado, lerPesoKg(entrada));
}
for (const entrada of ["", "abc", "62 lb", "5", "999", "-62", null, undefined, Number.NaN, "62 kg kg"]) {
  verificar(`lerPesoKg(${JSON.stringify(entrada)}) = null`, lerPesoKg(entrada) === null, lerPesoKg(entrada));
}
for (const [entrada, esperado] of [
  [168, 168], ["168", 168], ["168 cm", 168], ["168cm", 168], ["1,68", 168], ["1,68 m", 168], ["1.68m", 168], ["1,685", 168.5], ["2 metros", 200],
] as const) {
  verificar(`lerAlturaCm(${JSON.stringify(entrada)}) = ${esperado}`, lerAlturaCm(entrada) === esperado, lerAlturaCm(entrada));
}
for (const entrada of ["", "alto", "1,68 kg", "16800", "30", "3,5", null, "1,68 m cm"]) {
  verificar(`lerAlturaCm(${JSON.stringify(entrada)}) = null`, lerAlturaCm(entrada) === null, lerAlturaCm(entrada));
}
verificar("legado '62 kg' → canônico '62'", pesoCanonico("62 kg") === "62");
verificar("legado '1,68 m' → canônico '168'", alturaCanonica("1,68 m") === "168");
verificar("legado inválido → undefined", pesoCanonico("muito") === undefined && alturaCanonica(null) === undefined);
verificar("exibe '62 kg' (unidade 1x)", formatarPeso("62 kg") === "62 kg", formatarPeso("62 kg"));
verificar("exibe '62,5 kg'", formatarPeso("62.5") === "62,5 kg", formatarPeso("62.5"));
verificar("exibe '168 cm' a partir de '1,68 m'", formatarAltura("1,68 m") === "168 cm", formatarAltura("1,68 m"));
verificar("exibe '' para vazio", formatarPeso(undefined) === "" && formatarAltura("") === "");
{
  const imc = calcularImc(lerPesoKg("62 kg"), lerAlturaCm("1,68 m"));
  verificar("IMC 62 kg / 1,68 m ≈ 22,0", imc !== null && Math.abs(imc - 21.97) < 0.01, imc);
  verificar("IMC com altura '1,68' (sem unidade) não vira 219.671", (calcularImc(62, lerAlturaCm("1,68")) ?? 0) < 30);
  verificar("IMC sem altura → null", calcularImc(62, null) === null);
  verificar("IMC NaN → null", calcularImc(Number.NaN, 168) === null);
}
{
  const r = validarPatchPerfil({ peso: "62 kg", altura: "1,68 m" });
  verificar("PATCH grava canônico (62 / 168)", r.ok && r.valor.perfil.peso === "62" && r.valor.perfil.altura === "168", r);
}
{
  const r = validarPatchPerfil({ peso: "62,5", altura: "168 cm" });
  verificar("PATCH grava canônico (62.5 / 168)", r.ok && r.valor.perfil.peso === "62.5" && r.valor.perfil.altura === "168", r);
}
verificar("PATCH peso fora da faixa → erro", !validarPatchPerfil({ peso: "5" }).ok);
verificar("PATCH altura absurda → erro", !validarPatchPerfil({ altura: "16800" }).ok);
verificar("PATCH peso texto → erro", !validarPatchPerfil({ peso: "setenta" }).ok);
verificar("PATCH peso objeto → erro", !validarPatchPerfil({ peso: { kg: 62 } }).ok);
verificar("PATCH altura null limpa", (() => { const r = validarPatchPerfil({ altura: null }); return r.ok && r.valor.perfil.altura === null; })());
{
  const r = validarPatchPerfil({ convenio: "  " });
  verificar("convênio vazio → Particular", r.ok && r.valor.perfil.convenio === "Particular", r);
}

// --- CPF ---
verificar("CPF válido com máscara", validarCpf("529.982.247-25").ok);
{
  const r = validarCpf("52998224725");
  verificar("CPF formatado na saída", r.ok && r.valor === "529.982.247-25", r);
}
verificar("CPF DV errado → erro", !validarCpf("529.982.247-24").ok);
verificar("CPF repetido → erro", !validarCpf("111.111.111-11").ok);
verificar("CPF com letras → erro", !validarCpf("abc").ok);
verificar("CPF vazio limpa", validarCpf("").ok);
// M4: CPF travado após o primeiro valor válido
verificar("CPF: perfil sem CPF pode definir", cpfPodeSerAlterado("", "529.982.247-25"));
verificar("CPF: legado inválido pode ser corrigido", cpfPodeSerAlterado("123.456.789-00", "529.982.247-25"));
verificar("CPF: mesmo valor (sem máscara no banco) é aceito", cpfPodeSerAlterado("52998224725", "529.982.247-25"));
verificar("CPF: trocar CPF válido → bloqueado", !cpfPodeSerAlterado("529.982.247-25", "111.444.777-35"));
verificar("CPF: apagar CPF válido → bloqueado", !cpfPodeSerAlterado("529.982.247-25", ""));
verificar("CPF: null no banco pode definir", cpfPodeSerAlterado(null, "529.982.247-25"));

// --- telefone ---
verificar("telefone celular ok", validarTelefone("(11) 91234-5678").ok);
verificar("telefone +55 ok", validarTelefone("+55 11 91234-5678").ok);
verificar("telefone curto → erro", !validarTelefone("1234").ok);
verificar("telefone com letras → erro", !validarTelefone("ligar 1191234-5678").ok);
verificar("telefone vazio limpa", validarTelefone("").ok);
// M4: telefone brasileiro normalizado
for (const [entrada, esperado] of [
  ["(11) 91234-5678", "(11) 91234-5678"],
  ["11912345678", "(11) 91234-5678"],
  ["+55 11 91234-5678", "(11) 91234-5678"],
  ["5511912345678", "(11) 91234-5678"],
  ["(21) 3123-4567", "(21) 3123-4567"],
  ["021 3123-4567", "(21) 3123-4567"],
  ["011 91234-5678", "(11) 91234-5678"],
  ["(55) 99876-5432", "(55) 99876-5432"],
] as const) {
  const r = validarTelefone(entrada);
  verificar(`telefone ${entrada} → ${esperado}`, r.ok && r.valor === esperado, r);
}
for (const entrada of ["(01) 91234-5678", "(10) 91234-5678", "(11) 81234-5678", "(11) 9123-4567", "(11) 1123-4567", "+1 415 555 0100", "123456789012345"]) {
  verificar(`telefone ${entrada} → erro`, !validarTelefone(entrada).ok, validarTelefone(entrada));
}

// --- M4: data de nascimento → idade (America/Sao_Paulo) ---
{
  // 01/10/2026 02:30 UTC = 30/09/2026 23:30 em São Paulo (UTC-3): ainda é dia 30.
  const virada = new Date("2026-10-01T02:30:00Z");
  const h = hojeEmSaoPaulo(virada);
  verificar("hoje em SP usa o fuso, não UTC", h.ano === 2026 && h.mes === 9 && h.dia === 30, h);
  verificar("hojeIsoSaoPaulo", hojeIsoSaoPaulo(virada) === "2026-09-30", hojeIsoSaoPaulo(virada));
  verificar("aniversário amanhã (SP) ainda não conta", idadeDeNascimento("1994-10-01", virada) === 31, idadeDeNascimento("1994-10-01", virada));
  verificar("aniversário hoje (SP) conta", idadeDeNascimento("1994-09-30", virada) === 32, idadeDeNascimento("1994-09-30", virada));
  verificar("data futura (SP) → null", idadeDeNascimento("2026-10-01", virada) === null);
  verificar("nascido hoje → 0", idadeDeNascimento("2026-09-30", virada) === 0);
  const meioDia = new Date("2026-09-30T15:00:00Z");
  verificar("idade simples", idadeDeNascimento("1990-01-15", meioDia) === 36);
  // 29/02: em ano não bissexto, faz aniversário em 01/03.
  verificar("29/02 em 28/02/2027 → ainda 26", idadeDeNascimento("2000-02-29", new Date("2027-02-28T15:00:00Z")) === 26);
  verificar("29/02 em 01/03/2027 → 27", idadeDeNascimento("2000-02-29", new Date("2027-03-01T15:00:00Z")) === 27);
}
for (const iso of ["2023-02-29", "1990-13-01", "1990-00-10", "1990-04-31", "90-01-01", "1990/01/01", "01/01/1990", "", "abc"]) {
  verificar(`lerDataIso(${JSON.stringify(iso)}) inválida`, lerDataIso(iso) === null, lerDataIso(iso));
}
verificar("lerDataIso 2024-02-29 válida", lerDataIso("2024-02-29") !== null);
verificar("lerDataIso não-string → null", lerDataIso(19900101) === null && lerDataIso(null) === null);
{
  const d = isoParaDataNascimento("1994-03-15");
  verificar("ISO → Date meia-noite UTC", d !== null && d.toISOString() === "1994-03-15T00:00:00.000Z", d);
  verificar("Date (DATE do Prisma) → ISO pelas partes UTC", dataNascimentoParaIso(new Date("1994-03-15T00:00:00Z")) === "1994-03-15");
  verificar("Date null → null", dataNascimentoParaIso(null) === null);
  verificar("DD/MM/AAAA", formatarDataNascimento("1994-03-15") === "15/03/1994");
  verificar("formatar inválida → ''", formatarDataNascimento("1994-02-30") === "" && formatarDataNascimento(null) === "");
}
{
  const agora = new Date("2026-09-30T15:00:00Z");
  const r = validarDataNascimento("1994-03-15", agora);
  verificar("validar data ok + idade", r.ok && r.valor !== null && r.valor.idade === 32, r);
  verificar("validar null limpa", (() => { const x = validarDataNascimento(null, agora); return x.ok && x.valor === null; })());
  verificar("validar '' limpa", (() => { const x = validarDataNascimento("", agora); return x.ok && x.valor === null; })());
  verificar("validar data inexistente → erro", !validarDataNascimento("1994-02-30", agora).ok);
  verificar("validar futuro → erro", !validarDataNascimento("2026-10-01", agora).ok);
  verificar("validar idade > 130 → erro", !validarDataNascimento("1895-01-01", agora).ok);
  verificar("validar idade 130 ok", validarDataNascimento("1896-01-01", agora).ok);
  verificar("validar número → erro", !validarDataNascimento(19940315, agora).ok);
  const p = validarPatchPerfil({ dataNascimento: "1994-03-15", idade: 99 }, agora);
  verificar(
    "PATCH com data grava data + idade calculada (vence idade enviada)",
    p.ok && p.valor.perfil.dataNascimento?.toISOString() === "1994-03-15T00:00:00.000Z" && p.valor.perfil.idade === 32 &&
      p.valor.campos.includes("dataNascimento"),
    p,
  );
  const limpa = validarPatchPerfil({ dataNascimento: null }, agora);
  verificar("PATCH data null limpa e mantém idade legada", limpa.ok && limpa.valor.perfil.dataNascimento === null && limpa.valor.perfil.idade === undefined, limpa);
  verificar("PATCH data inválida → 400", !validarPatchPerfil({ dataNascimento: "31/12/1990" }, agora).ok);
}

// --- M6: identificadores diretos fora do texto enviado à IA ---
{
  const ids = {
    nome: "Marina Souza da Costa",
    email: "marina@bion.com",
    cpf: "529.982.247-25",
    telefone: "(11) 98765-4321",
    dataNascimento: "1994-03-15",
  };
  const t = removerIdentificadores(
    "Sou Marina Souza da Costa, CPF 52998224725, tel 11987654321, nasci em 15/03/1994, marina@bion.com, CEP 01310-100",
    ids,
  );
  verificar("IA: nome completo removido", !/marina|souza|costa/i.test(t), t);
  verificar("IA: CPF removido", !t.includes("52998224725") && t.includes("[CPF removido]"), t);
  verificar("IA: telefone removido", !t.includes("11987654321") && t.includes("[telefone removido]"), t);
  verificar("IA: data de nascimento exata removida", !t.includes("15/03/1994"), t);
  verificar("IA: e-mail removido", !t.includes("marina@bion.com"), t);
  verificar("IA: CEP removido", !t.includes("01310-100"), t);
  const clinico = "Pressão 120/80, glicemia 99 mg/dL desde 10/09/2026, peso 62 kg, Losartana 50 mg 1x/dia, dor 7/10";
  verificar("IA: dado clínico preservado", removerIdentificadores(clinico, ids) === clinico, removerIdentificadores(clinico, ids));
  verificar("IA: primeiro nome isolado removido", removerIdentificadores("a marina disse", ids) === "a o paciente disse");
  verificar("IA: palavra que só contém o sobrenome fica", removerIdentificadores("Costela", ids) === "Costela");
  verificar("IA: CPF formatado de terceiro removido", removerIdentificadores("cpf 111.444.777-35", {}) === "cpf [CPF removido]");
  verificar("IA: celular com +55 removido", removerIdentificadores("+55 21 99876-5432", {}) === "[telefone removido]");
  verificar("IA: e-mail qualquer removido", removerIdentificadores("x.y@exemplo.com.br", {}) === "[e-mail removido]");
  verificar("IA: nome acentuado", removerIdentificadores("Fale com Ângela Érica", { nome: "Ângela Érica", substitutoNome: "o usuário" }) === "Fale com o usuário");
  const msgs = anonimizarMensagensIa([{ role: "user" as const, content: "sou a Marina" }], ids);
  verificar("IA: mensagens mantêm role", msgs[0].role === "user" && msgs[0].content === "sou a o paciente", msgs);
}

// --- foto (A2) ---
const JPEG_MIN = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");
const PNG_MIN = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]).toString("base64");
verificar("foto JPEG válida", validarFotoPerfil(JPEG_MIN).ok);
verificar("foto PNG válida", validarFotoPerfil(PNG_MIN).ok);
verificar("foto null remove", (() => { const r = validarFotoPerfil(null); return r.ok && r.valor === null; })());
verificar("foto '' remove", (() => { const r = validarFotoPerfil(""); return r.ok && r.valor === null; })());
verificar("foto número → erro", !validarFotoPerfil(1).ok);
verificar("foto URL externa → erro", !validarFotoPerfil("https://evil.example/x.png").ok);
verificar("foto javascript: → erro", !validarFotoPerfil("javascript:alert(1)").ok);
verificar("foto svg → erro", !validarFotoPerfil("data:image/svg+xml;base64,PHN2Zz4=").ok);
verificar("foto MIME mentindo (PNG declarado como JPEG) → erro", !validarFotoPerfil(PNG_MIN.replace("image/png", "image/jpeg")).ok);
verificar("foto texto em base64 → erro", !validarFotoPerfil("data:image/jpeg;base64," + Buffer.from("<html>oi</html>").toString("base64")).ok);
verificar("foto acima do limite → erro", !validarFotoPerfil(JPEG_MIN + "A".repeat(FOTO_MAX_CHARS)).ok);

console.log(`\n${passou} ok, ${falhou} falha(s)`);
if (falhou) process.exit(1);
