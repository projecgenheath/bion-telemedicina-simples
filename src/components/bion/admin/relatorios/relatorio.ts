/**
 * Regras puras dos Relatórios do admin (Torre BION). Mesmos números,
 * mesmos filtros e o MESMO CSV do Relatorios antigo (removido; ver o
 * histórico do git); o "agora" entra como parâmetro. Única diferença: o
 * desempenho por médico agrupa pelo medicoId (ver linhasPorMedico).
 * Testes: relatorios.teste.ts (também com TZ=UTC e TZ=Asia/Tokyo).
 */
import type { Avaliacao, Consulta } from "@/lib/bion-tipos";

export const DIA = 86_400_000;
export const PERIODOS = [
  { k: "7", label: "7 dias" },
  { k: "30", label: "30 dias" },
  { k: "90", label: "90 dias" },
  { k: "todos", label: "Tudo" },
] as const;
export type PeriodoKey = (typeof PERIODOS)[number]["k"];

export type FiltrosRelatorio = { periodo: PeriodoKey; especialidade: string; medico: string };
export const FILTROS_RELATORIO_PADRAO: FiltrosRelatorio = { periodo: "todos", especialidade: "todas", medico: "todos" };

/** Janela móvel (igual à tela antiga): agora − N dias; 0 = sem limite. */
export function limiteDoPeriodo(periodo: PeriodoKey, agora: number): number {
  return periodo === "todos" ? 0 : agora - Number(periodo) * DIA;
}

/** Opções dos seletores: especialidades das consultas; médicos das consultas e das avaliações (por nome, como antes). */
export function opcoesRelatorio(consultas: Consulta[], avaliacoes: Avaliacao[]): { esp: string[]; med: string[] } {
  const esp = [...new Set(consultas.map((c) => c.especialidade))].sort();
  const med = [...new Set([...consultas.map((c) => c.medico), ...avaliacoes.map((a) => a.medico)])].sort();
  return { esp, med };
}

export function filtrarConsultasRelatorio(consultas: Consulta[], f: FiltrosRelatorio, agora: number): Consulta[] {
  const limite = limiteDoPeriodo(f.periodo, agora);
  return consultas.filter(
    (c) => (!limite || c.ts >= limite) && (f.especialidade === "todas" || c.especialidade === f.especialidade) && (f.medico === "todos" || c.medico === f.medico),
  );
}

export function filtrarAvaliacoesRelatorio(avaliacoes: Avaliacao[], f: FiltrosRelatorio, agora: number): Avaliacao[] {
  const limite = limiteDoPeriodo(f.periodo, agora);
  return avaliacoes.filter(
    (a) => (!limite || a.ts >= limite) && (f.especialidade === "todas" || a.especialidade === f.especialidade) && (f.medico === "todos" || a.medico === f.medico),
  );
}

export type DesempenhoMedico = { total: number; soma: number; n: number };
/**
 * Uma linha do desempenho por médico. `chave` é "id:<medicoId>" ou, para
 * consulta sem medicoId, "nome:<nome>"; `nome` é só o rótulo.
 * `homonimo` = avaliações de um nome que pertence a mais de um médico no
 * recorte: a avaliação não traz medicoId, então não dá para separá-las.
 */
export type LinhaMedico = DesempenhoMedico & { chave: string; nome: string; medicoId?: string; homonimo?: boolean };

export const chaveMedico = (c: Pick<Consulta, "medico" | "medicoId">): string => (c.medicoId ? `id:${c.medicoId}` : `nome:${c.medico}`);

/**
 * Desempenho por médico agrupado pelo medicoId (consulta sem medicoId cai no
 * nome). As avaliações só têm o nome do médico: vão para o único médico com
 * esse nome no recorte; sem nenhum, ficam numa linha pelo nome (como antes);
 * com dois ou mais (homônimos), ficam numa linha própria marcada `homonimo`.
 * Ordem: mais consultas primeiro (empate mantém a ordem de chegada).
 */
export function linhasPorMedico(consultas: Consulta[], avaliacoes: Avaliacao[]): LinhaMedico[] {
  const linhas = new Map<string, LinhaMedico>();
  const idsPorNome = new Map<string, Set<string>>();
  consultas.forEach((c) => {
    const chave = chaveMedico(c);
    const l = linhas.get(chave) ?? { chave, nome: c.medico, ...(c.medicoId ? { medicoId: c.medicoId } : {}), total: 0, soma: 0, n: 0 };
    l.total += 1;
    linhas.set(chave, l);
    if (c.medicoId) idsPorNome.set(c.medico, (idsPorNome.get(c.medico) ?? new Set()).add(chave));
  });
  avaliacoes.forEach((a) => {
    const ids = idsPorNome.get(a.medico);
    const homonimo = !!ids && ids.size > 1;
    const chave = ids && ids.size === 1 ? [...ids][0] : homonimo ? `homonimo:${a.medico}` : `nome:${a.medico}`;
    const l = linhas.get(chave) ?? { chave, nome: a.medico, total: 0, soma: 0, n: 0, ...(homonimo ? { homonimo: true } : {}) };
    l.soma += a.nota;
    l.n += 1;
    linhas.set(chave, l);
  });
  return [...linhas.values()].sort((a, b) => b.total - a.total);
}
export type DadosRelatorio = {
  total: number;
  concluidas: number;
  canceladas: number;
  media: number;
  taxaCancelamento: number;
  especialidades: [string, number][];
  medicos: LinhaMedico[];
  pacientes: number;
};

/** O cálculo da tela antiga; o desempenho por médico agrupa pelo medicoId. */
export function calcularRelatorio(consultas: Consulta[], avaliacoes: Avaliacao[]): DadosRelatorio {
  const total = consultas.length;
  const concluidas = consultas.filter((c) => c.status === "concluida").length;
  const canceladas = consultas.filter((c) => c.status === "cancelada").length;
  const media = avaliacoes.length ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length : 0;

  const porEspecialidade = new Map<string, number>();
  consultas.forEach((c) => porEspecialidade.set(c.especialidade, (porEspecialidade.get(c.especialidade) ?? 0) + 1));

  return {
    total,
    concluidas,
    canceladas,
    media,
    taxaCancelamento: total ? Math.round((canceladas / total) * 100) : 0,
    especialidades: [...porEspecialidade.entries()].sort((a, b) => b[1] - a[1]),
    medicos: linhasPorMedico(consultas, avaliacoes),
    pacientes: new Set(consultas.map((c) => c.paciente)).size,
  };
}

/** Pacientes com consulta no recorte (para o detalhe de "Pacientes ativos"), mais consultas primeiro. */
export function pacientesDoRecorte(consultas: Consulta[]): { nome: string; consultas: number; ultima: number }[] {
  const m = new Map<string, { nome: string; consultas: number; ultima: number }>();
  for (const c of consultas) {
    const p = m.get(c.paciente) ?? { nome: c.paciente, consultas: 0, ultima: -Infinity };
    p.consultas++;
    p.ultima = Math.max(p.ultima, c.ts);
    m.set(c.paciente, p);
  }
  return [...m.values()].sort((a, b) => b.consultas - a.consultas || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Rótulo da linha: o nome. Só quando o mesmo nome aparece em mais de uma
 * linha acrescenta o fim do medicoId (ou "consultas sem ID"); a linha das
 * avaliações de homônimos diz "avaliações sem médico identificado".
 */
export function rotuloMedico(l: LinhaMedico, linhas: LinhaMedico[]): string {
  if (l.homonimo) return `${l.nome} (avaliações sem médico identificado)`;
  const repetido = linhas.filter((x) => x.nome === l.nome && !x.homonimo).length > 1;
  if (!repetido) return l.nome;
  return l.medicoId ? `${l.nome} (#${l.medicoId.slice(-6)})` : `${l.nome} (consultas sem ID)`;
}

export const notaMedia = (v: DesempenhoMedico, casas = 1) => (v.n ? (v.soma / v.n).toFixed(casas) : "—");

export function textoFiltro(f: FiltrosRelatorio): string {
  const rotuloPeriodo = PERIODOS.find((p) => p.k === f.periodo)?.label ?? "Tudo";
  return `Período: ${rotuloPeriodo} • Especialidade: ${f.especialidade === "todas" ? "todas" : f.especialidade} • Médico: ${f.medico === "todos" ? "todos" : f.medico}`;
}

/** Igual ao csvLinha da tela antiga: ponto e vírgula, tudo entre aspas. */
export function csvLinhaRelatorio(campos: (string | number)[]): string {
  return campos.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
}

/** CSV completo (com BOM), linha a linha igual ao da tela antiga. */
export function csvRelatorio(p: {
  filtroTexto: string;
  dados: DadosRelatorio;
  consultas: Consulta[];
  avaliacoes: Avaliacao[];
  documentos: number;
  arquivos: number;
  consentimentos: number;
}): string {
  const { dados } = p;
  const linhas: string[] = [];
  linhas.push(csvLinhaRelatorio(["Relatório BION", p.filtroTexto]));
  linhas.push("");
  linhas.push(csvLinhaRelatorio(["Métrica", "Valor"]));
  linhas.push(csvLinhaRelatorio(["Consultas", dados.total]));
  linhas.push(csvLinhaRelatorio(["Concluídas", dados.concluidas]));
  linhas.push(csvLinhaRelatorio(["Canceladas", dados.canceladas]));
  linhas.push(csvLinhaRelatorio(["Taxa de cancelamento (%)", dados.taxaCancelamento]));
  linhas.push(csvLinhaRelatorio(["Satisfação média", dados.media ? dados.media.toFixed(2) : "-"]));
  linhas.push(csvLinhaRelatorio(["Pacientes ativos", dados.pacientes]));
  linhas.push(csvLinhaRelatorio(["Documentos emitidos", p.documentos]));
  linhas.push(csvLinhaRelatorio(["Arquivos trocados", p.arquivos]));
  linhas.push(csvLinhaRelatorio(["Consentimentos", p.consentimentos]));
  linhas.push("");
  linhas.push(csvLinhaRelatorio(["Consultas — paciente", "médico", "especialidade", "data", "hora", "status"]));
  p.consultas.forEach((c) => linhas.push(csvLinhaRelatorio([c.paciente, c.medico, c.especialidade, c.data, c.hora, c.status])));
  linhas.push("");
  linhas.push(csvLinhaRelatorio(["Avaliações — paciente", "médico", "especialidade", "nota", "comentário", "quando"]));
  p.avaliacoes.forEach((a) => linhas.push(csvLinhaRelatorio([a.paciente, a.medico, a.especialidade, a.nota, a.comentario ?? "", a.quando])));
  return "\uFEFF" + linhas.join("\n");
}
