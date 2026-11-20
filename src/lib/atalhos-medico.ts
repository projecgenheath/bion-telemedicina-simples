/**
 * Modelos de mensagem, kits de receita e pacotes de exame do médico.
 * A conta (tabela AtalhoMedico) é a fonte. O aparelho guarda uma cópia
 * para a tela abrir rápido e para não perder o que foi salvo sem rede.
 * Funções puras: a rota e a tela decidem quando gravar.
 */
import {
  bancoVazio,
  lerBancoKits,
  type ArmazenamentoKits,
  type BancoKits,
  type KitReceita,
  type PacoteExames,
} from "./kits-prescricao";

export const LIMITE_MODELOS_MENSAGEM = 12;
/** Igual ao teto do texto da mensagem (POST /api/mensagens). */
export const LIMITE_TEXTO_MODELO = 4000;
export const LIMITE_KITS = 40;
export const LIMITE_JSON_ATALHOS = 80_000;

export function normalizarModelosMensagem(bruto: unknown): string[] {
  const arr = Array.isArray(bruto) ? bruto : [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const texto = item.trim().slice(0, LIMITE_TEXTO_MODELO);
    if (!texto || vistos.has(texto)) continue;
    vistos.add(texto);
    saida.push(texto);
    if (saida.length >= LIMITE_MODELOS_MENSAGEM) break;
  }
  return saida;
}

function cortarKit(k: KitReceita): KitReceita {
  return {
    id: k.id.slice(0, 80),
    nome: k.nome.trim().slice(0, 80),
    medicamento: k.medicamento.trim().slice(0, 200),
    posologia: k.posologia.trim().slice(0, 500),
    duracao: k.duracao.trim().slice(0, 80),
    controlado: k.controlado,
  };
}

function cortarPacote(p: PacoteExames): PacoteExames {
  return {
    id: p.id.slice(0, 80),
    nome: p.nome.trim().slice(0, 80),
    exames: p.exames.trim().slice(0, 2000),
  };
}

/** Lê o JSON da conta ou do aparelho e descarta o que não passa na validação dos kits. */
export function normalizarBancoKits(bruto: unknown): BancoKits {
  let texto = "";
  if (typeof bruto === "string") texto = bruto;
  else if (bruto && typeof bruto === "object") {
    try {
      texto = JSON.stringify(bruto);
    } catch {
      return bancoVazio();
    }
  } else return bancoVazio();
  if (texto.length > LIMITE_JSON_ATALHOS) return bancoVazio();
  const storage: ArmazenamentoKits = { getItem: () => texto, setItem: () => {} };
  const banco = lerBancoKits(storage, "conta");
  return {
    kits: banco.kits.slice(0, LIMITE_KITS).map(cortarKit).filter((k) => k.nome && k.medicamento && k.posologia && k.duracao),
    pacotes: banco.pacotes.slice(0, LIMITE_KITS).map(cortarPacote).filter((p) => p.nome && p.exames),
    exemplosOcultos: banco.exemplosOcultos.slice(0, LIMITE_KITS),
  };
}

export function bancoTemConteudo(banco: BancoKits): boolean {
  return banco.kits.length > 0 || banco.pacotes.length > 0 || banco.exemplosOcultos.length > 0;
}

/**
 * Primeira leitura: a conta ganha se já tem algo. Se a conta está vazia
 * e o aparelho tem algo, o aparelho sobe. Os dois vazios ficam vazios
 * (não grava por gravar).
 */
export function mesclarCampoConta<T>(servidor: T, local: T, vazio: (valor: T) => boolean): { valor: T; enviarLocal: boolean } {
  if (!vazio(servidor)) return { valor: servidor, enviarLocal: false };
  if (!vazio(local)) return { valor: local, enviarLocal: true };
  return { valor: servidor, enviarLocal: false };
}
