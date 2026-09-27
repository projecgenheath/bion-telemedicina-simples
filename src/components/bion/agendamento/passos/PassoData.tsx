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

export function PassoData(p: AgendamentoCorpoProps) {
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
        Escolha o melhor dia para ser atendido por <strong>{medicoAtual.nome}</strong>:
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {diasDisponiveis.map((d, i) => {
          const isSelected = dataSelecionada === d.rotulo;
          return (
            <button
              key={i}
              onClick={() => {
                setDataSelecionada(d.rotulo);
                proximoPasso();
              }}
              className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                  : "bg-card hover:border-primary hover:bg-primary-soft"
              }`}
            >
              <span
                className={`text-xs ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {d.sem}
              </span>
              <span className="text-2xl font-extrabold">{d.diaNum}</span>
              <span
                className={`text-xs font-semibold ${isSelected ? "text-primary-foreground" : "text-primary"}`}
              >
                {d.rotulo === "Hoje" ? "Hoje" : d.mes}
              </span>
            </button>
          );
        })}
      </div>
    </div>

  );
}
