/** Rodar: bun src/lib/telefone.teste.ts */
import { digitosTelefone, mascararTelefoneDigitacao } from "./telefone";

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

// --- digitosTelefone ---
igual("vazio", digitosTelefone(""), "");
igual("só dígitos", digitosTelefone("(11) 91234-5678"), "11912345678");
igual("com +55", digitosTelefone("+55 11 91234-5678"), "11912345678");
igual("55 sem excesso fica", digitosTelefone("5511"), "5511");
igual("trunca em 11", digitosTelefone("11912345678999"), "11912345678");

// --- mascararTelefoneDigitacao (progressiva) ---
igual("máscara vazia", mascararTelefoneDigitacao(""), "");
igual("1 dígito", mascararTelefoneDigitacao("1"), "(1");
igual("DDD", mascararTelefoneDigitacao("11"), "(11");
igual("DDD + 1", mascararTelefoneDigitacao("119"), "(11) 9");
igual("DDD + 4", mascararTelefoneDigitacao("119123"), "(11) 9123");
igual("DDD + 5", mascararTelefoneDigitacao("1191234"), "(11) 9123-4");
igual("fixo completo", mascararTelefoneDigitacao("1131234567"), "(11) 3123-4567");
igual("celular completo", mascararTelefoneDigitacao("11912345678"), "(11) 91234-5678");
igual("celular já mascarado é idempotente", mascararTelefoneDigitacao("(11) 91234-5678"), "(11) 91234-5678");
igual("fixo já mascarado é idempotente", mascararTelefoneDigitacao("(11) 3123-4567"), "(11) 3123-4567");
igual("com +55 colado", mascararTelefoneDigitacao("+55 (11) 91234-5678"), "(11) 91234-5678");

console.log(`telefone: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
