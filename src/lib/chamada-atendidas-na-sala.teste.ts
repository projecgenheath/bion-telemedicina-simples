/**
 * Testes de lib/chamada-atendidas-na-sala.ts.
 * Rodar: bun src/lib/chamada-atendidas-na-sala.teste.ts
 */
import { _atendidasNaSala, marcarAtendidaNaSala, sincronizarUsuarioAtendidasNaSala } from "./chamada-atendidas-na-sala";

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

sincronizarUsuarioAtendidasNaSala("u1");
igual("primeira vez dispara", marcarAtendidaNaSala("u1", "c1", 1), true);
igual("mesma tentativa não dispara de novo (StrictMode/reenvio)", marcarAtendidaNaSala("u1", "c1", 1), false);
igual("outra tentativa dispara", marcarAtendidaNaSala("u1", "c1", 2), true);
igual("outra consulta dispara", marcarAtendidaNaSala("u1", "c2", 1), true);
igual("chave usuarioId:consultaId:tentativa", _atendidasNaSala().chaves, ["u1:c1:1", "u1:c1:2", "u1:c2:1"]);
igual("sem usuário não dispara", marcarAtendidaNaSala(undefined, "c9", 1), false);
igual("sem usuário não mexe no registro", _atendidasNaSala().chaves.length, 3);

// Logout (null) limpa; o mesmo usuário voltando pode atender de novo.
sincronizarUsuarioAtendidasNaSala(null);
igual("logout limpa", _atendidasNaSala(), { dono: null, chaves: [] });
igual("depois do logout a mesma tentativa dispara de novo", marcarAtendidaNaSala("u1", "c1", 1), true);

// Troca de usuário (outra conta no mesmo aparelho) limpa, inclusive via marcar.
igual("outro usuário na mesma consulta+tentativa dispara", marcarAtendidaNaSala("u2", "c1", 1), true);
igual("troca de usuário limpou as chaves do anterior", _atendidasNaSala(), { dono: "u2", chaves: ["u2:c1:1"] });
sincronizarUsuarioAtendidasNaSala("u2");
igual("sincronizar com o mesmo usuário não limpa", _atendidasNaSala().chaves, ["u2:c1:1"]);
sincronizarUsuarioAtendidasNaSala("u3");
igual("sincronizar com outro usuário limpa", _atendidasNaSala(), { dono: "u3", chaves: [] });
sincronizarUsuarioAtendidasNaSala("");
igual("id vazio conta como sem usuário", _atendidasNaSala().dono, null);

// Limite de memória.
sincronizarUsuarioAtendidasNaSala("u4");
for (let i = 0; i < 250; i++) marcarAtendidaNaSala("u4", `c${i}`, 1);
igual("limite de 200 chaves", _atendidasNaSala().chaves.length, 200);
igual("descarta as mais antigas", _atendidasNaSala().chaves[0], "u4:c50:1");

console.log(`chamada-atendidas-na-sala: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
