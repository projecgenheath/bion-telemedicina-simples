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

export function PassoMedico(p: AgendamentoCorpoProps) {
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
      <div className="flex items-center justify-between flex-wrap gap-2 text-sm text-muted-foreground">
        <span>
          Médicos especialistas em <strong className="text-foreground">{especialidade}</strong>:
        </span>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent-soft text-emerald-700 dark:text-emerald-300">
          {medicosFiltrados.length} profissionais online
        </span>
      </div>

      <div className="space-y-3">
        {medicosFiltrados.map((med) => (
          <div
            key={med.id}
            className="bg-card border rounded-3xl p-5 hover:border-primary transition shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl shrink-0 shadow-sm">
                {med.nome
                  .split(" ")
                  .slice(-2)
                  .map((w) => w[0])
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base truncate">{med.nome}</h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-emerald-700 dark:text-emerald-300">
                    {med.crm}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5 text-amber-500 dark:text-amber-400 font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-500" /> {med.avaliacao}
                  </span>
                  <span>•</span>
                  <span>{med.numAvaliacoes} atendimentos</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {med.subespecialidades.slice(0, 3).map((sub) => (
                    <span
                      key={sub}
                      className="text-xs px-2 py-0.5 rounded-lg bg-muted text-muted-foreground"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 pt-3 sm:pt-0 border-t sm:border-t-0">
              <div className="text-left sm:text-right">
                <div className="text-xs text-muted-foreground">Consulta particular</div>
                <div className="text-xl font-extrabold text-primary">R$ {med.valor}</div>
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setMedicoModal(med)}
                  className="px-3 py-2 rounded-xl border text-xs font-semibold hover:bg-muted transition"
                >
                  Ver Perfil
                </button>
                <button type="button"
                  onClick={() => {
                    setMedicoSelecionado(med);
                    proximoPasso();
                  }}
                  className="px-4 py-2 rounded-xl text-primary-foreground text-xs font-bold transition shadow-sm hover:opacity-90 flex items-center gap-1"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  Selecionar <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

  );
}
