/* ==================================================================== */
/* BION — tipo do atendimento (retorno, renovação de receita, segunda    */
/* opinião). Módulo PURO (cliente e servidor), dono: Pacientes.          */
/*                                                                       */
/* Contrato com o Médicos (migração em `Consulta`, PR dele):             */
/*   tipoAtendimento  TEXT NOT NULL DEFAULT 'padrao'                     */
/*                    CHECK IN (padrao, renovacao, retorno,              */
/*                    segunda_opiniao)                                   */
/*   consultaOrigemId TEXT NULL  FK → Consulta(id) ON DELETE SET NULL    */
/* Todo o resto do app lê/escreve esses campos SÓ por aqui, então ligar  */
/* (ou trocar) o contrato é mexer num lugar só.                          */
/* ==================================================================== */

export const TIPOS_ATENDIMENTO = ["padrao", "renovacao", "retorno", "segunda_opiniao"] as const;
export type TipoAtendimento = (typeof TIPOS_ATENDIMENTO)[number];

/** Valor desconhecido/ausente (linhas antigas, banco sem a coluna) → "padrao". */
export function normalizarTipoAtendimento(v: unknown): TipoAtendimento {
  return typeof v === "string" && (TIPOS_ATENDIMENTO as readonly string[]).includes(v) ? (v as TipoAtendimento) : "padrao";
}

/** Tipos que o PACIENTE pode pedir hoje (segunda opinião vem depois). */
export const TIPOS_PEDIDOS_PELO_PACIENTE = ["renovacao", "retorno"] as const;
export type TipoPedidoPaciente = (typeof TIPOS_PEDIDOS_PELO_PACIENTE)[number];

export const ROTULO_TIPO: Record<TipoAtendimento, string> = {
  padrao: "Consulta",
  renovacao: "Renovação de receita",
  retorno: "Retorno",
  segunda_opiniao: "Segunda opinião",
};

/** Rótulo curto para etiqueta/tela de chamada; null para "padrao" (não mostra nada). */
export function rotuloTipoAtendimento(v: unknown): string | null {
  const t = normalizarTipoAtendimento(v);
  return t === "padrao" ? null : ROTULO_TIPO[t];
}

/* ------------------------------------------------------------------ */
/* Medicamento controlado                                              */
/* ------------------------------------------------------------------ */
/*
 * O schema NÃO marca receita controlada (Documento não tem campo para isso).
 * Até o Médicos criar um campo explícito, a regra é CONSERVADORA: se o nome,
 * a posologia, o conteúdo ou as observações citam uma substância das listas
 * da Portaria SVS/MS 344/98 (A, B, C) mais comuns, ou falam em "controle
 * especial"/"receita azul/amarela"/"tarja preta", a renovação NÃO é oferecida
 * (e o servidor recusa). Falso positivo = o paciente agenda uma consulta
 * normal; falso negativo é o que não pode acontecer.
 */
const SUBSTANCIAS_CONTROLADAS = [
  // A1/A2 entorpecentes
  "morfina", "codeina", "tramadol", "oxicodona", "fentanil", "metadona", "petidina", "meperidina",
  "buprenorfina", "tapentadol", "hidromorfona", "nalbufina", "dextropropoxifeno",
  // A3/B2 psicotrópicos / anorexígenos
  "metilfenidato", "ritalina", "concerta", "lisdexanfetamina", "venvanse", "anfetamina", "modafinila",
  "sibutramina", "anfepramona", "femproporex", "mazindol",
  // B1 benzodiazepínicos e hipnóticos
  "alprazolam", "bromazepam", "clonazepam", "rivotril", "diazepam", "lorazepam", "midazolam",
  "flunitrazepam", "nitrazepam", "clobazam", "cloxazolam", "estazolam", "flurazepam", "zolpidem",
  "zopiclona", "eszopiclona", "fenobarbital", "gardenal", "clordiazepoxido",
  // C1 (antidepressivos, antipsicóticos, anticonvulsivantes etc.)
  "amitriptilina", "nortriptilina", "clomipramina", "imipramina", "fluoxetina", "sertralina", "paroxetina",
  "citalopram", "escitalopram", "venlafaxina", "desvenlafaxina", "duloxetina", "bupropiona", "mirtazapina",
  "trazodona", "vortioxetina", "agomelatina", "haloperidol", "risperidona", "quetiapina", "olanzapina",
  "aripiprazol", "clozapina", "ziprasidona", "paliperidona", "lurasidona", "clorpromazina", "levomepromazina",
  "carbamazepina", "oxcarbazepina", "acido valproico", "valproato", "divalproato", "lamotrigina",
  "topiramato", "gabapentina", "pregabalina", "levetiracetam", "fenitoina", "litio", "biperideno",
  "ciclobenzaprina", "tizanidina", "baclofeno", "dissulfiram", "naltrexona", "cetamina", "escetamina",
  "canabidiol", "cannabis", "tetrahidrocanabinol", "dronabinol",
  // C2 retinoides, C3 imunossupressores, C5 anabolizantes
  "isotretinoina", "acitretina", "talidomida", "lenalidomida", "testosterona", "nandrolona", "oxandrolona",
  "estanozolol", "somatropina",
];
const MARCAS_CONTROLE = [/controle\s+especial/, /receita\s+(azul|amarela|branca\s+especial)/, /notifica[cç][aã]o\s+de\s+receita/, /tarja\s+preta/, /portaria\s*344/, /\bcontrolad[oa]s?\b/];

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export type ReceitaParaRenovar = {
  tipo?: string;
  medicamento?: string | null;
  posologia?: string | null;
  conteudo?: string | null;
  observacoes?: string | null;
  titulo?: string | null;
};

/** true se a receita cita substância controlada (ou não dá para saber o medicamento). */
export function receitaControlada(d: ReceitaParaRenovar): boolean {
  const texto = semAcento([d.medicamento, d.posologia, d.conteudo, d.observacoes, d.titulo].filter(Boolean).join(" \n "));
  if (MARCAS_CONTROLE.some((r) => r.test(texto))) return true;
  return SUBSTANCIAS_CONTROLADAS.some((s) => new RegExp(`\\b${s}\\b`).test(texto));
}

/** Pode oferecer "Renovar receita"? Só receita, com medicamento informado e não controlada. */
export function podeRenovarReceita(d: ReceitaParaRenovar): boolean {
  if (d.tipo !== "receita") return false;
  if (!d.medicamento?.trim()) return false; // sem nome do remédio não há como checar → não oferece
  return !receitaControlada(d);
}

/* ------------------------------------------------------------------ */
/* Pedido do paciente (corpo do POST /api/consultas)                    */
/* ------------------------------------------------------------------ */

export type PedidoVinculado = {
  tipoAtendimento: TipoPedidoPaciente;
  consultaOrigemId: string;
  /** Só na renovação: a receita que será renovada (o servidor confere). */
  documentoOrigemId?: string;
};

/** Lê os campos de vínculo do corpo do POST. null = agendamento comum. Erro = string. */
export function lerPedidoVinculado(body: unknown): PedidoVinculado | null | string {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.tipoAtendimento === undefined && b.consultaOrigemId === undefined) return null;
  const tipo = b.tipoAtendimento;
  if (tipo === "padrao" && b.consultaOrigemId === undefined) return null;
  if (tipo !== "retorno" && tipo !== "renovacao") return "Tipo de atendimento inválido.";
  const origem = typeof b.consultaOrigemId === "string" ? b.consultaOrigemId.trim() : "";
  if (!origem || origem.length > 64) return "Informe a consulta de origem.";
  if (tipo === "renovacao") {
    const doc = typeof b.documentoOrigemId === "string" ? b.documentoOrigemId.trim() : "";
    if (!doc || doc.length > 64) return "Informe a receita que será renovada.";
    return { tipoAtendimento: tipo, consultaOrigemId: origem, documentoOrigemId: doc };
  }
  return { tipoAtendimento: tipo, consultaOrigemId: origem };
}

/** Prazo máximo, em dias, entre a consulta de origem e o pedido. */
export const PRAZO_RETORNO_DIAS = 90;
export const PRAZO_RENOVACAO_DIAS = 365;

/** Motivo pré-preenchido (o paciente pode editar). */
export function motivoSugerido(
  tipo: TipoPedidoPaciente,
  origem: { especialidade: string; data: string; motivoConsulta?: string },
  receita?: { medicamento?: string | null },
): string {
  if (tipo === "renovacao") {
    const remedio = receita?.medicamento?.trim();
    return `Renovação de receita${remedio ? `: ${remedio}` : ""} (consulta de ${origem.data})`.slice(0, 300);
  }
  const queixa = origem.motivoConsulta?.trim();
  const base = queixa && queixa !== "Consulta de rotina" ? queixa : origem.especialidade;
  return `Retorno da consulta de ${origem.data}: ${base}`.slice(0, 300);
}

/**
 * Primeiro horário livre a partir da data de retorno sugerida pelo médico
 * (ISO, opcional). Sem sugestão: o primeiro horário livre da agenda.
 */
export function escolherHorarioInicial<T extends { iso: string; horarios: string[] }>(
  dias: T[],
  sugeridoEmISO?: string | null,
): { dia: T; hora: string } | null {
  const alvo = sugeridoEmISO ? sugeridoEmISO.slice(0, 10) : "";
  const candidatos = alvo ? dias.filter((d) => d.iso >= alvo) : dias;
  const lista = candidatos.length ? candidatos : dias;
  for (const d of lista) if (d.horarios.length) return { dia: d, hora: d.horarios[0] };
  return null;
}

/* ------------------------------------------------------------------ */
/* Pedido de renovação (tabela PedidoRenovacao — migração do Médicos)    */
/* ------------------------------------------------------------------ */
/*
 * Renovação NÃO tem horário: o paciente pede, o médico decide se renova por
 * mensagem ou se marca uma chamada curta (aí nasce uma Consulta com
 * tipoAtendimento 'renovacao', ligada por `consultaId`).
 */
export const STATUS_PEDIDO_RENOVACAO = ["pendente", "renovada", "chamada_marcada", "recusada"] as const;
export type StatusPedidoRenovacao = (typeof STATUS_PEDIDO_RENOVACAO)[number];

export type PedidoRenovacao = {
  id: string;
  pacienteId: string;
  medicoId: string;
  consultaOrigemId: string | null;
  documentoId: string;
  status: StatusPedidoRenovacao;
  mensagemMedico: string | null;
  consultaId: string | null;
  observacaoPaciente: string | null;
  documentoNovoId: string | null;
  criadoEm: string;
  respondidoEm: string | null;
};

/** Linha do banco (ou JSON da rota) → PedidoRenovacao; null se inválida. */
export function lerPedidoRenovacao(v: unknown): PedidoRenovacao | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" && x ? x : null);
  const data = (x: unknown) => (x instanceof Date ? x.toISOString() : s(x));
  const id = s(r.id), pacienteId = s(r.pacienteId), medicoId = s(r.medicoId), documentoId = s(r.documentoId);
  if (!id || !pacienteId || !medicoId || !documentoId) return null;
  const status = (STATUS_PEDIDO_RENOVACAO as readonly string[]).includes(r.status as string)
    ? (r.status as StatusPedidoRenovacao)
    : "pendente";
  return {
    id, pacienteId, medicoId, documentoId, status,
    consultaOrigemId: s(r.consultaOrigemId),
    mensagemMedico: s(r.mensagemMedico),
    // Só vem quando o médico marcou a chamada curta.
    consultaId: status === "chamada_marcada" ? s(r.consultaId) : null,
    observacaoPaciente: s(r.observacaoPaciente),
    documentoNovoId: s(r.documentoNovoId),
    criadoEm: data(r.criadoEm) ?? new Date(0).toISOString(),
    respondidoEm: data(r.respondidoEm),
  };
}

export const ROTULO_STATUS_RENOVACAO: Record<StatusPedidoRenovacao, { texto: string; tom: "pendente" | "ok" | "info" | "erro" }> = {
  pendente: { texto: "Aguardando o médico", tom: "pendente" },
  renovada: { texto: "Renovada por mensagem", tom: "ok" },
  chamada_marcada: { texto: "Chamada curta marcada", tom: "info" },
  recusada: { texto: "Não renovada", tom: "erro" },
};

/** Pedido mais recente para a receita (para o botão virar status). */
export function pedidoDaReceita(pedidos: PedidoRenovacao[], documentoId: string): PedidoRenovacao | null {
  return pedidos
    .filter((p) => p.documentoId === documentoId)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] ?? null;
}

/** Corpo do POST /api/renovacoes. Erro = string. */
export function lerCorpoPedidoRenovacao(body: unknown): { documentoId: string; observacaoPaciente: string | null } | string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const documentoId = typeof b.documentoId === "string" ? b.documentoId.trim() : "";
  if (!documentoId || documentoId.length > 64) return "Informe a receita que será renovada.";
  const obs = typeof b.observacaoPaciente === "string" ? b.observacaoPaciente.trim().slice(0, 500) : "";
  return { documentoId, observacaoPaciente: obs || null };
}
