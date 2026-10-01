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
  ShieldCheck,
} from "lucide-react";
import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";

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
              R$ {medicoAtual.valor},00
            </span>
          </div>
        </div>

        {/* Formas de Pagamento */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-muted rounded-2xl">
          {[
            { id: "pix", label: "Pix", icone: QrCode },
            { id: "cartao", label: "Cartão", icone: CreditCard },
            { id: "boleto", label: "Boleto", icone: FileText },
          ].map((tab) => (
            <button type="button"
              key={tab.id}
              onClick={() => setMetodoPagamento(tab.id as "pix" | "cartao" | "boleto")}
              className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                metodoPagamento === tab.id
                  ? "bg-card shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icone className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Conteúdo do Pix */}
        {metodoPagamento === "pix" && (
          <div className="text-center space-y-4 py-2">
            <div className="w-44 h-44 mx-auto rounded-2xl bg-white p-3 border-2 border-emerald-500/30 flex items-center justify-center shadow-inner">
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=00020126580014br.gov.bcb.pix0136bion-telemedicina-pay"
                alt="QR Code Pix"
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-200 flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-600 animate-ping" />
                Aprovação Imediata em Segundos
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Abra o app do seu banco, escolha <strong>Pix Copia e Cola</strong> ou aponte a
                câmera para o QR Code.
              </p>
            </div>

            <div className="flex items-center gap-2 max-w-md mx-auto">
              <input
              aria-label="Chave Pix para copiar"
                readOnly
                value="00020126580014br.gov.bcb.pix0136bion-telemedicina-pay-987655204000053039865802BR5925BION..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border bg-muted font-mono"
              />
              <button type="button"
                onClick={copiarChavePix}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1 hover:opacity-90 transition shrink-0"
              >
                {pixCopiado ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {pixCopiado ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo do Cartão */}
        {metodoPagamento === "cartao" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="ag-cartao-numero" className="text-xs font-bold text-muted-foreground block mb-1">
                Número do cartão
              </label>
              <input
                id="ag-cartao-numero"
                name="cc-number"
                autoComplete="cc-number"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cartaoNumero}
                onChange={(e) => setCartaoNumero(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label htmlFor="ag-cartao-nome" className="text-xs font-bold text-muted-foreground block mb-1">
                Nome impresso no cartão
              </label>
              <input
                id="ag-cartao-nome"
                name="cc-name"
                autoComplete="cc-name"
                placeholder="Como está no cartão"
                value={cartaoNome}
                onChange={(e) => setCartaoNome(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ag-cartao-validade" className="text-xs font-bold text-muted-foreground block mb-1">
                  Validade
                </label>
                <input
                  id="ag-cartao-validade"
                  name="cc-exp"
                  autoComplete="cc-exp"
                  placeholder="MM/AA"
                  value={cartaoValidade}
                  onChange={(e) => setCartaoValidade(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="ag-cartao-cvv" className="text-xs font-bold text-muted-foreground block mb-1">
                  CVV
                </label>
                <input
                  id="ag-cartao-cvv"
                  name="cc-csc"
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  placeholder="3 dígitos"
                  value={cartaoCVV}
                  onChange={(e) => setCartaoCVV(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div>
              <label htmlFor="ag-cartao-parcelas" className="text-xs font-bold text-muted-foreground block mb-1">
                Parcelas
              </label>
              <select
                id="ag-cartao-parcelas"
                value={cartaoParcelas}
                onChange={(e) => setCartaoParcelas(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="1">1x de R$ {medicoAtual.valor},00 (à vista)</option>
                <option value="2">2x de R$ {(medicoAtual.valor / 2).toFixed(2)} sem juros</option>
                <option value="3">3x de R$ {(medicoAtual.valor / 3).toFixed(2)} sem juros</option>
              </select>
            </div>
          </div>
        )}

        {/* Conteúdo do Boleto */}
        {metodoPagamento === "boleto" && (
          <div className="p-4 rounded-2xl bg-muted/60 text-center space-y-2">
            <FileText className="w-8 h-8 text-primary mx-auto" />
            <div className="font-bold text-sm">Boleto Bancário Digital</div>
            <p className="text-xs text-muted-foreground">
              O boleto é compensado em até 1 dia útil. O link de acesso à sala de espera será
              liberado após a compensação.
            </p>
          </div>
        )}

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
              <ShieldCheck className="w-5 h-5" /> Confirmar e Agendar Consulta
            </>
          )}
        </button>
      </div>
    </div>

  );
}
