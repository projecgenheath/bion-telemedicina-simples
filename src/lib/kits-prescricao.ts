/**
 * Kits de receita e pacotes de exames (melhoria nº 16 da auditoria
 * médica): modelos reutilizáveis que o médico monta uma vez e reaplica
 * com 1 toque na emissão — em vez de redigitar a mesma combinação.
 *
 * PERSISTÊNCIA NESTE APARELHO (localStorage, chave por médico, mesmo
 * padrão da grade da agenda): NÃO há migração nem sincronização — os kits
 * vivem no aparelho em que foram criados, e a UI diz isso com todas as
 * letras ("Modelos deste aparelho"). Se um dia os kits virarem dado de
 * servidor, a troca é só da camada de leitura/escrita daqui.
 *
 * Como o Documento guarda UM medicamento, "kit de receita" é um
 * medicamento com posologia/duração (e a flag de controlado); "pacote de
 * exames" é uma lista nomeada de exames, aplicada no título/conteúdo da
 * solicitação (o conteúdo gerado da vitória rápida nº 5 acompanha).
 *
 * Funções puras sobre um armazenamento mínimo injetável (nos testes, um
 * objeto em memória; na tela, o localStorage).
 */

export type KitReceita = {
  id: string;
  nome: string;
  medicamento: string;
  posologia: string;
  duracao: string;
  controlado: boolean;
  /** Item de exemplo (vem com o app; pode ser ocultado, não editado). */
  exemplo?: boolean;
};

export type PacoteExames = {
  id: string;
  nome: string;
  /** Lista de exames em texto (um por linha ou separados por vírgula). */
  exames: string;
  exemplo?: boolean;
};

export type BancoKits = {
  kits: KitReceita[];
  pacotes: PacoteExames[];
  /** Ids dos exemplos que o médico apagou (não voltam a aparecer). */
  exemplosOcultos: string[];
};

export type ArmazenamentoKits = {
  getItem: (chave: string) => string | null;
  setItem: (chave: string, valor: string) => void;
};

/** Mesma convenção da grade (`bion-medico-grade:<id>` na AgendaSheet). */
export const chaveKits = (medicoId: string) => `bion-medico-kits:${medicoId}`;

export const KITS_EXEMPLO: KitReceita[] = [
  {
    id: "ex-kit-dipirona",
    nome: "Dor e febre — Dipirona",
    medicamento: "Dipirona 500 mg",
    posologia: "1 comprimido de 6 em 6 horas, se dor ou febre",
    duracao: "5 dias",
    controlado: false,
    exemplo: true,
  },
  {
    id: "ex-kit-loratadina",
    nome: "Rinite alérgica — Loratadina",
    medicamento: "Loratadina 10 mg",
    posologia: "1 comprimido ao dia",
    duracao: "30 dias",
    controlado: false,
    exemplo: true,
  },
  {
    id: "ex-kit-omeprazol",
    nome: "Dispepsia — Omeprazol",
    medicamento: "Omeprazol 20 mg",
    posologia: "1 cápsula ao dia, em jejum",
    duracao: "30 dias",
    controlado: false,
    exemplo: true,
  },
];

export const PACOTES_EXEMPLO: PacoteExames[] = [
  {
    id: "ex-pac-checkup",
    nome: "Check-up básico",
    exames: "Hemograma completo, Glicemia de jejum, Hemoglobina glicada, Colesterol total e frações, Triglicerídeos, TSH, Creatinina, Urina tipo 1",
    exemplo: true,
  },
  {
    id: "ex-pac-tireoide",
    nome: "Perfil tireoidiano",
    exames: "TSH, T4 livre",
    exemplo: true,
  },
  {
    id: "ex-pac-hepatico",
    nome: "Função hepática",
    exames: "TGO, TGP, Bilirrubinas total e frações, Fosfatase alcalina, Gama-GT",
    exemplo: true,
  },
];

export function bancoVazio(): BancoKits {
  return { kits: [], pacotes: [], exemplosOcultos: [] };
}

function kitValido(k: unknown): k is KitReceita {
  if (typeof k !== "object" || k === null) return false;
  const o = k as Record<string, unknown>;
  return (
    typeof o.id === "string" && typeof o.nome === "string" && o.nome.trim().length > 0 &&
    typeof o.medicamento === "string" && o.medicamento.trim().length > 0 &&
    typeof o.posologia === "string" && o.posologia.trim().length > 0 &&
    typeof o.duracao === "string" && typeof o.controlado === "boolean"
  );
}

function pacoteValido(p: unknown): p is PacoteExames {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" && typeof o.nome === "string" && o.nome.trim().length > 0 &&
    typeof o.exames === "string" && o.exames.trim().length > 0
  );
}

/** Leitura defensiva: JSON corrompido ou formato antigo vira banco vazio. */
export function lerBancoKits(storage: ArmazenamentoKits, medicoId: string): BancoKits {
  try {
    const bruto = storage.getItem(chaveKits(medicoId));
    if (!bruto) return bancoVazio();
    const j = JSON.parse(bruto) as Partial<BancoKits>;
    return {
      kits: Array.isArray(j.kits) ? j.kits.filter(kitValido).map((k) => ({ ...k, exemplo: undefined })) : [],
      pacotes: Array.isArray(j.pacotes) ? j.pacotes.filter(pacoteValido).map((p) => ({ ...p, exemplo: undefined })) : [],
      exemplosOcultos: Array.isArray(j.exemplosOcultos) ? j.exemplosOcultos.filter((x): x is string => typeof x === "string") : [],
    };
  } catch {
    return bancoVazio();
  }
}

export function gravarBancoKits(storage: ArmazenamentoKits, medicoId: string, banco: BancoKits): void {
  try {
    storage.setItem(chaveKits(medicoId), JSON.stringify(banco));
  } catch {
    /* aparelho sem espaço/sem permissão: a emissão segue sem os kits */
  }
}

/** Listas exibidas: exemplos não ocultos primeiro, depois os do médico. */
export function kitsVisiveis(banco: BancoKits): KitReceita[] {
  const ocultos = new Set(banco.exemplosOcultos);
  return [...KITS_EXEMPLO.filter((k) => !ocultos.has(k.id)), ...banco.kits];
}

export function pacotesVisiveis(banco: BancoKits): PacoteExames[] {
  const ocultos = new Set(banco.exemplosOcultos);
  return [...PACOTES_EXEMPLO.filter((p) => !ocultos.has(p.id)), ...banco.pacotes];
}

/** Salva (ou substitui, mesmo id) um kit do médico. Devolve o novo banco. */
export function salvarKitReceita(banco: BancoKits, kit: KitReceita): BancoKits {
  const limpo: KitReceita = { ...kit, exemplo: undefined };
  return { ...banco, kits: [...banco.kits.filter((k) => k.id !== kit.id), limpo] };
}

export function salvarPacoteExames(banco: BancoKits, pacote: PacoteExames): BancoKits {
  const limpo: PacoteExames = { ...pacote, exemplo: undefined };
  return { ...banco, pacotes: [...banco.pacotes.filter((p) => p.id !== pacote.id), limpo] };
}

/**
 * Remove um item pelo id: kit/pacote do médico sai da lista; EXEMPLO é
 * apenas ocultado (ele não está no banco — some e não volta).
 */
export function removerItemKit(banco: BancoKits, id: string): BancoKits {
  const ehExemplo = KITS_EXEMPLO.some((k) => k.id === id) || PACOTES_EXEMPLO.some((p) => p.id === id);
  if (ehExemplo) {
    return banco.exemplosOcultos.includes(id) ? banco : { ...banco, exemplosOcultos: [...banco.exemplosOcultos, id] };
  }
  return {
    ...banco,
    kits: banco.kits.filter((k) => k.id !== id),
    pacotes: banco.pacotes.filter((p) => p.id !== id),
  };
}

/** Campos mínimos para salvar o estado atual do formulário como kit. */
export function kitDoFormulario(dados: {
  nome: string;
  medicamento: string;
  posologia: string;
  duracao: string;
  controlado: boolean;
}): KitReceita | null {
  const nome = dados.nome.trim();
  const medicamento = dados.medicamento.trim();
  const posologia = dados.posologia.trim();
  const duracao = dados.duracao.trim();
  if (!nome || !medicamento || !posologia || !duracao) return null;
  return {
    id: `kit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nome,
    medicamento,
    posologia,
    duracao,
    controlado: dados.controlado,
  };
}

export function pacoteDoFormulario(dados: { nome: string; exames: string }): PacoteExames | null {
  const nome = dados.nome.trim();
  const exames = dados.exames.trim();
  if (!nome || !exames) return null;
  return {
    id: `pac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nome,
    exames,
  };
}
