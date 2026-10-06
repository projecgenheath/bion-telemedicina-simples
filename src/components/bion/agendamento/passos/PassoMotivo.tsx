"use client";

import {
  ChevronRight,
  Star,
  Check,
  CreditCard,
  QrCode,
  FileText,
  Upload,
  Trash2,
  Copy,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";
import {
  ESPECIALIDADES,
  SINTOMAS_RAPIDOS,
} from "@/components/bion/agendamento/constantes";

export function PassoMotivo(p: AgendamentoCorpoProps) {
  const {
    especialidade,
    setEspecialidade,
    medicos,
    medicosFiltrados,
    medicoSelecionado,
    setMedicoSelecionado,
    setMedicoModal,
    proximoPasso,
    dataSelecionada,
    setDataSelecionada,
    horaSelecionada,
    setHoraSelecionada,
    diasDisponiveis,
    motivoTexto,
    setMotivoTexto,
    sintomasEscolhidos,
    toggleSintoma,
    arquivosAnexados,
    handleFileUpload,
    removerArquivo,
    metodoPagamento,
    setMetodoPagamento,
    pixCopiado,
    copiarChavePix,
    cartaoNumero,
    setCartaoNumero,
    cartaoNome,
    setCartaoNome,
    cartaoValidade,
    setCartaoValidade,
    cartaoCVV,
    setCartaoCVV,
    cartaoParcelas,
    setCartaoParcelas,
    processandoPagamento,
    finalizarAgendamento,
    medicoAtual,
    onDone,
  } = p;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Selecione seus sintomas ou descreva o motivo da sua consulta médica:
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-5">
        <div>
          <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
            Sintomas rápidos (opcional):
          </label>
          <div className="flex flex-wrap gap-2">
            {SINTOMAS_RAPIDOS.map((sintoma) => {
              const active = sintomasEscolhidos.includes(sintoma);
              return (
                <button
                  key={sintoma}
                  type="button"
                  onClick={() => toggleSintoma(sintoma)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {active && <Check className="w-3 h-3 inline mr-1" />}
                  {sintoma}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
            Descreva com suas palavras o que você está sentindo:
          </label>
          <textarea
              aria-label="Descreva com suas palavras o que você está sentindo"
            value={motivoTexto}
            onChange={(e) => setMotivoTexto(e.target.value)}
            placeholder="Exemplo: Estou com dor de cabeça forte há 3 dias acompanhada de cansaço e gostaria de renovar minha receita..."
            rows={4}
            className="w-full px-4 py-3 rounded-2xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <button type="button"
          onClick={proximoPasso}
          className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          Continuar para Anexos <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>

  );
}
