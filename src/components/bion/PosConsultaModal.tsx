import { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Star,
  FileText,
  Download,
  Pill,
  Award,
  ArrowRight,
  ShieldCheck,
  Heart,
  Calendar,
  Sparkles,
  MessageSquare,
  Clock,
} from "lucide-react";
import { useBion, type Documento } from "@/lib/bion-store";
import { gerarDocumentoPDF } from "@/lib/receita-pdf";

export function PosConsultaModal({
  medico = "Dra. Ana Ribeiro",
  especialidade = "Clínica Geral",
  onClose,
}: {
  medico?: string;
  especialidade?: string;
  onClose: () => void;
}) {
  const { documentosVisiveis, avaliarConsulta } = useBion();

  const [nota, setNota] = useState(5);
  const [pontualidade, setPontualidade] = useState(5);
  const [atencao, setAtencao] = useState(5);
  const [clareza, setClareza] = useState(5);
  const [comentario, setComentario] = useState("");
  const [avaliado, setAvaliado] = useState(false);

  // Documentos gerados recentemente para este atendimento
  const docsRecentes = documentosVisiveis.slice(0, 3);

  const enviarAvaliacao = () => {
    avaliarConsulta({
      paciente: "Marina Silva",
      medico,
      especialidade,
      nota,
      comentario: comentario.trim() || undefined,
      pontualidade,
      atencao,
      clareza,
    });
    setAvaliado(true);
    toast.success("Avaliação enviada!", {
      description: "Obrigado pelo feedback. Ela ajuda outros pacientes a escolherem bem.",
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl space-y-6 my-auto">
        {/* Topo do Modal */}
        <div className="text-center space-y-2">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-md"
            style={{ backgroundColor: "var(--accent-soft)" }}
          >
            <Check className="w-8 h-8" style={{ color: "var(--accent)" }} />
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
            Consulta Finalizada com Sucesso!
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Atendimento com <strong>{medico}</strong> ({especialidade}) concluído. Seus documentos
            digitais assinados já estão prontos.
          </p>
        </div>

        {/* Resumo do Atendimento & Documentos Emitidos */}
        <div className="p-5 rounded-2xl bg-muted/60 border space-y-3 text-xs">
          <div className="font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" /> Documentos & Orientações Médicas:
          </div>

          <div className="space-y-2">
            {docsRecentes.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhum medicamento ou atestado precisou ser emitido nesta consulta.
              </p>
            ) : (
              docsRecentes.map((d) => (
                <div
                  key={d.id}
                  className="bg-card border rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary-soft flex items-center justify-center text-primary shrink-0">
                      {d.tipo === "receita" ? (
                        <Pill className="w-4 h-4" />
                      ) : (
                        <Award className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-foreground truncate">{d.titulo}</div>
                      <div className="text-muted-foreground text-[11px] truncate">
                        Assinado digitalmente • {d.data}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      gerarDocumentoPDF(d);
                      toast.success("PDF baixado com sucesso");
                    }}
                    className="px-3 py-1.5 rounded-lg text-primary-foreground font-bold text-xs flex items-center gap-1 shrink-0 hover:opacity-90 shadow-sm"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    <Download className="w-3.5 h-3.5" /> Baixar PDF
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <span>
              Retorno sugerido pela médica: <strong>Em 30 dias</strong> para reavaliação clínica.
            </span>
          </div>
        </div>

        {/* Formulário de Avaliação */}
        {!avaliado ? (
          <div className="space-y-4 pt-2 border-t">
            <div className="text-center">
              <div className="text-sm font-bold text-foreground">
                Como foi sua experiência de telemedicina?
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Sua avaliação ajuda outros pacientes e apoia o médico.
              </div>
            </div>

            {/* Estrelas Principais */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(n)}
                  className="p-1.5 hover:scale-110 transition active:scale-95"
                >
                  <Star
                    className={`w-8 h-8 ${
                      n <= nota ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Critérios Específicos */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {(
                [
                  { label: "Pontualidade", valor: pontualidade, set: setPontualidade },
                  { label: "Atenção Médica", valor: atencao, set: setAtencao },
                  { label: "Clareza", valor: clareza, set: setClareza },
                ] as const
              ).map((c) => (
                <div key={c.label} className="p-2 rounded-xl bg-muted/40 border space-y-1">
                  <span className="text-muted-foreground block text-[11px]">{c.label}</span>
                  <div className="flex justify-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => c.set(n)}
                        className="hover:scale-125 transition"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            n <= c.valor
                              ? "text-amber-400 fill-amber-400"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <textarea
              placeholder="Deixe um elogio ou comentário sobre o atendimento (opcional)..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-2xl border text-xs bg-background outline-none focus:ring-2 focus:ring-primary/20"
            />

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border text-xs font-bold text-muted-foreground hover:bg-muted transition"
              >
                Avaliar mais tarde
              </button>
              <button
                onClick={enviarAvaliacao}
                className="flex-1 py-3 rounded-xl text-primary-foreground text-xs font-bold shadow-md hover:opacity-90 transition"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Enviar Avaliação
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-accent-soft text-center space-y-3">
            <Heart className="w-8 h-8 mx-auto" style={{ color: "var(--accent)" }} />
            <div className="font-bold text-sm text-foreground">
              Muito obrigado pela sua avaliação!
            </div>
            <p className="text-xs text-muted-foreground">
              Seu feedback foi entregue com sucesso e já está registrado na plataforma.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow hover:opacity-90 transition"
            >
              Concluir e Voltar ao Início
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
