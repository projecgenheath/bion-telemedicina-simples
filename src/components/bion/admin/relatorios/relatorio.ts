/**
 * Regras puras dos Relatórios do admin (Torre BION). Mesmos números,
 * mesmos filtros e o MESMO CSV do Relatorios antigo
 * (src/components/bion/Relatorios.tsx); o "agora" entra como parâmetro.
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
export type DadosRelatorio = {
  total: number;
  concluidas: number;
  canceladas: number;
  media: number;
  taxaCancelamento: number;
  especialidades: [string, number][];
  medicos: [string, DesempenhoMedico][];
  pacientes: number;
};

/** Exatamente o cálculo da tela antiga. */
export function calcularRelatorio(consultas: Consulta[], avaliacoes: Avaliacao[]): DadosRelatorio {
  const total = consultas.length;
  const concluidas = consultas.filter((c) => c.status === "concluida").length;
  const canceladas = consultas.filter((c) => c.status === "cancelada").length;
  const media = avaliacoes.length ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length : 0;

  const porEspecialidade = new Map<string, number>();
  consultas.forEach((c) => porEspecialidade.set(c.especialidade, (porEspecialidade.get(c.especialidade) ?? 0) + 1));

  const porMedico = new Map<string, DesempenhoMedico>();
  consultas.forEach((c) => {
    const m = porMedico.get(c.medico) ?? { total: 0, soma: 0, n: 0 };
    m.total += 1;
    porMedico.set(c.medico, m);
  });
  avaliacoes.forEach((a) => {
    const m = porMedico.get(a.medico) ?? { total: 0, soma: 0, n: 0 };
    m.soma += a.nota;
    m.n += 1;
    porMedico.set(a.medico, m);
  });

  return {
    total,
    concluidas,
    canceladas,
    media,
    taxaCancelamento: total ? Math.round((canceladas / total) * 100) : 0,
    especialidades: [...porEspecialidade.entries()].sort((a, b) => b[1] - a[1]),
    medicos: [...porMedico.entries()].sort((a, b) => b[1].total - a[1].total),
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
