import { useMemo, useState } from "react";
import {
  CalendarCheck, XCircle, Star, FileText, TrendingUp, Users, Download, ChevronDown, ChevronUp,
} from "lucide-react";
import { useBion, type Avaliacao, type Consulta } from "@/lib/bion-store";
import { jsPDF } from "jspdf";

const DIA = 86400000;
const PERIODOS = [
  { k: "7", label: "7 dias" },
  { k: "30", label: "30 dias" },
  { k: "90", label: "90 dias" },
  { k: "todos", label: "Tudo" },
] as const;

type PeriodoKey = (typeof PERIODOS)[number]["k"];

function Metrica({
  icon: Icon,
  label,
  valor,
  detalhe,
  onClick,
  ativo,
}: {
  icon: typeof Star;
  label: string;
  valor: string;
  detalhe: string;
  onClick?: () => void;
  ativo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left bg-card border rounded-2xl p-4 transition ${onClick ? "hover:border-primary cursor-pointer" : ""} ${ativo ? "border-primary ring-2 ring-primary/20" : ""}`}>
      <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div className="mt-3 text-2xl font-bold">{valor}</div>
      <div className="font-medium text-sm">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{detalhe}</div>
    </button>
  );
}

function baixar(nome: string, conteudo: string, mime: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function csvLinha(campos: (string | number)[]) {
  return campos.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
}

type Drill = null | "consultas" | "canceladas" | "concluidas" | "avaliacoes";

export function Relatorios() {
  const { consultas, documentos, avaliacoes, arquivos, consentimentos } = useBion();

  const [periodo, setPeriodo] = useState<PeriodoKey>("todos");
  const [especialidade, setEspecialidade] = useState("todas");
  const [medico, setMedico] = useState("todos");
  const [drill, setDrill] = useState<Drill>(null);

  const opcoes = useMemo(() => {
    const esp = [...new Set(consultas.map((c) => c.especialidade))].sort();
    const med = [...new Set([...consultas.map((c) => c.medico), ...avaliacoes.map((a) => a.medico)])].sort();
    return { esp, med };
  }, [consultas, avaliacoes]);

  const limite = periodo === "todos" ? 0 : Date.now() - Number(periodo) * DIA;

  const consultasFiltradas = useMemo(
    () =>
      consultas.filter(
        (c) =>
          (!limite || c.ts >= limite) &&
          (especialidade === "todas" || c.especialidade === especialidade) &&
          (medico === "todos" || c.medico === medico),
      ),
    [consultas, limite, especialidade, medico],
  );

  const avaliacoesFiltradas = useMemo(
    () =>
      avaliacoes.filter(
        (a) =>
          (!limite || a.ts >= limite) &&
          (especialidade === "todas" || a.especialidade === especialidade) &&
          (medico === "todos" || a.medico === medico),
      ),
    [avaliacoes, limite, especialidade, medico],
  );

  const dados = useMemo(() => {
    const total = consultasFiltradas.length;
    const concluidas = consultasFiltradas.filter((c) => c.status === "concluida").length;
    const canceladas = consultasFiltradas.filter((c) => c.status === "cancelada").length;
    const media = avaliacoesFiltradas.length
      ? avaliacoesFiltradas.reduce((s, a) => s + a.nota, 0) / avaliacoesFiltradas.length
      : 0;

    const porEspecialidade = new Map<string, number>();
    consultasFiltradas.forEach((c) =>
      porEspecialidade.set(c.especialidade, (porEspecialidade.get(c.especialidade) ?? 0) + 1),
    );

    const porMedico = new Map<string, { total: number; soma: number; n: number }>();
    consultasFiltradas.forEach((c) => {
      const m = porMedico.get(c.medico) ?? { total: 0, soma: 0, n: 0 };
      m.total += 1;
      porMedico.set(c.medico, m);
    });
    avaliacoesFiltradas.forEach((a) => {
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
      pacientes: new Set(consultasFiltradas.map((c) => c.paciente)).size,
    };
  }, [consultasFiltradas, avaliacoesFiltradas]);

  const maxEsp = Math.max(1, ...dados.especialidades.map(([, n]) => n));
  const rotuloPeriodo = PERIODOS.find((p) => p.k === periodo)!.label;
  const filtroTexto = `Período: ${rotuloPeriodo} • Especialidade: ${especialidade === "todas" ? "todas" : especialidade} • Médico: ${medico === "todos" ? "todos" : medico}`;

  const exportarCSV = () => {
    const linhas: string[] = [];
    linhas.push(csvLinha(["Relatório BION", filtroTexto]));
    linhas.push("");
    linhas.push(csvLinha(["Métrica", "Valor"]));
    linhas.push(csvLinha(["Consultas", dados.total]));
    linhas.push(csvLinha(["Concluídas", dados.concluidas]));
    linhas.push(csvLinha(["Canceladas", dados.canceladas]));
    linhas.push(csvLinha(["Taxa de cancelamento (%)", dados.taxaCancelamento]));
    linhas.push(csvLinha(["Satisfação média", dados.media ? dados.media.toFixed(2) : "-"]));
    linhas.push(csvLinha(["Pacientes ativos", dados.pacientes]));
    linhas.push(csvLinha(["Documentos emitidos", documentos.length]));
    linhas.push(csvLinha(["Arquivos trocados", arquivos.length]));
    linhas.push(csvLinha(["Consentimentos", consentimentos.length]));
    linhas.push("");
    linhas.push(csvLinha(["Consultas — paciente", "médico", "especialidade", "data", "hora", "status"]));
    consultasFiltradas.forEach((c) =>
      linhas.push(csvLinha([c.paciente, c.medico, c.especialidade, c.data, c.hora, c.status])),
    );
    linhas.push("");
    linhas.push(csvLinha(["Avaliações — paciente", "médico", "especialidade", "nota", "comentário", "quando"]));
    avaliacoesFiltradas.forEach((a) =>
      linhas.push(csvLinha([a.paciente, a.medico, a.especialidade, a.nota, a.comentario ?? "", a.quando])),
    );
    baixar(`bion-relatorio-${Date.now()}.csv`, "\uFEFF" + linhas.join("\n"), "text/csv;charset=utf-8");
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const L = 48;
    const larg = doc.internal.pageSize.getWidth();
    const alt = doc.internal.pageSize.getHeight();
    let y = 56;

    const quebrar = (h: number) => {
      if (y + h > alt - 56) {
        doc.addPage();
        y = 56;
      }
    };

    doc.setFont("helvetica", "bold").setFontSize(20).text("BION — Relatório da plataforma", L, y);
    y += 18;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
    doc.text(filtroTexto, L, y, { maxWidth: larg - L * 2 });
    y += 14;
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, L, y);
    y += 24;
    doc.setTextColor(20);

    const secao = (titulo: string) => {
      quebrar(40);
      doc.setFont("helvetica", "bold").setFontSize(13).text(titulo, L, y);
      y += 16;
      doc.setFont("helvetica", "normal").setFontSize(10);
    };

    const linha = (txt: string) => {
      quebrar(16);
      doc.text(txt, L, y, { maxWidth: larg - L * 2 });
      y += 14;
    };

    secao("Indicadores");
    linha(`Consultas: ${dados.total} (concluídas: ${dados.concluidas}, canceladas: ${dados.canceladas})`);
    linha(`Taxa de cancelamento: ${dados.taxaCancelamento}%`);
    linha(`Satisfação média: ${dados.media ? dados.media.toFixed(1) : "—"} (${avaliacoesFiltradas.length} avaliação(ões))`);
    linha(`Pacientes ativos: ${dados.pacientes}`);
    linha(`Documentos: ${documentos.length} • Arquivos: ${arquivos.length} • Consentimentos: ${consentimentos.length}`);
    y += 8;

    secao("Consultas por especialidade");
    if (!dados.especialidades.length) linha("Sem dados no período.");
    dados.especialidades.forEach(([esp, n]) => linha(`${esp}: ${n}`));
    y += 8;

    secao("Desempenho por médico");
    if (!dados.medicos.length) linha("Sem dados no período.");
    dados.medicos.forEach(([m, v]) =>
      linha(`${m} — ${v.total} consulta(s) • nota média ${v.n ? (v.soma / v.n).toFixed(1) : "—"}`),
    );
    y += 8;

    secao("Avaliações");
    if (!avaliacoesFiltradas.length) linha("Nenhuma avaliação no período.");
    avaliacoesFiltradas.forEach((a) =>
      linha(`${a.quando} — ${a.medico} (${a.especialidade}) • ${a.nota}/5 • ${a.paciente}${a.comentario ? ` — "${a.comentario}"` : ""}`),
    );

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      doc.setFontSize(9).setTextColor(140);
      doc.text(`BION • página ${i} de ${paginas}`, L, alt - 30);
    }
    doc.save(`bion-relatorio-${Date.now()}.pdf`);
  };

  const abrir = (d: Drill) => setDrill((atual) => (atual === d ? null : d));

  const listaDrill: Consulta[] =
    drill === "consultas"
      ? consultasFiltradas
      : drill === "canceladas"
        ? consultasFiltradas.filter((c) => c.status === "cancelada")
        : drill === "concluidas"
          ? consultasFiltradas.filter((c) => c.status === "concluida")
          : [];

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground mt-1">
            Indicadores em tempo real. Filtre e clique nos cartões para ver o detalhe por trás de cada número.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportarCSV} className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={exportarPDF}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-primary-foreground text-sm font-medium"
            style={{ backgroundColor: "var(--accent)" }}>
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div className="mt-5 bg-card border rounded-2xl p-4 grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="text-muted-foreground text-xs">Período</span>
          <select
            value={periodo}
            onChange={(e) => { setPeriodo(e.target.value as PeriodoKey); setDrill(null); }}
            className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm">
            {PERIODOS.map((p) => (
              <option key={p.k} value={p.k}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground text-xs">Especialidade</span>
          <select
            value={especialidade}
            onChange={(e) => { setEspecialidade(e.target.value); setDrill(null); }}
            className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm">
            <option value="todas">Todas</option>
            {opcoes.esp.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground text-xs">Médico</span>
          <select
            value={medico}
            onChange={(e) => { setMedico(e.target.value); setDrill(null); }}
            className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm">
            <option value="todos">Todos</option>
            {opcoes.med.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metrica icon={CalendarCheck} label="Consultas" valor={String(dados.total)} detalhe={`${dados.concluidas} concluída(s)`} onClick={() => abrir("consultas")} ativo={drill === "consultas"} />
        <Metrica icon={XCircle} label="Taxa de cancelamento" valor={`${dados.taxaCancelamento}%`} detalhe={`${dados.canceladas} cancelada(s)`} onClick={() => abrir("canceladas")} ativo={drill === "canceladas"} />
        <Metrica icon={Star} label="Satisfação média" valor={dados.media ? dados.media.toFixed(1) : "—"} detalhe={`${avaliacoesFiltradas.length} avaliação(ões)`} onClick={() => abrir("avaliacoes")} ativo={drill === "avaliacoes"} />
        <Metrica icon={Users} label="Pacientes ativos" valor={String(dados.pacientes)} detalhe="com consulta registrada" onClick={() => abrir("concluidas")} ativo={drill === "concluidas"} />
      </div>

      {drill && (
        <div className="mt-4 bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold">
              {drill === "avaliacoes" ? "Avaliações detalhadas" : "Consultas detalhadas"}
            </div>
            <button onClick={() => setDrill(null)} className="text-sm text-muted-foreground inline-flex items-center gap-1">
              Fechar <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {drill === "avaliacoes"
              ? (avaliacoesFiltradas.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhum registro para os filtros atuais.</p>
                  : avaliacoesFiltradas.map((a: Avaliacao) => (
                      <div key={a.id} className="rounded-xl border p-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium truncate">{a.medico} • {a.especialidade}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Star className="w-3.5 h-3.5 text-primary fill-primary" /> {a.nota}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{a.paciente} • {a.quando}</div>
                        {a.comentario && <div className="text-sm mt-1">“{a.comentario}”</div>}
                      </div>
                    )))
              : (listaDrill.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhum registro para os filtros atuais.</p>
                  : listaDrill.map((c) => (
                      <div key={c.id} className="rounded-xl border p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{c.paciente} • {c.especialidade}</div>
                          <div className="text-xs text-muted-foreground">{c.medico} • {c.data} às {c.hora}</div>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-muted shrink-0">{c.status}</span>
                      </div>
                    )))}
          </div>
        </div>
      )}

      <div className="mt-4 grid sm:grid-cols-3 gap-4">
        <Metrica icon={FileText} label="Documentos emitidos" valor={String(documentos.length)} detalhe="receitas e atestados" />
        <Metrica icon={TrendingUp} label="Arquivos trocados" valor={String(arquivos.length)} detalhe="exames e anexos" />
        <Metrica icon={FileText} label="Consentimentos" valor={String(consentimentos.length)} detalhe="registros de acesso ao PDF" />
      </div>

      <div className="mt-6 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Consultas por especialidade</div>
        <div className="mt-4 space-y-3">
          {dados.especialidades.length === 0 && <p className="text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>}
          {dados.especialidades.map(([esp, n]) => (
            <button key={esp} onClick={() => { setEspecialidade(esp); setDrill("consultas"); }} className="w-full text-left">
              <div className="flex justify-between text-sm">
                <span className="inline-flex items-center gap-1">{esp} <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /></span>
                <span className="text-muted-foreground">{n}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maxEsp) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Desempenho por médico</div>
        <div className="mt-3 space-y-2">
          {dados.medicos.length === 0 && <p className="text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>}
          {dados.medicos.map(([m, v]) => (
            <button
              key={m}
              onClick={() => { setMedico(m); setDrill("consultas"); }}
              className="w-full rounded-xl border p-3 flex items-center justify-between gap-3 text-left hover:border-primary">
              <div className="min-w-0">
                <div className="font-medium truncate">{m}</div>
                <div className="text-xs text-muted-foreground">{v.total} consulta(s)</div>
              </div>
              <div className="flex items-center gap-1 text-sm shrink-0">
                <Star className={`w-4 h-4 ${v.n ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                {v.n ? (v.soma / v.n).toFixed(1) : "—"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 bg-card border rounded-2xl p-5">
        <div className="font-semibold">Avaliações recentes</div>
        <div className="mt-3 space-y-2">
          {avaliacoesFiltradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação no período.</p>}
          {avaliacoesFiltradas.slice(0, 8).map((a) => (
            <div key={a.id} className="rounded-xl border p-3">
              <div className="flex items-center gap-1 text-sm font-medium">
                {Array.from({ length: a.nota }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-primary fill-primary" />
                ))}
                <span className="ml-2 text-muted-foreground font-normal text-xs">{a.quando}</span>
              </div>
              <div className="text-sm mt-1">{a.medico} • {a.especialidade}</div>
              {a.comentario && <div className="text-sm text-muted-foreground mt-1">“{a.comentario}”</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
