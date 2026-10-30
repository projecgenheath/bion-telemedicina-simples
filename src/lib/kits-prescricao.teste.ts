/**
 * Testes dos kits de receita e pacotes de exames (melhoria nº 16 da
 * auditoria médica): persistência NESTE APARELHO (localStorage por
 * médico), com exemplos que podem ser ocultados e leitura defensiva.
 * Rodar: bun src/lib/kits-prescricao.teste.ts
 */
import {
  bancoVazio,
  gravarBancoKits,
  kitDoFormulario,
  kitsVisiveis,
  lerBancoKits,
  pacoteDoFormulario,
  pacotesVisiveis,
  removerItemKit,
  salvarKitReceita,
  salvarPacoteExames,
  type ArmazenamentoKits,
  type BancoKits,
} from "./kits-prescricao";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}
function checa(nome: string, cond: boolean) {
  if (cond) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}`);
  }
}

function armazenamentoMemoria(): ArmazenamentoKits & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  return {
    mapa,
    getItem: (k) => mapa.get(k) ?? null,
    setItem: (k, v) => {
      mapa.set(k, v);
    },
  };
}

// Banco vazio: só os exemplos aparecem.
igual("vazio: kits visíveis são os 3 exemplos", kitsVisiveis(bancoVazio()).length, 3);
igual("vazio: pacotes visíveis são os 3 exemplos", pacotesVisiveis(bancoVazio()).length, 3);
checa("exemplos marcados como exemplo", kitsVisiveis(bancoVazio()).every((k) => k.exemplo === true));

// Salvar um kit do médico: entra depois dos exemplos e persiste.
const kit = kitDoFormulario({ nome: "Meu kit", medicamento: "Amoxicilina 500 mg", posologia: "1 cápsula de 8/8h", duracao: "7 dias", controlado: false });
checa("kit do formulário válido", kit !== null);
let banco: BancoKits = salvarKitReceita(bancoVazio(), kit!);
igual("após salvar: 4 kits visíveis", kitsVisiveis(banco).length, 4);
igual("kit do médico é o último", kitsVisiveis(banco)[3]?.nome, "Meu kit");

const store = armazenamentoMemoria();
gravarBancoKits(store, "med-1", banco);
igual("persistiu sob a chave do médico", [...store.mapa.keys()], ["bion-medico-kits:med-1"]);
const relido = lerBancoKits(store, "med-1");
igual("relido: kit do médico presente", relido.kits.map((k) => k.nome), ["Meu kit"]);
igual("outro médico lê banco vazio", lerBancoKits(store, "med-2").kits, []);

// Formulário incompleto não vira kit/pacote.
igual("kit sem duração não salva", kitDoFormulario({ nome: "X", medicamento: "Y", posologia: "Z", duracao: "", controlado: false }), null);
igual("pacote sem exames não salva", pacoteDoFormulario({ nome: "X", exames: " " }), null);
const pacote = pacoteDoFormulario({ nome: "Meus exames", exames: "Hemograma, TSH" });
checa("pacote do formulário válido", pacote !== null);
banco = salvarPacoteExames(banco, pacote!);
igual("após salvar pacote: 4 visíveis", pacotesVisiveis(banco).length, 4);

// Remover kit do médico some da lista; remover exemplo só oculta (e persiste).
banco = removerItemKit(banco, kit!.id);
igual("kit do médico removido", kitsVisiveis(banco).length, 3);
banco = removerItemKit(banco, "ex-kit-dipirona");
igual("exemplo ocultado sai da lista", kitsVisiveis(banco).map((k) => k.id), ["ex-kit-loratadina", "ex-kit-omeprazol"]);
gravarBancoKits(store, "med-1", banco);
igual("ocultação persiste na releitura", kitsVisiveis(lerBancoKits(store, "med-1")).length, 2);

// Leitura defensiva: JSON corrompido e itens malformados não quebram.
const storeRuim = armazenamentoMemoria();
storeRuim.setItem("bion-medico-kits:med-9", "{json quebrado");
igual("json corrompido vira banco vazio", lerBancoKits(storeRuim, "med-9"), bancoVazio());
storeRuim.setItem("bion-medico-kits:med-9", JSON.stringify({ kits: [{ id: 7, nome: null }, { id: "k1", nome: "Bom", medicamento: "X", posologia: "Y", duracao: "Z", controlado: false }], pacotes: "não-array", exemplosOcultos: [1, "ex-pac-tireoide"] }));
const filtrado = lerBancoKits(storeRuim, "med-9");
igual("itens malformados são filtrados", filtrado.kits.map((k) => k.id), ["k1"]);
igual("pacotes malformados viram lista vazia", filtrado.pacotes, []);
igual("exemplos ocultos malformados filtrados", filtrado.exemplosOcultos, ["ex-pac-tireoide"]);

console.log(`kits-prescricao: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
