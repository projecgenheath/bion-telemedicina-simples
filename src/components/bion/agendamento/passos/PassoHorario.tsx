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
} from "lucide-react";
import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";

export function PassoHorario(p: AgendamentoCorpoProps) {
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
    onGoToWaitingRoom,
    onDone,
  } = p;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Horários disponíveis para <strong>{dataSelecionada}</strong>:
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-6">
        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Manhã
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {["08:30", "09:00", "09:30", "10:00", "10:30", "11:30"].map((h) => (
              <button
                key={h}
                onClick={() => {
                  setHoraSelecionada(h);
                  proximoPasso();
                }}
                className={`py-3 rounded-xl border text-sm font-bold transition ${
                  horaSelecionada === h
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "hover:border-primary hover:bg-primary-soft"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Tarde / Noite
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "18:00"].map(
              (h) => (
                <button
                  key={h}
                  onClick={() => {
                    setHoraSelecionada(h);
                    proximoPasso();
                  }}
                  className={`py-3 rounded-xl border text-sm font-bold transition ${
                    horaSelecionada === h
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "hover:border-primary hover:bg-primary-soft"
                  }`}
                >
                  {h}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </div>

  );
}
