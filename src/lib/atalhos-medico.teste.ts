/**
 * Modelos e kits na conta do médico. Rodar: bun src/lib/atalhos-medico.teste.ts
 */
import { bancoVazio, type BancoKits } from "./kits-prescricao";
import {
  bancoTemConteudo,
  mesclarCampoConta,
  normalizarBancoKits,
  normalizarModelosMensagem,
} from "./atalhos-medico";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}

igual("modelo vazio", normalizarModelosMensagem("não"), []);
igual("corta e tira duplicata", normalizarModelosMensagem(["  oi  ", "oi", "", 1, "olá"]), ["oi", "olá"]);
igual("teto de 12", normalizarModelosMensagem(Array.from({ length: 20 }, (_, i) => `m${i}`)).length, 12);

const banco = normalizarBancoKits({
  kits: [{ id: "k1", nome: " Dor ", medicamento: "Dipirona", posologia: "1 cp", duracao: "5 dias", controlado: false, exemplo: true }],
  pacotes: [{ id: "p1", nome: "Check", exames: "TSH" }],
  exemplosOcultos: ["ex-kit-dipirona", 3],
});
igual("kit sem flag de exemplo", banco.kits[0]?.exemplo, undefined);
igual("pacote", banco.pacotes[0]?.exames, "TSH");
igual("oculto só texto", banco.exemplosOcultos, ["ex-kit-dipirona"]);
igual("lixo vira vazio", normalizarBancoKits("{{"), bancoVazio());
igual("tem conteúdo", bancoTemConteudo(banco), true);
igual("vazio não tem", bancoTemConteudo(bancoVazio()), false);

const local: BancoKits = { ...bancoVazio(), kits: banco.kits };
igual("conta cheia ganha", mesclarCampoConta(banco, local, (b) => !bancoTemConteudo(b)), { valor: banco, enviarLocal: false });
igual("conta vazia sobe o aparelho", mesclarCampoConta(bancoVazio(), local, (b) => !bancoTemConteudo(b)), { valor: local, enviarLocal: true });
igual("os dois vazios não enviam", mesclarCampoConta(bancoVazio(), bancoVazio(), (b) => !bancoTemConteudo(b)), {
  valor: bancoVazio(),
  enviarLocal: false,
});
igual("lista da conta ganha", mesclarCampoConta(["a"], ["b"], (l) => l.length === 0), { valor: ["a"], enviarLocal: false });

console.log(`atalhos-medico: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
