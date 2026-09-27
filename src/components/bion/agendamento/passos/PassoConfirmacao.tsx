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

export function PassoConfirmacao(p: AgendamentoCorpoProps) {
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
    <div className="bg-card border rounded-3xl p-8 text-center space-y-6 shadow-sm">
      <div
        className="w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg"
        style={{ backgroundColor: "var(--accent-soft)" }}
      >
        <Check className="w-10 h-10" style={{ color: "var(--accent)" }} />
      </div>

      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Pagamento Aprovado com Sucesso
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight mt-1 text-foreground">
          Consulta Agendada!
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Sua teleconsulta com <strong>{medicoAtual.nome}</strong> está confirmada para{" "}
          <strong>
            {dataSelecionada} às {horaSelecionada}
          </strong>
          .
        </p>
      </div>

      <div className="max-w-md mx-auto p-5 rounded-2xl bg-muted/70 text-left space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Especialidade:</span>
          <span className="font-semibold">{medicoAtual.especialidade}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Código de Confirmação:</span>
          <span className="font-mono font-bold text-primary">
            BION-{Math.random().toString(36).substring(2, 8).toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Exames anexados:</span>
          <span>{arquivosAnexados.length} arquivo(s)</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button type="button"
          onClick={onGoToWaitingRoom}
          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Ir para Sala de Espera <ChevronRight className="w-4 h-4" />
        </button>
        <button type="button"
          onClick={onDone}
          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl border font-bold text-sm hover:bg-muted transition"
        >
          Voltar ao Início
        </button>
      </div>
    </div>

  );
}
