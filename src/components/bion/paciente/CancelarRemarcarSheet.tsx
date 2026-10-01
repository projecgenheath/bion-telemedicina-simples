"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import type { Consulta, Medico } from "@/lib/bion-tipos";
import { agendaLivreDoMedico } from "./agenda-medico";
import { fmtCentavos, usePreviaCancelamento, type PreviaAcao, type PreviaCancelamento } from "./usePreviaCancelamento";

/**
 * Folha (bottom sheet) de cancelar / remarcar / reembolso integral.
 *
 * Antes de confirmar, mostra a PRÉVIA do servidor (multa, reembolso e
 * "sem multa até …" em Brasília) e respeita podeCancelar/podeRemarcar.
 * Só fecha e mostra sucesso quando o store confirma que o servidor aceitou.
 *
 * Remarcar com multa (≤24 h): decisão do Alisson — o paciente paga a multa
 * (50%) pelo app e a nova data só é confirmada após o pagamento aprovado; sem
 * pagamento, a consulta fica na data original. Por isso, com multa, esta tela
 * NUNCA chama `remarcarConsulta` (o servidor atual remarcaria sem cobrar): usa
 * `onPagarMulta`; sem ele, o botão fica desabilitado ("em breve").
 *
 * "reembolso": consulta em aguardando_reagendamento (médico cancelou o dia).
 * O servidor trata o cancelamento do paciente nesse status como isento de
 * multa e com reembolso integral automático (ação "cancelar").
 */
export type AcaoSheet = "cancelar" | "remarcar" | "reembolso";

type Props = {
  consulta: Consulta;
  acao: AcaoSheet;
  medico: Medico | undefined;
  consultas: Consulta[];
  onFechar: () => void;
  /**
   * Ponto ÚNICO de integração do pagamento da multa de remarcação (≤24 h).
   * TODO(PR de pagamentos do Admin): ligar aqui o endpoint/gateway da multa —
   * cobrar `multaCentavos`, e o servidor só remarca para `data`/`hora` depois
   * que o pagamento for aprovado. Devolve true quando a cobrança foi criada.
   * Enquanto não for passado, a remarcação com multa fica desabilitada.
   */
  onPagarMulta?: (pedido: PedidoPagamentoMulta) => Promise<boolean>;
};

export type PedidoPagamentoMulta = {
  consultaId: string;
  /** Nova data/hora escolhida (dia YYYY-MM-DD e HH:MM no fuso de Brasília). */
  data: string;
  hora: string;
  multaCentavos: number;
};

export function CancelarRemarcarSheet({ consulta, acao, medico, consultas, onFechar, onPagarMulta }: Props) {
  const { cancelarConsulta, remarcarConsulta } = useBion();
  const { previa, carregando, erro, recarregar } = usePreviaCancelamento(consulta.id, consulta.status);
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");
  const [enviando, setEnviando] = useState(false);

  const aguardando = consulta.status === "aguardando_reagendamento";

  const agendaLivre = useMemo(
    () => (acao === "remarcar" ? agendaLivreDoMedico(medico, consultas, consulta.id) : []),
    [acao, medico, consultas, consulta.id],
  );

  // Seleção efetiva derivada da agenda livre (sem efeito): cai no 1º dia/horário livre.
  const diaSelecionado = agendaLivre.find((d) => d.iso === novaData) ?? agendaLivre[0];
  const dataEscolhida = diaSelecionado?.iso ?? "";
  const horaEscolhida = diaSelecionado
    ? diaSelecionado.horarios.includes(novaHora)
      ? novaHora
      : (diaSelecionado.horarios[0] ?? "")
    : "";

  const permitido = previa ? (acao === "remarcar" ? previa.podeRemarcar : previa.podeCancelar) : false;
  const prontoParaConfirmar = !!previa && permitido && !carregando && !enviando;
  /** Multa de remarcação: exige pagamento pelo app antes de confirmar a nova data. */
  const multaRemarcar = acao === "remarcar" && previa ? previa.remarcar.multaCentavos : 0;
  const exigePagamento = multaRemarcar > 0;
  const pagamentoIndisponivel = exigePagamento && !onPagarMulta;

  const confirmarCancelamento = async () => {
    if (!prontoParaConfirmar) return;
    setEnviando(true);
    const padrao =
      acao === "reembolso"
        ? "Paciente optou pelo reembolso integral após o cancelamento do médico"
        : "Cancelado pelo paciente";
    const aceito = await cancelarConsulta(consulta.id, motivo.trim() || padrao);
    setEnviando(false);
    if (!aceito) return; // o erro do servidor já virou toast no store
    toast.success(acao === "reembolso" ? "Reembolso integral solicitado" : "Consulta cancelada");
    onFechar();
  };

  const confirmarRemarcacao = async () => {
    if (!prontoParaConfirmar) return;
    if (!dataEscolhida || !horaEscolhida) {
      toast.error("Escolha um horário da agenda do médico");
      return;
    }
    if (exigePagamento) {
      // Nunca remarca direto com multa: a data só muda após o pagamento aprovado.
      if (!onPagarMulta) return;
      setEnviando(true);
      const criado = await onPagarMulta({
        consultaId: consulta.id,
        data: dataEscolhida,
        hora: horaEscolhida,
        multaCentavos: multaRemarcar,
      });
      setEnviando(false);
      if (!criado) return;
      toast.success("Pagamento iniciado — a nova data será confirmada após a aprovação");
      onFechar();
      return;
    }
    setEnviando(true);
    const aceito = await remarcarConsulta(consulta.id, dataEscolhida, horaEscolhida);
    setEnviando(false);
    if (!aceito) return;
    toast.success("Consulta remarcada");
    onFechar();
  };

  const fechar = () => {
    if (!enviando) onFechar();
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-sheet-consulta">
      <button type="button" className="absolute inset-0 bg-black/80" aria-label="Fechar" onClick={fechar} />
      <div className="relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bg-zinc-950 text-white border-t border-white/10 px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />

        {acao === "remarcar" ? (
          <>
            <h2 id="titulo-sheet-consulta" className="text-lg font-bold">
              {aguardando ? "Escolha um novo horário" : "Remarcar consulta"}
            </h2>
            <p className="text-sm text-white/60 mt-1">
              {consulta.especialidade} · horários livres na agenda de {consulta.medico || "seu médico"}.
            </p>
          </>
        ) : acao === "reembolso" ? (
          <>
            <h2 id="titulo-sheet-consulta" className="text-lg font-bold">Reembolso integral</h2>
            <p className="text-sm text-white/60 mt-1">
              {consulta.especialidade} com {consulta.medico}. O médico cancelou este horário — a consulta será encerrada e o valor pago volta para você, sem multa.
            </p>
          </>
        ) : (
          <>
            <h2 id="titulo-sheet-consulta" className="text-lg font-bold">Cancelar consulta?</h2>
            <p className="text-sm text-white/60 mt-1">
              {consulta.especialidade} · {consulta.data} às {consulta.hora}. O médico será avisado.
            </p>
          </>
        )}

        <BlocoPrevia acao={acao} previa={previa} carregando={carregando} erro={erro} onTentarDeNovo={recarregar} />

        {acao === "remarcar" ? (
          permitido ? (
            agendaLivre.length === 0 ? (
              <p className="mt-4 text-sm text-amber-200">Não há vaga na agenda deste médico nos próximos 14 dias.</p>
            ) : (
              <>
                <label className="block text-xs font-bold mt-4 mb-2 text-white/80">Data</label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {agendaLivre.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => {
                        setNovaData(d.iso);
                        setNovaHora(d.horarios.includes(horaEscolhida) ? horaEscolhida : d.horarios[0]);
                      }}
                      className={`shrink-0 rounded-2xl px-3 py-2 text-left border ${
                        dataEscolhida === d.iso ? "border-sky-400 bg-sky-400/15" : "border-white/10 bg-zinc-900"
                      }`}
                    >
                      <span className="block text-sm font-bold">{d.rotulo}</span>
                      <span className="block text-[11px] text-white/50">{d.sub}</span>
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-bold mt-4 mb-2 text-white/80">Horário</label>
                <div className="grid grid-cols-3 gap-2">
                  {(diaSelecionado?.horarios ?? []).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setNovaHora(h)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border ${
                        horaEscolhida === h ? "border-sky-400 bg-sky-400 text-zinc-950" : "border-white/10 bg-zinc-900"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </>
            )
          ) : null
        ) : permitido && acao === "cancelar" ? (
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-4 w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-sm text-white placeholder:text-white/40"
            rows={3}
            placeholder="Motivo (opcional)"
            aria-label="Motivo do cancelamento (opcional)"
          />
        ) : null}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={fechar}
            disabled={enviando}
            className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-semibold disabled:opacity-40"
          >
            Voltar
          </button>
          {acao === "remarcar" ? (
            <button
              type="button"
              disabled={
                !prontoParaConfirmar || pagamentoIndisponivel || !dataEscolhida || !horaEscolhida || agendaLivre.length === 0
              }
              onClick={() => void confirmarRemarcacao()}
              className="flex-1 py-3 rounded-xl bg-sky-500 text-zinc-950 text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {pagamentoIndisponivel
                ? "Pagamento da multa pelo app em breve"
                : exigePagamento
                  ? `Pagar multa de ${fmtCentavos(multaRemarcar)}`
                  : "Confirmar novo horário"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!prontoParaConfirmar}
              onClick={() => void confirmarCancelamento()}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 ${
                acao === "reembolso" ? "bg-emerald-500 text-zinc-950 font-bold" : "bg-red-600 text-white"
              }`}
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {acao === "reembolso"
                ? "Confirmar reembolso integral"
                : previa && previa.cancelar.multaCentavos > 0
                  ? "Cancelar com multa"
                  : "Confirmar cancelamento"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BlocoPrevia({
  acao,
  previa,
  carregando,
  erro,
  onTentarDeNovo,
}: {
  acao: AcaoSheet;
  previa: PreviaCancelamento | null;
  carregando: boolean;
  erro: string | null;
  onTentarDeNovo: () => void;
}) {
  if (carregando && !previa) {
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-white/70 inline-flex w-full items-center gap-2" role="status">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculando multa e reembolso…
      </div>
    );
  }
  if (erro || !previa) {
    return (
      <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm" role="alert">
        <p className="text-red-100">{erro ?? "Não foi possível carregar a prévia."}</p>
        <p className="text-xs text-white/55 mt-1">Para sua segurança, a confirmação só fica disponível depois de mostrarmos os valores.</p>
        <button type="button" onClick={onTentarDeNovo} className="mt-3 rounded-full px-3 py-1.5 text-xs font-bold bg-white/10">
          Tentar de novo
        </button>
      </div>
    );
  }

  const permitido = acao === "remarcar" ? previa.podeRemarcar : previa.podeCancelar;
  if (!permitido) {
    const encerrada = previa.status === "cancelada" || previa.status === "concluida";
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-white/75" role="note">
        {encerrada
          ? `Esta consulta já foi ${previa.status === "cancelada" ? "cancelada" : "concluída"} e não pode mais ser ${acao === "remarcar" ? "remarcada" : "cancelada"}.`
          : `Esta consulta não pode ser ${acao === "remarcar" ? "remarcada" : "cancelada"} por aqui. Fale com o suporte se precisar de ajuda.`}
      </div>
    );
  }

  const p: PreviaAcao = acao === "remarcar" ? previa.remarcar : previa.cancelar;
  const { multaPct, janelaHoras } = previa.regra;

  if (acao === "reembolso" || p.isencao === "aguardando_reagendamento") {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm">
        <p className="font-bold text-emerald-100">Sem multa — o médico cancelou este horário.</p>
        {acao !== "remarcar" && p.pago ? (
          <p className="text-white/75 mt-1">
            Reembolso integral: <strong className="text-white">{fmtCentavos(p.reembolsoCentavos)}</strong>. O reembolso é automático, sem necessidade de aprovação.
          </p>
        ) : acao === "remarcar" ? (
          <p className="text-white/75 mt-1">Escolha um novo horário; o valor já pago continua valendo para a consulta.</p>
        ) : null}
      </div>
    );
  }

  if (p.multaCentavos > 0 && acao === "remarcar") {
    return (
      <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm" role="alert">
        <p className="font-bold text-amber-100 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Para confirmar a nova data, é preciso pagar a multa de {fmtCentavos(p.multaCentavos)} ({multaPct}%) pelo app.
        </p>
        <p className="text-white/75 mt-1">A consulta continua na data original até o pagamento ser aprovado.</p>
        <p className="text-white/60 mt-2 text-xs">
          Remarcações com {janelaHoras} h ou menos de antecedência têm multa. O prazo sem multa terminou em {p.semMultaAteTexto}.
        </p>
      </div>
    );
  }

  if (p.multaCentavos > 0) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm" role="alert">
        <p className="font-bold text-amber-100 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Será aplicada uma multa de {fmtCentavos(p.multaCentavos)} ({multaPct}%).
        </p>
        <p className="text-white/70 mt-1">
          Cancelamentos feitos com {janelaHoras} h ou menos de antecedência têm multa. O prazo sem multa terminou em {p.semMultaAteTexto}.
        </p>
        {acao === "cancelar" && p.pago ? (
          <p className="text-white/80 mt-2">
            Valor a ser reembolsado: <strong className="text-white">{fmtCentavos(p.reembolsoCentavos)}</strong> de {fmtCentavos(p.valorCentavos)}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm">
      <p className="font-bold">Sem multa</p>
      {p.isencao === "fora_da_janela" ? (
        <p className="text-white/70 mt-1">
          {acao === "remarcar" ? "Remarque" : "Cancele"} sem multa até {p.semMultaAteTexto} (horário de Brasília). Depois disso, a multa é de {multaPct}% do valor.
        </p>
      ) : null}
      {acao === "cancelar" ? (
        p.pago ? (
          <p className="text-white/80 mt-2">
            Reembolso integral: <strong className="text-white">{fmtCentavos(p.reembolsoCentavos)}</strong>, automático.
          </p>
        ) : (
          <p className="text-white/60 mt-2 text-xs">Esta consulta ainda não foi paga — não há valor a devolver.</p>
        )
      ) : null}
    </div>
  );
}
