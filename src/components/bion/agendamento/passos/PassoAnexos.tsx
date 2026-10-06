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

export function PassoAnexos(p: AgendamentoCorpoProps) {
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
        Anexe fotos de exames anteriores ou receitas para o médico analisar antes ou durante a
        consulta:
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-4">
        <label className="border-2 border-dashed border-border hover:border-primary rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-muted/40 hover:bg-primary-soft/30">
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <div className="font-bold text-sm text-foreground">
            Clique para enviar arquivos ou fotos
          </div>
          <div className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG de até 25MB</div>
        </label>

        {arquivosAnexados.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-foreground uppercase tracking-wider">
              Arquivos Anexados ({arquivosAnexados.length}):
            </div>
            {arquivosAnexados.map((arq, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-2xl bg-muted/70 border text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="truncate font-medium">{arq.nome}</div>
                  <span className="text-muted-foreground shrink-0">{arq.tamanhoKb} KB</span>
                </div>
                <button type="button"
                  onClick={() => removerArquivo(idx)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-card transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button type="button"
          onClick={proximoPasso}
          className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          Avançar para Pagamento <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>

  );
}
