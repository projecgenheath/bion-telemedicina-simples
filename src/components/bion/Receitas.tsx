import { useState } from "react";
import { Pill, Award, Download, Plus } from "lucide-react";
import { useBion } from "@/lib/bion-store";

export function Receitas({ perfil }: { perfil: "paciente" | "medico" }) {
  const { documentos, emitirDocumento } = useBion();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"receita" | "atestado">("receita");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");

  const baixar = (nome: string, texto: string) => {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const salvar = () => {
    if (!titulo.trim() || !conteudo.trim()) return;
    emitirDocumento({
      tipo,
      titulo: `${tipo === "receita" ? "Receita" : "Atestado"} — ${titulo.trim()}`,
      medico: "Dra. Ana Ribeiro",
      paciente: "Marina Silva",
      conteudo: conteudo.trim(),
    });
    setTitulo("");
    setConteudo("");
    setAberto(false);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Receitas e atestados</h1>
          <p className="text-muted-foreground mt-1">
            {perfil === "medico" ? "Emita documentos para o paciente" : "Baixe seus documentos quando quiser"}
          </p>
        </div>
        {perfil === "medico" && (
          <button onClick={() => setAberto(true)}
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
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
            placeholder={tipo === "receita" ? "Ex.: Losartana 50mg" : "Ex.: 2 dias de afastamento"}
            className="w-full px-4 py-3 rounded-xl border bg-background" />
          <textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={4}
            placeholder="Orientações completas do documento..."
            className="w-full px-4 py-3 rounded-xl border bg-background" />
          <div className="flex gap-2">
            <button onClick={salvar} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">Emitir</button>
            <button onClick={() => setAberto(false)} className="px-5 py-2.5 rounded-xl border font-medium">Cancelar</button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {documentos.map((d) => {
          const Icon = d.tipo === "receita" ? Pill : Award;
          return (
            <div key={d.id} className="bg-card border rounded-2xl p-4 flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{d.titulo}</div>
                <p className="text-sm text-muted-foreground mt-0.5">{d.conteudo}</p>
                <div className="text-xs text-muted-foreground mt-1.5">{d.medico} • {d.data}</div>
              </div>
              <button onClick={() => baixar(d.titulo, `${d.titulo}\n\nPaciente: ${d.paciente}\nMédico: ${d.medico}\nData: ${d.data}\n\n${d.conteudo}\n\nBION — Telemedicina`)}
                className="p-2 rounded-lg hover:bg-muted shrink-0" title="Baixar">
                <Download className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
