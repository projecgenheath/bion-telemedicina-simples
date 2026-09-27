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
import {
  ESPECIALIDADES,
  SINTOMAS_RAPIDOS,
} from "@/components/bion/agendamento/constantes";

export function PassoEspecialidade(p: AgendamentoCorpoProps) {
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
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Selecione a área médica para atendimento imediato ou agendado:
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ESPECIALIDADES.map((esp) => {
          const Icon = esp.icone;
          const isSelected = especialidade === esp.nome;
          const count = medicos.filter(
            (m) => m.especialidade === esp.nome && m.status === "ativo",
          ).length;
          return (
            <button
              key={esp.id}
              onClick={() => {
                setEspecialidade(esp.nome);
                proximoPasso();
              }}
              className={`p-5 rounded-3xl border text-left transition relative flex flex-col justify-between ${
                isSelected
                  ? "bg-primary-soft border-primary ring-2 ring-primary/20"
                  : "bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-base text-foreground">{esp.nome}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{esp.desc}</p>
              </div>
              <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs font-semibold text-primary">
                <span>{count === 1 ? "1 médico disponível" : `${count} médicos disponíveis`}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          );
        })}
      </div>
    </div>

  );
}
