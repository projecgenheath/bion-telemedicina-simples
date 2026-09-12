"use client";

import { useMemo, useState } from "react";
import {
  Shield,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Info,
  ShieldAlert,
  Filter,
  X,
} from "lucide-react";
import {
  useBion,
  type AuditCategoria,
  type AuditLog,
  type AuditSeveridade,
} from "@/lib/bion-store";
import { jsPDF } from "jspdf";

const CATEGORIAS: { k: AuditCategoria; label: string }[] = [
  { k: "autenticacao", label: "Autenticação" },
  { k: "consulta", label: "Consulta" },
  { k: "documento", label: "Documento" },
  { k: "prontuario", label: "Prontuário" },
  { k: "usuario", label: "Usuário" },
  { k: "admin", label: "Administração" },
  { k: "suporte", label: "Suporte" },
  { k: "consentimento", label: "Consentimento" },
  { k: "sistema", label: "Sistema" },
];

const ROLES: { k: string; label: string }[] = [
  { k: "paciente", label: "Paciente" },
  { k: "medico", label: "Médico" },
  { k: "admin", label: "Admin" },
];

const POR_PAGINA = 20;

function corSeveridade(s: AuditSeveridade) {
  if (s === "critical") return "text-red-600 bg-red-50 border-red-200";
  if (s === "warning") return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-blue-600 bg-blue-50 border-blue-200";
}

function iconeSeveridade(s: AuditSeveridade) {
  if (s === "critical") return <ShieldAlert className="w-3.5 h-3.5" />;
  if (s === "warning") return <AlertTriangle className="w-3.5 h-3.5" />;
  return <Info className="w-3.5 h-3.5" />;
}

function formatarData(ts: number) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function csvLinha(valores: (string | number | undefined)[]) {
  return valores
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

function baixar(nome: string, conteudo: string, mime: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditTrail() {
  const { auditLogs, registrarAudit } = useBion();

  const [busca, setBusca] = useState("");
  const [fCategoria, setFCategoria] = useState<"todas" | AuditCategoria>("todas");
  const [fRole, setFRole] = useState("todos");
  const [fSeveridade, setFSeveridade] = useState<"todas" | AuditSeveridade>("todas");
  const [fUsuario, setFUsuario] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(0);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const usuarios = useMemo(() => [...new Set(auditLogs.map((l) => l.usuario))].sort(), [auditLogs]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return auditLogs
      .filter((l) => {
        if (fCategoria !== "todas" && l.categoria !== fCategoria) return false;
        if (fRole !== "todos" && l.role !== fRole) return false;
        if (fSeveridade !== "todas" && l.severidade !== fSeveridade) return false;
        if (fUsuario !== "todos" && l.usuario !== fUsuario) return false;
        if (de && l.ts < new Date(`${de}T00:00:00`).getTime()) return false;
        if (ate && l.ts > new Date(`${ate}T23:59:59`).getTime()) return false;
        if (
          q &&
          ![l.acao, l.usuario, l.detalhes, l.entidade, l.categoria].some((v) =>
            v?.toLowerCase().includes(q),
          )
        )
          return false;
        return true;
      })
      .sort((a, b) => b.ts - a.ts);
  }, [auditLogs, busca, fCategoria, fRole, fSeveridade, fUsuario, de, ate]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginados = useMemo(
    () => filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA),
    [filtrados, pagina],
  );

  const contadores = useMemo(() => {
    const map: Record<string, number> = {};
    filtrados.forEach((l) => {
      map[l.categoria] = (map[l.categoria] ?? 0) + 1;
    });
    return map;
  }, [filtrados]);

  const limpar = () => {
    setBusca("");
    setFCategoria("todas");
    setFRole("todos");
    setFSeveridade("todas");
    setFUsuario("todos");
    setDe("");
    setAte("");
    setPagina(0);
  };

  const exportarCSV = () => {
    const linhas: string[] = [];
    linhas.push(
      csvLinha([
        "Data/Hora",
        "Usuário",
        "Perfil",
        "Ação",
        "Categoria",
        "Severidade",
        "Entidade",
        "Detalhes",
      ]),
    );
    filtrados.forEach((l) =>
      linhas.push(
        csvLinha([
          formatarData(l.ts),
          l.usuario,
          l.role,
          l.acao,
          l.categoria,
          l.severidade,
          l.entidade ?? "",
          l.detalhes ?? "",
        ]),
      ),
    );
    baixar(
      `bion-auditoria-${Date.now()}.csv`,
      "\uFEFF" + linhas.join("\n"),
      "text/csv;charset=utf-8",
    );
    registrarAudit({
      acao: "AUDITORIA_CSV_EXPORTADA",
      categoria: "admin",
      severidade: "info",
      entidade: "auditoria",
      detalhes: `Exportação CSV da auditoria (${filtrados.length} registro(s))`,
    });
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const L = 40;
    const larg = doc.internal.pageSize.getWidth();
    const alt = doc.internal.pageSize.getHeight();
    let y = 50;

    const quebrar = (h: number) => {
      if (y + h > alt - 50) {
        doc.addPage();
        y = 50;
      }
    };

    doc.setFont("helvetica", "bold").setFontSize(18).text("BION — Trilha de Auditoria", L, y);
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")} • ${filtrados.length} registro(s)`,
      L,
      y,
    );
    y += 20;
    doc.setTextColor(20);

    filtrados.forEach((l) => {
      quebrar(44);
      doc.setFont("helvetica", "bold").setFontSize(9);
      doc.text(`[${l.severidade.toUpperCase()}] ${l.acao}`, L, y);
      y += 12;
      doc.setFont("helvetica", "normal").setFontSize(8);
      doc.text(`${formatarData(l.ts)} — ${l.usuario} (${l.role}) — ${l.categoria}`, L, y);
      y += 10;
      if (l.detalhes) {
        doc.setTextColor(80);
        const linhas = doc.splitTextToSize(l.detalhes, larg - L * 2);
        linhas.forEach((linha: string) => {
          quebrar(12);
          doc.text(linha, L, y);
          y += 10;
        });
        doc.setTextColor(20);
      }
      y += 6;
    });

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8).setTextColor(140);
      doc.text(`BION Auditoria • página ${i} de ${paginas}`, L, alt - 28);
    }
    doc.save(`bion-auditoria-${Date.now()}.pdf`);
    registrarAudit({
      acao: "AUDITORIA_PDF_EXPORTADA",
      categoria: "admin",
      severidade: "info",
      entidade: "auditoria",
      detalhes: `Exportação PDF da auditoria (${filtrados.length} registro(s), ${paginas} página(s))`,
    });
  };

  const temFiltro =
    fCategoria !== "todas" ||
    fRole !== "todos" ||
    fSeveridade !== "todas" ||
    fUsuario !== "todos" ||
    de ||
    ate;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" /> Auditoria
          </h1>
          <p className="text-muted-foreground mt-1">
            Trilha completa de eventos e ações da plataforma. Filtre, pesquise e exporte.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={exportarPDF}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-primary-foreground text-sm font-medium"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORIAS.map((c) => {
          const count = contadores[c.k] ?? 0;
          return (
            <button
              key={c.k}
              onClick={() => {
                setFCategoria(fCategoria === c.k ? "todas" : c.k);
                setPagina(0);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                fCategoria === c.k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {c.label}
              {count > 0 && (
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    fCategoria === c.k ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Pesquisar ações, usuários, detalhes..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background text-sm"
          />
        </div>
        <button
          onClick={() => setFiltrosAbertos(!filtrosAbertos)}
          className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted ${
            temFiltro ? "border-primary text-primary" : ""
          }`}
        >
          <Filter className="w-4 h-4" /> Filtros
          {temFiltro && <span className="ml-0.5 w-2 h-2 rounded-full bg-primary" />}
        </button>
        {temFiltro && (
          <button
            onClick={limpar}
            className="inline-flex items-center gap-1 px-2.5 py-2.5 rounded-xl text-xs text-muted-foreground hover:bg-muted"
          >
            <X className="w-3.5 h-3.5" /> Limpar
          </button>
        )}
      </div>

      {filtrosAbertos && (
        <div className="mt-3 bg-card border rounded-2xl p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground text-xs">Perfil</span>
            <select
              value={fRole}
              onChange={(e) => {
                setFRole(e.target.value);
                setPagina(0);
              }}
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            >
              <option value="todos">Todos</option>
              {ROLES.map((r) => (
                <option key={r.k} value={r.k}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground text-xs">Severidade</span>
            <select
              value={fSeveridade}
              onChange={(e) => {
                setFSeveridade(e.target.value as "todas" | AuditSeveridade);
                setPagina(0);
              }}
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            >
              <option value="todas">Todas</option>
              <option value="info">Info</option>
              <option value="warning">Aviso</option>
              <option value="critical">Crítico</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground text-xs">Usuário</span>
            <select
              value={fUsuario}
              onChange={(e) => {
                setFUsuario(e.target.value);
                setPagina(0);
              }}
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            >
              <option value="todos">Todos</option>
              {usuarios.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground text-xs">De</span>
            <input
              type="date"
              value={de}
              onChange={(e) => {
                setDe(e.target.value);
                setPagina(0);
              }}
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground text-xs">Até</span>
            <input
              type="date"
              value={ate}
              onChange={(e) => {
                setAte(e.target.value);
                setPagina(0);
              }}
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            />
          </label>
        </div>
      )}

      <div className="mt-2 text-xs text-muted-foreground">
        {filtrados.length} registro(s) encontrado(s)
      </div>

      <div className="mt-3 space-y-2">
        {paginados.map((l) => (
          <div
            key={l.id}
            className="bg-card border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start gap-3"
          >
            <div
              className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border ${corSeveridade(l.severidade)}`}
            >
              {iconeSeveridade(l.severidade)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{l.acao.replace(/_/g, " ")}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${corSeveridade(l.severidade)}`}
                >
                  {l.severidade === "critical"
                    ? "Crítico"
                    : l.severidade === "warning"
                      ? "Aviso"
                      : "Info"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted border">
                  {CATEGORIAS.find((c) => c.k === l.categoria)?.label ?? l.categoria}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatarData(l.ts)} —{" "}
                <span className="font-medium text-foreground">{l.usuario}</span> (
                {l.role === "medico" ? "Médico" : l.role === "admin" ? "Admin" : "Paciente"})
                {l.entidade && (
                  <>
                    {" "}
                    — <span className="text-primary">{l.entidade}</span>
                    {l.entidadeId && (
                      <span className="text-muted-foreground"> #{l.entidadeId}</span>
                    )}
                  </>
                )}
              </div>
              {l.detalhes && (
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{l.detalhes}</p>
              )}
            </div>
          </div>
        ))}

        {paginados.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum registro encontrado com os filtros aplicados.
          </div>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            disabled={pagina === 0}
            onClick={() => setPagina((p) => p - 1)}
            className="p-2 rounded-xl border hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            Página {pagina + 1} de {totalPaginas}
          </span>
          <button
            disabled={pagina >= totalPaginas - 1}
            onClick={() => setPagina((p) => p + 1)}
            className="p-2 rounded-xl border hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
