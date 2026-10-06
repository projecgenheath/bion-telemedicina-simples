/**
 * Testes das regras puras dos Relatórios (Torre BION).
 * Rodar: bun --conditions react-server src/components/bion/admin/relatorios/relatorios.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso da máquina)
 */
import type { Avaliacao, Consulta } from "@/lib/bion-tipos";
import {
  FILTROS_RELATORIO_PADRAO,
  calcularRelatorio,
  csvLinhaRelatorio,
  csvRelatorio,
  filtrarAvaliacoesRelatorio,
  filtrarConsultasRelatorio,
  limiteDoPeriodo,
  notaMedia,
  opcoesRelatorio,
  pacientesDoRecorte,
  textoFiltro,
} from "./relatorio";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
const sp = (s: string) => Date.parse(`${s}-03:00`);
const agora = sp("2026-10-06T10:00:00");
const D = 86_400_000;

let n = 0;
const c = (dias: number, medico: string, especialidade: string, paciente: string, status: Consulta["status"] = "concluida"): Consulta =>
  ({ id: `c${++n}`, paciente, medico, especialidade, data: "05 Out", hora: "14:00", ts: agora - dias * D, status, valor: "R$ 150,00" }) as Consulta;
const consultas: Consulta[] = [
  c(1, "Dra. A", "Clínica Geral", "Paulo"),
  c(2, "Dra. A", "Clínica Geral", "Ana", "cancelada"),
  c(10, "Dr. B", "Cardiologia", "Paulo", "confirmada"),
  c(40, "Dr. B", "Cardiologia", 'Rita "Ri"'),
  c(100, "Dra. A", "Clínica Geral", "Ana"),
];
const av = (dias: number, medico: string, nota: number, comentario?: string): Avaliacao => ({
  id: `a${dias}`,
  paciente: "Paulo",
  medico,
  especialidade: medico === "Dr. B" ? "Cardiologia" : "Clínica Geral",
  nota,
  comentario,
  quando: "há 1 dia",
  ts: agora - dias * D,
});
const avaliacoes: Avaliacao[] = [av(1, "Dra. A", 5, "Ótima; atenciosa"), av(20, "Dr. B", 4), av(50, "Dr. C", 3)];

/* ---------------- filtros ---------------- */
igual("tudo = sem limite", limiteDoPeriodo("todos", agora), 0);
igual("7 dias = janela móvel", limiteDoPeriodo("7", agora), agora - 7 * D);
igual("filtro 7 dias", filtrarConsultasRelatorio(consultas, { ...FILTROS_RELATORIO_PADRAO, periodo: "7" }, agora).map((x) => x.id), ["c1", "c2"]);
igual("filtro 30 dias + médico", filtrarConsultasRelatorio(consultas, { periodo: "30", especialidade: "todas", medico: "Dr. B" }, agora).map((x) => x.id), ["c3"]);
igual("filtro especialidade", filtrarConsultasRelatorio(consultas, { periodo: "todos", especialidade: "Cardiologia", medico: "todos" }, agora).length, 2);
igual("avaliações 30 dias", filtrarAvaliacoesRelatorio(avaliacoes, { ...FILTROS_RELATORIO_PADRAO, periodo: "30" }, agora).map((a) => a.id), ["a1", "a20"]);
igual("opções (médicos das consultas e das avaliações)", opcoesRelatorio(consultas, avaliacoes), { esp: ["Cardiologia", "Clínica Geral"], med: ["Dr. B", "Dr. C", "Dra. A"] });

/* ---------------- números (mesmo cálculo da tela antiga) ---------------- */
const dados = calcularRelatorio(consultas, avaliacoes);
igual("totais", [dados.total, dados.concluidas, dados.canceladas, dados.taxaCancelamento, dados.pacientes], [5, 3, 1, 20, 3]);
igual("média", dados.media.toFixed(2), "4.00");
igual("especialidades ordenadas", dados.especialidades, [["Clínica Geral", 3], ["Cardiologia", 2]]);
igual("médicos ordenados por consultas, com nota", dados.medicos.map(([m, v]) => [m, v.total, notaMedia(v)]), [["Dra. A", 3, "5.0"], ["Dr. B", 2, "4.0"], ["Dr. C", 0, "3.0"]]);
igual("vazio", calcularRelatorio([], []), { total: 0, concluidas: 0, canceladas: 0, media: 0, taxaCancelamento: 0, especialidades: [], medicos: [], pacientes: 0 });
igual("pacientes do recorte", pacientesDoRecorte(consultas).map((p) => [p.nome, p.consultas]), [["Ana", 2], ["Paulo", 2], ['Rita "Ri"', 1]]);
igual("última consulta do paciente", pacientesDoRecorte(consultas)[1].ultima, agora - D);
igual("texto do filtro", textoFiltro({ periodo: "30", especialidade: "todas", medico: "Dr. B" }), "Período: 30 dias • Especialidade: todas • Médico: Dr. B");

/* ---------------- CSV: MESMA lógica do Relatorios antigo ---------------- */
// Cópia literal de csvLinha e da montagem de exportarCSV de src/components/bion/Relatorios.tsx (referência).
const csvLinhaAntiga = (campos: (string | number)[]) => campos.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";");
function csvAntigo(filtroTexto: string, d: typeof dados, cs: Consulta[], as: Avaliacao[], docs: number, arqs: number, cons: number) {
  const linhas: string[] = [];
  linhas.push(csvLinhaAntiga(["Relatório BION", filtroTexto]));
  linhas.push("");
  linhas.push(csvLinhaAntiga(["Métrica", "Valor"]));
  linhas.push(csvLinhaAntiga(["Consultas", d.total]));
  linhas.push(csvLinhaAntiga(["Concluídas", d.concluidas]));
  linhas.push(csvLinhaAntiga(["Canceladas", d.canceladas]));
  linhas.push(csvLinhaAntiga(["Taxa de cancelamento (%)", d.taxaCancelamento]));
  linhas.push(csvLinhaAntiga(["Satisfação média", d.media ? d.media.toFixed(2) : "-"]));
  linhas.push(csvLinhaAntiga(["Pacientes ativos", d.pacientes]));
  linhas.push(csvLinhaAntiga(["Documentos emitidos", docs]));
  linhas.push(csvLinhaAntiga(["Arquivos trocados", arqs]));
  linhas.push(csvLinhaAntiga(["Consentimentos", cons]));
  linhas.push("");
  linhas.push(csvLinhaAntiga(["Consultas — paciente", "médico", "especialidade", "data", "hora", "status"]));
  cs.forEach((x) => linhas.push(csvLinhaAntiga([x.paciente, x.medico, x.especialidade, x.data, x.hora, x.status])));
  linhas.push("");
  linhas.push(csvLinhaAntiga(["Avaliações — paciente", "médico", "especialidade", "nota", "comentário", "quando"]));
  as.forEach((a) => linhas.push(csvLinhaAntiga([a.paciente, a.medico, a.especialidade, a.nota, a.comentario ?? "", a.quando])));
  return "\uFEFF" + linhas.join("\n");
}
igual("csvLinha igual ao antigo", csvLinhaRelatorio(['a"b', 1, "c;d"]), csvLinhaAntiga(['a"b', 1, "c;d"]));
const ft = textoFiltro(FILTROS_RELATORIO_PADRAO);
igual(
  "CSV inteiro igual ao antigo",
  csvRelatorio({ filtroTexto: ft, dados, consultas, avaliacoes, documentos: 2, arquivos: 1, consentimentos: 0 }),
  csvAntigo(ft, dados, consultas, avaliacoes, 2, 1, 0),
);
const vazio = calcularRelatorio([], []);
igual("CSV vazio igual ao antigo (satisfação '-')", csvRelatorio({ filtroTexto: ft, dados: vazio, consultas: [], avaliacoes: [], documentos: 0, arquivos: 0, consentimentos: 0 }), csvAntigo(ft, vazio, [], [], 0, 0, 0));

console.log(`relatorios: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? "padrão"}]`);
if (falhas) process.exit(1);
