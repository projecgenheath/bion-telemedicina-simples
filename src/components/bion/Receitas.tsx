import { useEffect, useMemo, useState } from "react";
import { Pill, Award, Download, Plus, Search, X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useBion, type Documento } from "@/lib/bion-store";

export function docTexto(d: Documento) {
  const linhas = [
    d.titulo,
    "",
    `Paciente: ${d.paciente}`,
    `Médico: ${d.medico}`,
    `Data: ${d.data}`,
    "",
    d.medicamento ? `Medicamento: ${d.medicamento}` : "",
    d.posologia ? `Posologia: ${d.posologia}` : "",
    d.duracao ? `Duração: ${d.duracao}` : "",
    "",
    d.conteudo,
    d.observacoes ? `\nObservações: ${d.observacoes}` : "",
    "",
    "BION — Telemedicina",
  ];
  return linhas.filter((l) => l !== "").join("\n");
}

export function baixarDoc(d: Documento) {
  const blob = new Blob([docTexto(d)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${d.titulo.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Visualizador embutido ---------- */
export function VisualizadorDoc({ docs, index, onIndex, onClose }: {
  docs: Documento[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const d = docs[index];
  if (!d) return null;
  const Icon = d.tipo === "receita" ? Pill : Award;
  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{d.titulo}</div>
            <div className="text-xs text-muted-foreground truncate">{d.medico} • {d.data}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="rounded-2xl border bg-background p-5 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Documento digital assinado</div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Campo label="Paciente" valor={d.paciente} />
              <Campo label="Médico" valor={d.medico} />
              {d.medicamento && <Campo label="Medicamento" valor={d.medicamento} />}
              {d.posologia && <Campo label="Posologia" valor={d.posologia} />}
              {d.duracao && <Campo label="Duração" valor={d.duracao} />}
              <Campo label="Emitido em" valor={d.data} />
            </div>
            <div className="pt-3 border-t">
              <div className="text-xs text-muted-foreground mb-1">Descrição</div>
              <p className="text-sm whitespace-pre-wrap">{d.conteudo}</p>
            </div>
            {d.observacoes && (
              <div className="pt-3 border-t">
                <div className="text-xs text-muted-foreground mb-1">Observações</div>
                <p className="text-sm whitespace-pre-wrap">{d.observacoes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex items-center gap-2">
          <button disabled={index === 0} onClick={() => onIndex(index - 1)}
            className="p-2.5 rounded-xl border disabled:opacity-40" aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></button>
          <button disabled={index >= docs.length - 1} onClick={() => onIndex(index + 1)}
            className="p-2.5 rounded-xl border disabled:opacity-40" aria-label="Próximo"><ChevronRight className="w-4 h-4" /></button>
          <span className="text-xs text-muted-foreground">{index + 1} de {docs.length}</span>
          <button onClick={() => baixarDoc(d)}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-primary-foreground font-semibold"
            style={{ backgroundColor: "var(--accent)" }}>
            <Download className="w-4 h-4" /> Baixar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function dataDoc(d: Documento) {
  const m = d.data.toLowerCase().match(/(\d{1,2})\s+([a-zç]{3})[a-zç]*\s*(\d{4})?/);
  if (!m) return new Date();
  const mes = MESES.indexOf(m[2]!.slice(0, 3));
  return new Date(Number(m[3] ?? new Date().getFullYear()), mes < 0 ? 0 : mes, Number(m[1]));
}

export function Receitas({ perfil }: { perfil: "paciente" | "medico" }) {
  const { documentosVisiveis: documentos, emitirDocumento, sessao } = useBion();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"receita" | "atestado">("receita");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [medicamento, setMedicamento] = useState("");
  const [posologia, setPosologia] = useState("");
  const [duracao, setDuracao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  // filtros
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState<"todos" | "receita" | "atestado">("todos");
  const [fMedico, setFMedico] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [visualizando, setVisualizando] = useState<number | null>(null);
  const PAGINA = 5;
  const [limite, setLimite] = useState(PAGINA);

  const medicos = useMemo(() => Array.from(new Set(documentos.map((d) => d.medico))), [documentos]);

  useEffect(() => { setLimite(PAGINA); }, [busca, fTipo, fMedico, de, ate]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return documentos.filter((d) => {
      if (fTipo !== "todos" && d.tipo !== fTipo) return false;
      if (fMedico !== "todos" && d.medico !== fMedico) return false;
      if (q && ![d.titulo, d.conteudo, d.medicamento, d.observacoes, d.medico].some((v) => v?.toLowerCase().includes(q))) return false;
      const dt = dataDoc(d);
      if (de && dt < new Date(`${de}T00:00:00`)) return false;
      if (ate && dt > new Date(`${ate}T23:59:59`)) return false;
      return true;
    });
  }, [documentos, busca, fTipo, fMedico, de, ate]);

  const visiveis = useMemo(() => filtrados.slice(0, limite), [filtrados, limite]);

  const limpar = () => { setLimite(PAGINA); setBusca(""); setFTipo("todos"); setFMedico("todos"); setDe(""); setAte(""); };
  const filtroAtivo = busca || fTipo !== "todos" || fMedico !== "todos" || de || ate;

  const salvar = () => {
    const e: Record<string, string> = {};
    if (titulo.trim().length < 3) e['titulo'] = "Informe um título com pelo menos 3 caracteres.";
    if (tipo === "receita" && medicamento.trim().length < 2) e['medicamento'] = "Informe o medicamento.";
    if (tipo === "receita" && posologia.trim().length < 3) e['posologia'] = "Informe a posologia (ex.: 1 comprimido ao dia).";
    if (duracao.trim().length < 1) e['duracao'] = tipo === "receita" ? "Informe a duração do tratamento." : "Informe o período de afastamento.";
    if (conteudo.trim().length < 10) e['conteudo'] = "Descreva o documento com pelo menos 10 caracteres.";
    if (observacoes.length > 500) e['observacoes'] = "Máximo de 500 caracteres.";
    setErros(e);
    if (Object.keys(e).length) return;

    emitirDocumento({
      tipo,
      titulo: `${tipo === "receita" ? "Receita" : "Atestado"} — ${titulo.trim()}`,
      medico: sessao.role === "medico" ? sessao.nome : "Dra. Ana Ribeiro",
      paciente: "Marina Silva",
      conteudo: conteudo.trim(),
      ...(tipo === "receita" ? { medicamento: medicamento.trim(), posologia: posologia.trim() } : {}),
      duracao: duracao.trim(),
      ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
    });
    setTitulo(""); setConteudo(""); setMedicamento(""); setPosologia(""); setDuracao(""); setObservacoes("");
    setErros({});
    setAberto(false);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Receitas e atestados</h1>
          <p className="text-muted-foreground mt-1">
            {perfil === "medico" ? "Emita documentos para o paciente" : "Encontre, abra e baixe seus documentos"}
          </p>
        </div>
        {perfil === "medico" && (
          <button onClick={() => setAberto((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-primary-foreground font-medium"
            style={{ backgroundColor: "var(--accent)" }}>
            <Plus className="w-4 h-4" /> Emitir documento
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-6 bg-card border rounded-2xl p-5 space-y-3">
          <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
            {(["receita", "atestado"] as const).map((t) => (
              <button key={t} onClick={() => setTipo(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize ${tipo === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>

          <Field label="Título" erro={erros['titulo']}>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80}
              placeholder={tipo === "receita" ? "Ex.: Losartana 50mg" : "Ex.: 2 dias de afastamento"}
              className="w-full px-4 py-3 rounded-xl border bg-background" />
          </Field>

          {tipo === "receita" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Medicamento" erro={erros['medicamento']}>
                <input value={medicamento} onChange={(e) => setMedicamento(e.target.value)} maxLength={80}
                  placeholder="Ex.: Losartana 50mg" className="w-full px-4 py-3 rounded-xl border bg-background" />
              </Field>
              <Field label="Posologia" erro={erros['posologia']}>
                <input value={posologia} onChange={(e) => setPosologia(e.target.value)} maxLength={120}
                  placeholder="Ex.: 1 comprimido ao dia, pela manhã" className="w-full px-4 py-3 rounded-xl border bg-background" />
              </Field>
            </div>
          )}

          <Field label={tipo === "receita" ? "Duração do tratamento" : "Período de afastamento"} erro={erros['duracao']}>
            <input value={duracao} onChange={(e) => setDuracao(e.target.value)} maxLength={40}
              placeholder={tipo === "receita" ? "Ex.: 30 dias" : "Ex.: 2 dias"}
              className="w-full px-4 py-3 rounded-xl border bg-background" />
          </Field>

          <Field label="Descrição" erro={erros['conteudo']}>
            <textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={3} maxLength={800}
              placeholder="Orientações completas do documento..."
              className="w-full px-4 py-3 rounded-xl border bg-background" />
          </Field>

          <Field label="Observações (opcional)" erro={erros['observacoes']}>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={500}
              placeholder="Ex.: retornar em 30 dias com exames."
              className="w-full px-4 py-3 rounded-xl border bg-background" />
          </Field>

          <div className="flex gap-2 pt-1">
            <button onClick={salvar} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">Emitir</button>
            <button onClick={() => { setAberto(false); setErros({}); }} className="px-5 py-2.5 rounded-xl border font-medium">Cancelar</button>
          </div>
        </div>
      )}

      {/* Busca e filtros */}
      <div className="mt-6 bg-card border rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={80}
            placeholder="Buscar por medicamento, médico ou texto"
            className="w-full pl-10 pr-4 py-3 rounded-xl border bg-background" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value as typeof fTipo)}
            className="px-3 py-2.5 rounded-xl border bg-background text-sm">
            <option value="todos">Todos os tipos</option>
            <option value="receita">Somente receitas</option>
            <option value="atestado">Somente atestados</option>
          </select>
          <select value={fMedico} onChange={(e) => setFMedico(e.target.value)}
            className="px-3 py-2.5 rounded-xl border bg-background text-sm">
            <option value="todos">Todos os médicos</option>
            {medicos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border bg-background text-foreground" />
          </label>
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border bg-background text-foreground" />
          </label>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Exibindo {Math.min(limite, filtrados.length)} de {filtrados.length} documento(s)</span>
          {filtroAtivo ? <button onClick={limpar} className="underline">Limpar filtros</button> : null}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {filtrados.length === 0 && (
          <div className="bg-card border rounded-2xl p-8 text-center text-muted-foreground text-sm">
            Nenhum documento encontrado com esses filtros.
          </div>
        )}
        {visiveis.map((d, i) => {
          const Icon = d.tipo === "receita" ? Pill : Award;
          return (
            <div key={d.id} className="bg-card border rounded-2xl p-4 flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <button onClick={() => setVisualizando(i)} className="flex-1 min-w-0 text-left">
                <div className="font-semibold">{d.titulo}</div>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{d.conteudo}</p>
                <div className="text-xs text-muted-foreground mt-1.5">{d.medico} • {d.data}</div>
              </button>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setVisualizando(i)} className="p-2 rounded-lg hover:bg-muted" title="Visualizar">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => baixarDoc(d)} className="p-2 rounded-lg hover:bg-muted" title="Baixar">
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {limite < filtrados.length && (
        <button onClick={() => setLimite((l) => l + PAGINA)}
          className="mt-4 w-full py-3 rounded-2xl border font-medium text-sm hover:bg-muted">
          Carregar mais ({filtrados.length - limite} restantes)
        </button>
      )}

      {visualizando !== null && (
        <VisualizadorDoc docs={visiveis} index={visualizando} onIndex={setVisualizando} onClose={() => setVisualizando(null)} />
      )}
    </div>
  );
}

function Field({ label, erro, children }: { label: string; erro?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
      {children}
      {erro && <div className="text-xs text-destructive mt-1">{erro}</div>}
    </div>
  );
}
