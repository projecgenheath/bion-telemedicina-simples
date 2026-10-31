/**
 * Grade de horários do médico POR DIA DA SEMANA — módulo puro, sem React,
 * sem banco e sem fuso: importado pelo cliente (AgendaSheet, prévia do
 * paciente, métricas) e pelo servidor (financeiro.ts, dados.ts, PATCH de
 * médicos). É a ÚNICA regra de leitura/escrita do formato.
 *
 * Armazenamento (PerfilMedico.horariosDisponiveis, coluna String com JSON):
 *  - formato LEGADO (o único que existia): um array JSON — `["09:00",…]` —
 *    vale como PADRÃO para todos os dias da semana;
 *  - formato NOVO: um objeto JSON — `{"padrao":[…],"dias":{"6":[…]}}` —
 *    `padrao` é a lista que vale para todos os dias e `dias` traz, por dia
 *    da semana (0=Dom … 6=Sáb, mesma convenção de diasAtendimento), a lista
 *    PRÓPRIA daquele dia (que substitui o padrão naquele dia; lista vazia
 *    = nenhum horário naquele dia).
 * A serialização volta ao array legado sempre que não há dia próprio —
 * médico que nunca abriu a grade por dia continua byte a byte igual.
 *
 * Convenção dos campos no wire/cliente (Medico):
 *  - `horariosDisponiveis: string[]` = o PADRÃO (tipo inalterado — clientes
 *    antigos seguem lendo a lista padrão);
 *  - `horariosPorDia: Record<string, string[]>` = os dias próprios.
 */

export type GradeSemana = {
  /** Lista que vale para todos os dias sem lista própria. */
  padrao: string[];
  /** Listas próprias por dia da semana: chave "0" (Dom) … "6" (Sáb). */
  dias: Record<string, string[]>;
};

export const GRADE_VAZIA: GradeSemana = { padrao: [], dias: {} };

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Sanitiza uma lista de horários: só HH:MM válidos, sem duplicar, na ordem gravada. */
function sanitizarLista(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  // Sem duplicados, mas PRESERVANDO a ordem gravada: a ordem histórica da
  // coluna é a ordem de exibição em várias telas (a prévia do paciente
  // mostra a lista como está) — ordenar aqui mudaria o que o paciente vê
  // sem ninguém pedir. Quem precisa de ordem ordena na exibição.
  return [...new Set(v.filter((h): h is string => typeof h === "string" && HORA_RE.test(h)))];
}

function sanitizarDias(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const dias: Record<string, string[]> = {};
  for (const [k, lista] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k)) continue;
    // Só lista de verdade vira dia próprio: um valor estranho no banco não
    // pode se transformar num override vazio (que zeraria o dia).
    if (!Array.isArray(lista)) continue;
    dias[k] = sanitizarLista(lista);
  }
  return dias;
}

/**
 * Normaliza QUALQUER representação da grade:
 *  - a string gravada no banco (JSON array legado ou JSON objeto novo);
 *  - um array (wire legado / corpo de PATCH antigo);
 *  - um objeto { padrao, dias } (wire novo / corpo de PATCH novo);
 *  - null/undefined/lixo → grade vazia (sem restrição, como sempre foi).
 */
export function normalizarGrade(bruto: unknown): GradeSemana {
  let v: unknown = bruto;
  if (typeof bruto === "string") {
    try {
      v = JSON.parse(bruto || "[]");
    } catch {
      return { padrao: [], dias: {} };
    }
  }
  if (Array.isArray(v)) return { padrao: sanitizarLista(v), dias: {} };
  if (v && typeof v === "object") {
    const o = v as { padrao?: unknown; dias?: unknown };
    return { padrao: sanitizarLista(o.padrao), dias: sanitizarDias(o.dias) };
  }
  return { padrao: [], dias: {} };
}

/** Monta a grade a partir dos dois campos do wire/cliente (Medico). */
export function gradeDeCampos(
  padrao: string[] | null | undefined,
  porDia?: Record<string, string[]> | null,
): GradeSemana {
  return { padrao: sanitizarLista(padrao ?? []), dias: sanitizarDias(porDia ?? {}) };
}

/**
 * Horários de UM dia da semana (0=Dom … 6=Sáb): a lista própria do dia
 * quando ela EXISTE (mesmo vazia = nenhum horário naquele dia); senão, o
 * padrão. Devolve cópia — quem chama pode ordenar/filtrar à vontade.
 */
export function horariosDoDia(grade: GradeSemana, diaSemana: number): string[] {
  const propria = grade.dias[String(diaSemana)];
  return propria !== undefined ? [...propria] : [...grade.padrao];
}

/** Grade sem nenhum dia próprio (só o padrão — formato legado). */
export function gradeEhPlana(grade: GradeSemana): boolean {
  return Object.keys(grade.dias).length === 0;
}

/** Nenhum horário em dia nenhum (o "sem grade" do médico legado). */
export function gradeTotalmenteVazia(grade: GradeSemana): boolean {
  return (
    grade.padrao.length === 0 &&
    Object.values(grade.dias).every((l) => l.length === 0)
  );
}

/**
 * Serializa para gravar na coluna: sem dias próprios → o ARRAY legado
 * (byte a byte o formato de sempre); com dias próprios → o objeto novo.
 */
export function serializarGrade(grade: GradeSemana): string {
  const g = normalizarGrade(grade);
  if (gradeEhPlana(g)) return JSON.stringify(g.padrao);
  return JSON.stringify({ padrao: g.padrao, dias: g.dias });
}

/** Todas as listas da grade (padrão + dias próprios) — para validações. */
export function listasDaGrade(grade: GradeSemana): string[][] {
  return [grade.padrao, ...Object.values(grade.dias)];
}

/** Igualdade estrutural entre grades (via serialização normalizada). */
export function gradesIguais(a: GradeSemana, b: GradeSemana): boolean {
  return serializarGrade(a) === serializarGrade(b);
}

/**
 * Dia da semana (0=Dom … 6=Sáb) de uma data civil "AAAA-MM-DD" — a MESMA
 * fórmula do servidor (bloqueio-agenda.ts): calendário puro via UTC, nunca
 * o fuso do navegador nem o dia UTC do instante.
 */
export function diaSemanaDeIso(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, (mes ?? 1) - 1, dia ?? 1)).getUTCDay();
}
