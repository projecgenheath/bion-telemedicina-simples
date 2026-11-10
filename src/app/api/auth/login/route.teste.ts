/**
 * Testes estáticos da rota de login (sem banco e sem senha).
 * Rodar: bun src/app/api/auth/login/route.teste.ts
 *
 * Garante que o caminho legado (Prisma conferiu a senha, Auth falhou)
 * não devolve 200 sem sessão: confere o sign-in, sincroniza a senha no
 * Auth quando dá, e cai no cookie legado se ainda assim não houver sessão.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const rota = readFileSync(path.join(raiz, "src/app/api/auth/login/route.ts"), "utf8");
const legado = rota.slice(rota.indexOf("Conta legada Prisma"));
let ok = 0;
let falhas = 0;
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}`);
  }
}

const signIns = legado.split("signInWithPassword");
checa("caminho legado chama signInWithPassword", signIns.length >= 3);
checa(
  "caminho legado guarda o erro do sign-in (error: erroSessao)",
  legado.includes("error: erroSessao") && legado.includes("signInWithPassword"),
);
checa(
  "se o Auth falhar, sincroniza a senha já conferida no Prisma",
  legado.includes("updateUserById") && legado.includes("password: senha") && legado.includes("erroSessao && supabaseId"),
);
checa(
  "tenta o sign-in de novo depois de sincronizar a senha",
  /updateUserById[\s\S]*signInWithPassword[\s\S]*criarSessaoLegada/.test(legado),
);
checa(
  "se o Auth continuar sem sessão, cria o cookie legado",
  /if \(erroSessao\)[\s\S]*criarSessaoLegada\(legado\.id\)/.test(legado),
);
checa(
  "não chama signInWithPassword no legado sem guardar o resultado",
  !/^\s*await supabase\.auth\.signInWithPassword\(\{ email: emailNormado, password: senha \}\);/m.test(legado),
);
checa(
  "login não interpola e-mail ou senha no console.warn",
  !/console\.warn\([^)]*\$\{(emailNormado|senha|legado\.email)/.test(legado) &&
    !/console\.warn\([^)]*,\s*(emailNormado|senha|legado\.email)/.test(legado),
);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
