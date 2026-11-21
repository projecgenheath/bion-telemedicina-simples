"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";
import { PagamentoNoApp } from "@/components/bion/paciente/PagamentoNoApp";

export function PassoPagamento(p: AgendamentoCorpoProps) {
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
    processandoPagamento,
    finalizarAgendamento,
    pagamentoConsultaId,
    medicoAtual,
    onDone,
  } = p;

  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-6">
        {/* Resumo do Pedido */}
        <div className="p-4 rounded-2xl bg-primary-soft border border-primary/20 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Médico(a)</span>
            <span className="font-bold">{medicoAtual.nome}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Especialidade</span>
            <span>{medicoAtual.especialidade}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Agendamento</span>
            <span>
              {dataSelecionada}, às {horaSelecionada}
            </span>
          </div>
          <div className="pt-2 border-t flex justify-between items-center">
            <span className="font-bold text-base">Valor Total</span>
            <span className="text-2xl font-extrabold text-primary">
              {medicoAtual.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
        </div>

        {/* Forma de pagamento: só cartão, nesta tela (sem Pix e sem outra página). */}
        <div className="p-4 rounded-2xl bg-muted/60 flex items-start gap-3">
          <CreditCard className="w-6 h-6 text-primary shrink-0" aria-hidden />
          <div className="space-y-1">
            <div className="font-bold text-sm">Cartão de crédito</div>
            <p className="text-xs text-muted-foreground">
              O pagamento abre aqui, nesta tela. A BION não vê nem guarda os dados do seu cartão.
              A consulta só fica confirmada quando o pagamento é aceito — pode levar alguns instantes.
            </p>
          </div>
        </div>

        {pagamentoConsultaId ? (
          <PagamentoNoApp alvo={{ consultaId: pagamentoConsultaId }} consultaIdVolta={pagamentoConsultaId} />
        ) : (
        <button type="button"
          disabled={processandoPagamento}
          onClick={finalizarAgendamento}
          className="w-full py-4 rounded-2xl text-primary-foreground font-bold text-base shadow-lg hover:opacity-90 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {processandoPagamento ? (
            <span>Confirmando pagamento...</span>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" /> Confirmar e Pagar com Cartão
            </>
          )}
        </button>
        )}
      </div>
    </div>

  );
}
