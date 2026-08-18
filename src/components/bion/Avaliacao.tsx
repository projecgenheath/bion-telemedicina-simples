import { useState } from "react";
import { Star, X } from "lucide-react";
import { useBion } from "@/lib/bion-store";

export function AvaliacaoModal({
  medico,
  especialidade,
  onClose,
}: {
  medico: string;
  especialidade: string;
  onClose: () => void;
}) {
  const { sessao, avaliarConsulta } = useBion();
  const [nota, setNota] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");

  const enviar = () => {
    if (nota < 1) return;
    avaliarConsulta({
      paciente: sessao.nome,
      medico,
      especialidade,
      nota,
      comentario: comentario.trim().slice(0, 500) || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4">
      <div className="bg-card text-foreground border rounded-2xl w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-lg">Como foi sua consulta?</div>
            <p className="text-sm text-muted-foreground mt-1">
              {medico} • {especialidade}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Fechar">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
              onClick={() => setNota(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-1">
              <Star
                className={`w-8 h-8 ${(hover || nota) >= n ? "text-primary fill-primary" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          placeholder="Quer contar algo? (opcional)"
          className="mt-4 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-medium">
            Agora não
          </button>
          <button
            onClick={enviar}
            disabled={nota < 1}
            className="px-4 py-2.5 rounded-xl text-primary-foreground text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}>
            Enviar avaliação
          </button>
        </div>
      </div>
    </div>
  );
}
