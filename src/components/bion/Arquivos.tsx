import { useRef } from "react";
import { FileText, Download, Upload, User, Stethoscope } from "lucide-react";
import { useBion } from "@/lib/bion-store";

export function Arquivos({ perfil }: { perfil: "paciente" | "medico" }) {
  const { arquivos, adicionarArquivo } = useBion();
  const fileRef = useRef<HTMLInputElement>(null);

  const enviar = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) =>
      adicionarArquivo({
        nome: f.name,
        tipo: f.type.includes("image") ? "Imagem de exame" : "Documento",
        tamanhoKb: Math.max(1, Math.round(f.size / 1024)),
        enviadoPor: perfil,
        consulta: "Envio avulso",
      }),
    );
  };

  return (
    <div className="space-y-3">
      <button onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed text-sm font-medium hover:border-primary hover:text-primary transition">
        <Upload className="w-4 h-4" /> {perfil === "medico" ? "Anexar documento ao paciente" : "Enviar exame"}
      </button>
      <input ref={fileRef} type="file" multiple className="hidden"
        onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />

      {arquivos.map((a) => (
        <div key={a.id} className="bg-card border rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{a.nome}</div>
            <div className="text-sm text-muted-foreground truncate">{a.tipo} • {a.tamanhoKb} KB • {a.data}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {a.enviadoPor === "medico" ? <Stethoscope className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
              Enviado pelo {a.enviadoPor === "medico" ? "médico" : "paciente"} • {a.consulta}
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-muted shrink-0" title="Baixar">
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
