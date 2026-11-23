/**
 * Ficha do paciente (redesign azul, etapa 3): funções puras que montam o que
 * a tela mostra a partir de dados REAIS que o app já recebe — consultas do
 * médico, GET /api/medico/consultas/[id]/evolucao (medições, exames,
 * medicamentos em uso, histórico de outros profissionais) e documentos.
 * Nada aqui inventa valor: sem dado confiável, devolve "sem prazo"/null.
 */

const DIA = 86_400_000;
const FUSO = "America/Sao_Paulo";

/* ------------------------------------------------------------------ */
/* Anéis de medicação                                                  */
/* ------------------------------------------------------------------ */

export type MedicamentoEmUsoFicha = {
  id: string;
  nome: string;
  dose: string | null;
  via?: string | null;
  posologia?: unknown;
  usoContinuo: boolean;
  controlado?: boolean;
  origem?: string;
  inicio: string;
  fim: string | null;
};

export type ProgressoTratamento =
  /** Prazo conhecido (fim gravado ou duração em dias na posologia). */
  | { tipo: "periodo"; total: number; decorridos: number; restantes: number; inicio: number; fim: number }
  /** Uso contínuo: sem fim — o anel não mede progresso. */
  | { tipo: "continuo"; desdeDias: number; inicio: number }
  /** Sem fim nem duração: não dá para calcular dias. */
  | { tipo: "sem_prazo"; desdeDias: number; inicio: number };

function diasEntre(a: number, b: number): number {
  return Math.floor((b - a) / DIA);
}

function duracaoDiasPosologia(p: unknown): number | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const d = (p as { duracaoDias?: unknown }).duracaoDias;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}

/**
 * Dias de tratamento a partir de `inicio` + (`fim` OU `posologia.duracaoDias`).
 * `inicio` é a data em que o medicamento entrou na lista do paciente
 * (receita aceita ou cadastro dele) — não a 1ª dose; está dito no rótulo.
 */
export function progressoTratamento(m: Pick<MedicamentoEmUsoFicha, "inicio" | "fim" | "usoContinuo" | "posologia">, agora: number): ProgressoTratamento | null {
  const inicio = Date.parse(m.inicio);
  if (!Number.isFinite(inicio)) return null;
  const desdeDias = Math.max(0, diasEntre(inicio, agora));
  if (m.usoContinuo) return { tipo: "continuo", desdeDias, inicio };
  let fim = m.fim ? Date.parse(m.fim) : NaN;
  if (!Number.isFinite(fim)) {
    const dur = duracaoDiasPosologia(m.posologia);
    if (dur) fim = inicio + dur * DIA;
  }
  if (!Number.isFinite(fim) || fim <= inicio) return { tipo: "sem_prazo", desdeDias, inicio };
  const total = Math.max(1, Math.round((fim - inicio) / DIA));
  const decorridos = Math.min(total, desdeDias);
  return { tipo: "periodo", total, decorridos, restantes: total - decorridos, inicio, fim };
}

/** Medicamentos que o anel mostra: ativos; com prazo encerrado saem. */
export function medicamentosAtuais(lista: MedicamentoEmUsoFicha[], agora: number) {
  return lista
    .map((m) => ({ m, p: progressoTratamento(m, agora) }))
    .filter((x): x is { m: MedicamentoEmUsoFicha; p: ProgressoTratamento } => x.p !== null && !(x.p.tipo === "periodo" && x.p.restantes <= 0));
}

/** Frequência legível da posologia estruturada ("2x ao dia"), se houver. */
export function frequenciaPosologia(p: unknown): string {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "";
  const { frequencia: f, vezesAoDia: v } = p as { frequencia?: unknown; vezesAoDia?: unknown };
  if (typeof f === "string" && f.trim()) return f.trim();
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 4) return v === 1 ? "1x ao dia" : `${v}x ao dia`;
  return "";
}

/* ------------------------------------------------------------------ */
/* Histórico (tabela)                                                  */
/* ------------------------------------------------------------------ */

export type ConsultaFicha = {
  id: string;
  ts: number;
  status: string;
  motivoConsulta?: string;
  resumoMedico?: string;
  tipoAtendimento?: string;
  especialidade?: string;
  medico?: string;
};

export type HistoricoFicha = {
  consultaId: string;
  dataInicio: string;
  especialidade: string;
  medico: string;
  deOutroMedico: boolean;
  evolucao: { conduta?: { texto?: string } | null; cid?: string | null } | null;
  anamnese: { status: string } | null;
};

export type LinhaHistorico = {
  id: string;
  ts: number;
  /** Motivo informado pelo paciente — só nas consultas COMIGO. */
  motivo: string | null;
  especialidade: string;
  cid: string | null;
  /** Conduta da evolução concluída; nas minhas, cai para o resumo. */
  conduta: string | null;
  profissional: string;
  deOutroMedico: boolean;
  status: string | null;
  anamnese: boolean;
};

const textoConduta = (e: HistoricoFicha["evolucao"]) => e?.conduta?.texto?.trim() || null;

/**
 * Junta as minhas consultas (com motivo, status e resumo) e as consultas com
 * outros profissionais do GET da evolução (CID e conduta da evolução
 * concluída). A mesma consulta nunca aparece duas vezes. Mais nova primeiro.
 */
export function linhasHistorico(minhas: ConsultaFicha[], historico: HistoricoFicha[], nomeMedico: string): LinhaHistorico[] {
  const porId = new Map(historico.map((h) => [h.consultaId, h]));
  const linhas: LinhaHistorico[] = minhas.map((c) => {
    const h = porId.get(c.id);
    return {
      id: c.id,
      ts: c.ts,
      motivo: c.motivoConsulta?.trim() || null,
      especialidade: c.especialidade ?? h?.especialidade ?? "",
      cid: h?.evolucao?.cid?.trim() || null,
      conduta: textoConduta(h?.evolucao ?? null) ?? (c.resumoMedico?.trim() || null),
      profissional: nomeMedico,
      deOutroMedico: false,
      status: c.status,
      anamnese: !!h?.anamnese,
    };
  });
  const minhasIds = new Set(minhas.map((c) => c.id));
  for (const h of historico) {
    if (minhasIds.has(h.consultaId) || !h.deOutroMedico) continue;
    const ts = Date.parse(h.dataInicio);
    linhas.push({
      id: h.consultaId,
      ts: Number.isFinite(ts) ? ts : 0,
      motivo: null,
      especialidade: h.especialidade,
      cid: h.evolucao?.cid?.trim() || null,
      conduta: textoConduta(h.evolucao),
      profissional: h.medico || "Outro profissional",
      deOutroMedico: true,
      status: null,
      anamnese: !!h.anamnese,
    });
  }
  return linhas.sort((a, b) => b.ts - a.ts);
}

export function filtrarHistorico(linhas: LinhaHistorico[], busca: string): LinhaHistorico[] {
  const q = normalizar(busca);
  if (!q) return linhas;
  return linhas.filter((l) => normalizar([l.motivo, l.especialidade, l.cid, l.conduta, l.profissional].filter(Boolean).join(" ")).includes(q));
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* ------------------------------------------------------------------ */
/* Exames e medições                                                   */
/* ------------------------------------------------------------------ */

export type ItemExameFicha = { nome: string; valor: number; unidade?: string; refMin?: number; refMax?: number };

export function foraDaFaixa(it: ItemExameFicha): boolean {
  if (typeof it.refMin === "number" && it.valor < it.refMin) return true;
  if (typeof it.refMax === "number" && it.valor > it.refMax) return true;
  return false;
}

/** "Normal", "Fora da faixa: Glicose" (até 2 nomes + N) ou "Sem referência". */
export function situacaoExame(itens: ItemExameFicha[]): { tom: "normal" | "alterado" | "neutro"; texto: string } {
  if (itens.length === 0) return { tom: "neutro", texto: "Sem itens estruturados" };
  const comRef = itens.filter((i) => typeof i.refMin === "number" || typeof i.refMax === "number");
  if (comRef.length === 0) return { tom: "neutro", texto: `${itens.length} ${itens.length === 1 ? "item" : "itens"}` };
  const fora = comRef.filter(foraDaFaixa);
  if (fora.length === 0) return { tom: "normal", texto: "Normal" };
  const nomes = fora.slice(0, 2).map((i) => i.nome).join(", ");
  return { tom: "alterado", texto: `Alterado: ${nomes}${fora.length > 2 ? ` +${fora.length - 2}` : ""}` };
}

export type MedicaoFicha = { id: string; tipo: string; valor1: number; valor2: number | null; criadoEm: string };

/** Última medição de cada tipo (a lista chega da mais nova para a mais antiga). */
export function ultimasMedicoes(medicoes: MedicaoFicha[]): Map<string, MedicaoFicha> {
  const m = new Map<string, MedicaoFicha>();
  for (const x of medicoes) {
    const tipo = x.tipo === "pa" ? "pressao" : x.tipo;
    if (!m.has(tipo)) m.set(tipo, x);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Formatação                                                           */
/* ------------------------------------------------------------------ */

export function dataCurta(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "45 anos, masculino" com o que existir. */
export function legendaPaciente(idade: number | null, genero: string): string {
  return [idade ? `${idade} ${idade === 1 ? "ano" : "anos"}` : "", genero?.trim().toLowerCase() || ""].filter(Boolean).join(", ");
}
