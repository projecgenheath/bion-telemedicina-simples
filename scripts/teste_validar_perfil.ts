/**
 * Teste unitário dos validadores do PATCH /api/perfil (achados A1/A2).
 * Uso: bun scripts/teste_validar_perfil.ts   (ou: bunx tsx scripts/teste_validar_perfil.ts)
 */
import { validarCpf, validarPatchPerfil, validarTelefone } from "../src/lib/server/validar-perfil";

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

// --- telefone ---
verificar("telefone celular ok", validarTelefone("(11) 91234-5678").ok);
verificar("telefone +55 ok", validarTelefone("+55 11 91234-5678").ok);
verificar("telefone curto → erro", !validarTelefone("1234").ok);
verificar("telefone com letras → erro", !validarTelefone("ligar 1191234-5678").ok);
verificar("telefone vazio limpa", validarTelefone("").ok);

console.log(`\n${passou} ok, ${falhou} falha(s)`);
if (falhou) process.exit(1);
