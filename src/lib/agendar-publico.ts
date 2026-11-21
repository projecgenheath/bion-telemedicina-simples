/**
 * Funil público: perfil da médica → agenda dela → cadastro → pagamento.
 * O download do app fica de fora daqui (é opcional, na tela seguinte).
 * Sem banco e sem segredo. O servidor continua decidindo preço, vaga e cobrança.
 */

import type { Consulta, Medico } from "@/lib/bion-tipos";

const CHAVE_ESCOLHA = "bion-agendar-publico";
const CHAVE_SEGUIR = "bion-agendar-seguir";

/** Só o caminho do funil desta médica. Rejeita URL externa e qualquer outra rota. */
const CAMINHO_VOLTA = /^\/p\/[A-Za-z0-9_-]{1,80}\/agendar$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export type EscolhaAgenda = {
  medicoId: string;
  /** Rótulo que o servidor já entende: "Hoje", "Amanhã" ou "D Mês". */
  rotulo: string;
  hora: string;
  iso: string;
};

export type AgendaPublica = {
  id: string;
  nome: string;
  especialidade: string;
  crm: string;
  valor: number;
  foto?: string;
  horariosDisponiveis: string[];
  horariosPorDia: Record<string, string[]>;
  diasAtendimento: number[];
  pausasSemanais: { dia: number; inicio: string; fim: string }[];
  diasBloqueados: string[];
  ocupadosIso: string[];
};

/** Para onde ir depois do login ou do cadastro. Paciente volta só para a agenda que pediu. */
export function destinoDepoisDeEntrar(role: string | undefined, voltar: string | null | undefined): string {
  if (role === "paciente" && voltar && CAMINHO_VOLTA.test(voltar)) return voltar;
  if (role === "paciente") return "/paciente";
  if (role === "medico") return "/medico";
  return "/painel";
}

export function guardarEscolha(escolha: EscolhaAgenda) {
  sessionStorage.setItem(CHAVE_ESCOLHA, JSON.stringify(escolha));
}

export function lerEscolha(medicoId: string): EscolhaAgenda | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_ESCOLHA);
    if (!bruto) return null;
    const j = JSON.parse(bruto) as Partial<EscolhaAgenda>;
    if (j.medicoId !== medicoId) return null;
    if (typeof j.rotulo !== "string" || !j.rotulo.trim() || j.rotulo.length > 40) return null;
    if (typeof j.hora !== "string" || !HORA.test(j.hora)) return null;
    if (typeof j.iso !== "string" || !DIA.test(j.iso)) return null;
    return { medicoId, rotulo: j.rotulo, hora: j.hora, iso: j.iso };
  } catch {
    return null;
  }
}

export function limparEscolha() {
  try {
    sessionStorage.removeItem(CHAVE_ESCOLHA);
    sessionStorage.removeItem(CHAVE_SEGUIR);
  } catch {
    /* aba sem sessionStorage */
  }
}

/** Marca que, ao voltar do cadastro, a próxima tela é o pagamento deste horário. */
export function marcarSeguirParaPagamento() {
  sessionStorage.setItem(CHAVE_SEGUIR, "1");
}

export function lerSeguirParaPagamento(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_SEGUIR) === "1";
  } catch {
    return false;
  }
}

export function limparSeguirParaPagamento() {
  try {
    sessionStorage.removeItem(CHAVE_SEGUIR);
  } catch {
    /* ignora */
  }
}

function listaHoras(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((h): h is string => typeof h === "string" && HORA.test(h)))];
}

/** Lê o JSON da rota pública. Lixo vira null; não inventa horário. */
export function lerAgendaPublica(bruto: unknown): AgendaPublica | null {
  if (!bruto || typeof bruto !== "object") return null;
  const j = bruto as Record<string, unknown>;
  if (typeof j.id !== "string" || !j.id || j.id.length > 80) return null;
  if (typeof j.nome !== "string" || !j.nome.trim()) return null;
  if (typeof j.especialidade !== "string") return null;
  if (typeof j.crm !== "string") return null;
  if (typeof j.valor !== "number" || !Number.isFinite(j.valor)) return null;
  const porDiaBruto = j.horariosPorDia;
  const horariosPorDia: Record<string, string[]> = {};
  if (porDiaBruto && typeof porDiaBruto === "object" && !Array.isArray(porDiaBruto)) {
    for (const [k, lista] of Object.entries(porDiaBruto as Record<string, unknown>)) {
      if (!/^[0-6]$/.test(k)) continue;
      horariosPorDia[k] = listaHoras(lista);
    }
  }
  const diasAtendimento = Array.isArray(j.diasAtendimento)
    ? j.diasAtendimento.filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6)
    : [];
  const pausasSemanais = Array.isArray(j.pausasSemanais)
    ? j.pausasSemanais.flatMap((p) => {
        if (!p || typeof p !== "object") return [];
        const pa = p as { dia?: unknown; inicio?: unknown; fim?: unknown };
        if (typeof pa.dia !== "number" || pa.dia < 0 || pa.dia > 6) return [];
        if (typeof pa.inicio !== "string" || !HORA.test(pa.inicio)) return [];
        if (typeof pa.fim !== "string" || !HORA.test(pa.fim)) return [];
        return [{ dia: pa.dia, inicio: pa.inicio, fim: pa.fim }];
      })
    : [];
  const diasBloqueados = Array.isArray(j.diasBloqueados)
    ? j.diasBloqueados.filter((d): d is string => typeof d === "string" && DIA.test(d))
    : [];
  const ocupadosIso = Array.isArray(j.ocupadosIso)
    ? j.ocupadosIso.filter((d): d is string => typeof d === "string" && Number.isFinite(Date.parse(d)))
    : [];
  return {
    id: j.id,
    nome: j.nome,
    especialidade: j.especialidade,
    crm: j.crm,
    valor: j.valor,
    foto: typeof j.foto === "string" && j.foto ? j.foto : undefined,
    horariosDisponiveis: listaHoras(j.horariosDisponiveis),
    horariosPorDia,
    diasAtendimento,
    pausasSemanais,
    diasBloqueados,
    ocupadosIso,
  };
}

/** Médica no formato que a agenda do paciente já sabe ler. Campos que a rota não manda ficam vazios. */
export function medicoDaAgenda(a: AgendaPublica): Medico {
  return {
    id: a.id,
    nome: a.nome,
    crm: a.crm,
    especialidade: a.especialidade,
    subespecialidades: [],
    valor: a.valor,
    avaliacao: 0,
    numAvaliacoes: 0,
    formacao: "",
    experiencia: "",
    idiomas: [],
    bio: "",
    foto: a.foto,
    status: "ativo",
    horariosDisponiveis: a.horariosDisponiveis,
    horariosPorDia: a.horariosPorDia,
    diasAtendimento: a.diasAtendimento,
    pausasSemanais: a.pausasSemanais,
  };
}

/**
 * Vagas já ocupadas, só com o instante. Sem nome de paciente: a agenda
 * esconde o horário, não conta quem marcou.
 */
export function consultasOcupadas(medicoId: string, nome: string, isos: string[]): Consulta[] {
  return isos.map((iso, i) => ({
    id: `ocupado-${i}`,
    medico: nome,
    medicoId,
    especialidade: "",
    paciente: "",
    data: "",
    hora: "",
    status: "confirmada",
    ts: Date.parse(iso),
    dataISO: iso,
  }));
}
