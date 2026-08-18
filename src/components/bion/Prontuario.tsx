import { useMemo, useState } from "react";
import { Pill, Award, Stethoscope, FileText, Eye, Download, ShieldCheck, X, History } from "lucide-react";
import { gerarProntuarioPDF } from "@/lib/prontuario-pdf";
import { useBion, type Documento } from "@/lib/bion-store";
import { VisualizadorDoc, dataDoc } from "./Receitas";

type Evento = {
  id: string;
  quando: string;
  ordem: number;
  tipo: "receita" | "atestado" | "consulta" | "exame";
  titulo: string;
  detalhe: string;
  doc?: Documento;
};

const ICONES = { receita: Pill, atestado: Award, consulta: Stethoscope, exame: FileText };
const ROTULOS = { receita: "Receita", atestado: "Atestado", consulta: "Consulta", exame: "Exame" };

export function Prontuario() {
  const { documentosVisiveis: documentos, consultas, arquivos, sessao, consentimentosVisiveis, registrarConsentimento } = useBion();
  const [filtro, setFiltro] = useState<"todos" | Evento["tipo"]>("todos");
  const [visualizando, setVisualizando] = useState<number | null>(null);
  const [consentAberto, setConsentAberto] = useState(false);
  const [aceite, setAceite] = useState(false);

  const docs = useMemo(() => documentos, [documentos]);

  const medicamentos = useMemo(
    () =>
      documentos
        .filter((d) => d.tipo === "receita")
        .map((d) => ({
          id: d.id,
          nome: d.medicamento ?? d.titulo.replace(/^Receita\s*—\s*/, ""),
          posologia: d.posologia ?? d.conteudo,
          duracao: d.duracao ?? "—",
          medico: d.medico,
        })),
    [documentos],
  );

  const eventos = useMemo<Evento[]>(() => {
    const list: Evento[] = [];
    documentos.forEach((d) =>
      list.push({
        id: d.id, quando: d.data, ordem: dataDoc(d).getTime(), tipo: d.tipo,
        titulo: d.titulo, detalhe: `${d.medico}${d.posologia ? ` • ${d.posologia}` : ""}`, doc: d,
      }),
    );
    consultas
      .filter((c) => c.status === "concluida")
      .forEach((c) =>
        list.push({
          id: c.id, quando: `${c.data} • ${c.hora}`, ordem: Date.now() - 1, tipo: "consulta",
          titulo: `Consulta de ${c.especialidade}`, detalhe: c.medico,
        }),
      );
    arquivos.forEach((a) =>
      list.push({
        id: a.id, quando: a.data, ordem: Date.parse(a.data) || 0, tipo: "exame",
        titulo: a.nome, detalhe: `${a.tipo} • enviado pelo ${a.enviadoPor}`,
      }),
    );
    return list.sort((a, b) => b.ordem - a.ordem);
  }, [documentos, consultas, arquivos]);

  const visiveis = filtro === "todos" ? eventos : eventos.filter((e) => e.tipo === filtro);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Prontuário</h1>
          <p className="text-muted-foreground mt-1">Receitas, atestados, exames e consultas em uma linha do tempo única.</p>
        </div>
        <button
          onClick={() => { setAceite(false); setConsentAberto(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-primary-foreground font-medium"
          style={{ backgroundColor: "var(--accent)" }}>
          <Download className="w-4 h-4" /> Baixar PDF
        </button>
      </div>

      <div className="mt-6 bg-card border rounded-2xl p-5">
        <div className="font-semibold flex items-center gap-2"><Pill className="w-4 h-4 text-primary" /> Medicamentos em uso</div>
        <div className="mt-3 space-y-2">
          {medicamentos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum medicamento ativo.</p>}
          {medicamentos.map((m) => (
            <div key={m.id} className="rounded-xl border p-3">
              <div className="font-medium">{m.nome}</div>
              <div className="text-sm text-muted-foreground">{m.posologia}</div>
              <div className="text-xs text-muted-foreground mt-1">Duração: {m.duracao} • {m.medico}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        {(["todos", "receita", "atestado", "exame", "consulta"] as const).map((t) => (
          <button key={t} onClick={() => setFiltro(t)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border ${filtro === t ? "bg-primary-soft text-primary border-transparent" : "text-muted-foreground"}`}>
            {t === "todos" ? "Tudo" : `${ROTULOS[t]}s`}
          </button>
        ))}
      </div>

      <div className="mt-4 relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
        <div className="space-y-3">
          {visiveis.map((e) => {
            const Icon = ICONES[e.tipo];
            const docIndex = e.doc ? docs.findIndex((d) => d.id === e.doc!.id) : -1;
            return (
              <div key={`${e.tipo}-${e.id}`} className="relative bg-card border rounded-2xl p-4 flex items-start gap-3">
                <span className="absolute -left-[18px] top-6 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">{ROTULOS[e.tipo]} • {e.quando}</div>
                  <div className="font-semibold truncate">{e.titulo}</div>
                  <div className="text-sm text-muted-foreground">{e.detalhe}</div>
                </div>
                {docIndex >= 0 && (
                  <button onClick={() => setVisualizando(docIndex)} className="p-2 rounded-lg hover:bg-muted shrink-0" title="Abrir documento">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {visualizando !== null && (
        <VisualizadorDoc docs={docs} index={visualizando} onIndex={setVisualizando} onClose={() => setVisualizando(null)} />
      )}
    </div>
  );
}
