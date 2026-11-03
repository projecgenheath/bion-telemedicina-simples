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
  Clock,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
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
    processandoPagamento,
    finalizarAgendamento,
    medicoAtual,
    onDone,
  } = p;

  /**
   * A consulta criada é localizada no store (dados reais do servidor) pelo
   * médico + data + hora congelados do agendamento, preferindo a mais recente.
   * Nada aqui é inventado: sem consulta real no store, não há "aprovado" nem
   * código de confirmação — e o código nunca é aleatório.
   *
   * "Pagamento Aprovado" só aparece quando o servidor marcou a consulta como
   * paga (`pago === true` — gateway simulado no ato, retorno grátis ou webhook
   * do Stripe). Qualquer outro caso é "aguardando pagamento".
   */
  const { consultas } = useBion();
  const consultaCriada = [...consultas]
    .filter(
      (c) =>
        c.status !== "cancelada" &&
        (c.medicoId ? c.medicoId === medicoAtual.id : c.medico === medicoAtual.nome) &&
        c.data === dataSelecionada &&
        c.hora === horaSelecionada,
    )
    .sort((a, b) => b.ts - a.ts)[0];
  const pagamentoAprovado = consultaCriada?.pago === true;

  const rotuloSuperior = !consultaCriada
    ? "Consulta não localizada"
    : pagamentoAprovado
      ? "Pagamento Aprovado"
      : "Consulta reservada, aguardando pagamento";
  const titulo = !consultaCriada
    ? "Não foi possível confirmar esta reserva"
    : pagamentoAprovado
      ? "Consulta Agendada!"
      : "Reserva feita — falta o pagamento";

  return (
    <div className="bg-card border rounded-3xl p-8 text-center space-y-6 shadow-sm">
      <div
        className="w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg"
        style={{ backgroundColor: "var(--accent-soft)" }}
      >
        {pagamentoAprovado ? (
          <Check className="w-10 h-10" style={{ color: "var(--accent)" }} />
        ) : (
          <Clock className="w-10 h-10 text-amber-600" />
        )}
      </div>

      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
          {rotuloSuperior}
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight mt-1 text-foreground">{titulo}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          {!consultaCriada ? (
            <>
              Não encontramos os dados desta reserva no momento. Verifique em Minhas consultas —
              nenhum código de confirmação é exibido sem uma consulta real.
            </>
          ) : pagamentoAprovado ? (
            <>
              Sua teleconsulta com <strong>{medicoAtual.nome}</strong> está confirmada para{" "}
              <strong>
                {dataSelecionada} às {horaSelecionada}
              </strong>
              .
            </>
          ) : (
            <>
              Sua teleconsulta com <strong>{medicoAtual.nome}</strong> está reservada para{" "}
              <strong>
                {dataSelecionada} às {horaSelecionada}
              </strong>
              , mas o pagamento ainda não foi confirmado. Complete o pagamento em Minhas
              consultas para confirmar a consulta.
            </>
          )}
        </p>
      </div>

      <div className="max-w-md mx-auto p-5 rounded-2xl bg-muted/70 text-left space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Especialidade:</span>
          <span className="font-semibold">{medicoAtual.especialidade}</span>
        </div>
        {consultaCriada ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground shrink-0">ID da consulta:</span>
            <span className="font-mono font-bold text-primary break-all text-right">
              {consultaCriada.id}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Exames anexados:</span>
          <span>{arquivosAnexados.length} arquivo(s)</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        {/* Sem pré-sala: o botão Entrar na sala fica no card da próxima consulta, no Início. */}
        <button type="button"
          onClick={onDone}
          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {pagamentoAprovado ? "Voltar ao Início" : "Ver em Minhas consultas"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>

  );
}
