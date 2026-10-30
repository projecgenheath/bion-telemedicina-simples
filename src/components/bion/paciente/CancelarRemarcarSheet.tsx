"use client";

import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { EstadoCarregando, EstadoErro } from "./EstadosPaciente";
import { useFocoDialogo } from "./useFocoDialogo";
import { useArrastarFechar } from "./useArrastarFechar";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { fmtHora, type Consulta, type Medico } from "@/lib/bion-tipos";
import { agendaLivreDoMedico } from "./agenda-medico";
import { useDiasBloqueados } from "./useDiasBloqueados";
import { fraseMotivoReagendamento } from "./motivo-reagendamento";
import { previaTemReembolso } from "./reembolso-visivel";
import {
  buscarPreviaCancelamento,
  fmtCentavos,
  previaCancelamentoMudou,
  textoIsencao,
  usePreviaCancelamento,
  type PreviaAcao,
  type PreviaCancelamento,
} from "./usePreviaCancelamento";
import {
  STATUS_TERMINAIS,
  desistirRemarcacao,
  useRecarregarEstado,
  useRemarcacaoComMulta,
  type CobrancaMulta,
  type MetodoMulta,
  type PedidoPagamentoMulta,
  type RemarcacaoWire,
  type RespostaPagarMulta,
} from "./useRemarcacaoComMulta";

/**
 * Folha (bottom sheet) de cancelar / remarcar / reembolso integral.
 *
 * Antes de confirmar, mostra a PRÉVIA do servidor (multa, reembolso e
 * "sem multa até …" em Brasília) e respeita podeCancelar/podeRemarcar.
 * Só fecha e mostra sucesso quando o store confirma que o servidor aceitou.
 *
 * Ao confirmar o CANCELAMENTO (irreversível), a prévia é refeita na hora e
 * comparada com a exibida: o servidor recalcula a multa no clique, então
 * uma folha aberta há muito tempo pode mostrar "reembolso integral" quando
 * a janela sem multa já virou. Se multa/reembolso mudaram, a folha adota
 * os valores novos, avisa e exige uma segunda confirmação; se a nova busca
 * falhar, não cancela no escuro. (A remarcação já se protege sozinha: o
 * PATCH devolve 402 quando a multa passa a valer e a prévia recarrega.)
 *
 * Remarcar com multa (≤24 h): decisão do Alisson — o paciente paga a multa
 * (50%) pelo app e a nova data só é confirmada após o pagamento aprovado; sem
 * pagamento, a consulta fica na data original. Por isso, com multa, esta tela
 * NUNCA chama `remarcarConsulta` (o PATCH responde 402): usa `onPagarMulta`
 * (POST /api/consultas/[id]/remarcacao), mostra a cobrança e acompanha o
 * status (polling ~3 s) até aprovada/expirada/falhou/cancelada. Sem
 * `onPagarMulta`, o botão fica desabilitado.
 *
 * "reembolso": consulta em aguardando_reagendamento (médico cancelou, falha técnica ou falta do médico).
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
   * Ponto ÚNICO de integração do pagamento da multa de remarcação (≤24 h):
   * reserva `data`/`hora` e cria a cobrança (ver iniciarRemarcacaoComMulta).
   * O servidor só remarca depois que o pagamento é aprovado.
   * Sem esta prop, a remarcação com multa fica desabilitada.
   */
  onPagarMulta?: (pedido: PedidoPagamentoMulta) => Promise<RespostaPagarMulta>;
};

export function CancelarRemarcarSheet({ consulta, acao, medico, consultas, onFechar, onPagarMulta }: Props) {
  const { cancelarConsulta, remarcarConsulta } = useBion();
  const { previa, carregando, erro, recarregar, adotarPrevia } = usePreviaCancelamento(consulta.id, consulta.status);
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");
  const [enviando, setEnviando] = useState(false);
  // Reconfirmação do cancelamento: a prévia refeita ao confirmar divergiu
  // da exibida (a folha mostra os valores novos e pede nova confirmação),
  // ou a nova busca falhou e o cancelamento não foi tentado.
  const [condicoesMudaram, setCondicoesMudaram] = useState(false);
  const [erroRevalidacao, setErroRevalidacao] = useState<string | null>(null);
  // Só cartão: a multa é paga no checkout Stripe (BotaoPagarStripe).
  const [metodo, setMetodo] = useState<MetodoMulta | null>("cartao");
  const recarregarEstado = useRecarregarEstado();
  const { remarcacao, cobranca, adotar, limpar } = useRemarcacaoComMulta(
    consulta.id,
    acao === "remarcar" && !!consulta.remarcacaoPendente,
  );

  // Desfecho da remarcação com multa: aprovada → atualiza o app e fecha;
  // demais status terminais → atualiza o app (a reserva some) e a folha explica.
  const desfechoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!remarcacao || !STATUS_TERMINAIS.includes(remarcacao.status)) return;
    const chave = `${remarcacao.id}:${remarcacao.status}`;
    if (desfechoRef.current === chave) return;
    desfechoRef.current = chave;
    if (remarcacao.status === "aprovada") {
      toast.success(`Multa paga — consulta remarcada para ${remarcacao.novaDataTexto}`);
      void recarregarEstado().then(() => onFechar());
    } else {
      void recarregarEstado();
    }
  }, [remarcacao, recarregarEstado, onFechar]);

  const aguardando = consulta.status === "aguardando_reagendamento";

  // Dias inteiros bloqueados pelo médico saem da agenda (inclusive no
  // "remarcar sem custo" de aguardando_reagendamento). O servidor recusa
  // esses dias com 409 "O médico não atende neste dia." de qualquer forma.
  const { bloqueados, recarregar: recarregarBloqueios } = useDiasBloqueados(
    acao === "remarcar" ? medico?.id : null,
  );
  const agendaLivre = useMemo(
    () =>
      acao === "remarcar"
        ? agendaLivreDoMedico(medico, consultas, consulta.id, undefined, bloqueados)
        : [],
    [acao, medico, consultas, consulta.id, bloqueados],
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
    if (!prontoParaConfirmar || !previa) return;
    setEnviando(true);
    setCondicoesMudaram(false);
    setErroRevalidacao(null);
    // 1) Refaz a prévia AGORA: o servidor recalcula a multa neste clique,
    // então só vale cancelar sobre os valores que ele aplicaria neste
    // instante — não sobre os da abertura da folha.
    let fresca: PreviaCancelamento;
    try {
      fresca = await buscarPreviaCancelamento(consulta.id);
    } catch (e) {
      // Sem prévia fresca, não cancela no escuro: erro visível e nova
      // tentativa pelo mesmo botão de confirmar.
      setEnviando(false);
      setErroRevalidacao(
        e instanceof Error ? e.message : "Não foi possível confirmar as condições do cancelamento.",
      );
      return;
    }
    // 2) Mudou de forma relevante (multa, reembolso, permissão…): NÃO
    // cancela. A folha passa a mostrar os valores novos e o paciente
    // confirma de novo, já vendo as condições reais.
    if (previaCancelamentoMudou(previa, fresca)) {
      adotarPrevia(fresca);
      setEnviando(false);
      setCondicoesMudaram(true);
      return;
    }
    // 3) Não mudou: cancela como antes.
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
      if (!onPagarMulta || !metodo) return;
      setEnviando(true);
      const r = await onPagarMulta({ consultaId: consulta.id, data: dataEscolhida, hora: horaEscolhida, metodo });
      setEnviando(false);
      if (r.tipo === "criada") {
        adotar(r.remarcacao, r.cobranca);
        if (r.remarcacao.status === "pendente") void recarregarEstado(); // card da reserva na home
      } else if (r.tipo === "ja_pendente") {
        toast.message("Você já tem uma remarcação aguardando pagamento.");
        adotar(r.remarcacao, null);
      } else if (r.tipo === "sem_multa") {
        // O servidor recalculou: não há multa — segue a remarcação normal.
        await remarcarNormal();
      } else {
        toast.error(r.erro);
        recarregar();
        recarregarBloqueios();
      }
      return;
    }
    await remarcarNormal();
  };

  const remarcarNormal = async () => {
    setEnviando(true);
    const aceito = await remarcarConsulta(consulta.id, dataEscolhida, horaEscolhida);
    setEnviando(false);
    if (!aceito) {
      // Ex.: 402 (a multa passou a valer): a prévia atualizada mostra o pagamento.
      // 409 "O médico não atende neste dia.": o store já mostrou a mensagem e
      // o dia some da agenda com os bloqueios atualizados.
      recarregar();
      recarregarBloqueios();
      return;
    }
    toast.success("Consulta remarcada");
    onFechar();
  };

  const desistir = async () => {
    setEnviando(true);
    const r = await desistirRemarcacao(consulta.id);
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível desistir da remarcação.");
      return;
    }
    if (remarcacao) adotar({ ...remarcacao, status: "cancelada" }, cobranca);
  };

  const tentarOutroHorario = () => {
    limpar();
    setMetodo("cartao");
    recarregar();
    recarregarBloqueios();
  };

  const fechar = () => {
    if (!enviando) onFechar();
  };
  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, fechar);
  useFocoDialogo(true, fechar, dialogoRef);
  const painelRef = useRef<HTMLDivElement>(null);
  useArrastarFechar(painelRef, fechar);

  return (
    <div ref={dialogoRef} className="bpp-sheet-raiz absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-sheet-consulta">
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Fechar" onClick={fechar} />
      <div
        ref={painelRef} className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div data-arrastar className="-mx-5 -mt-3 mb-1 pt-3 pb-3 touch-none"><div className="mx-auto h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden /></div>

        {acao === "remarcar" ? (
          <>
            <h2 data-arrastar id="titulo-sheet-consulta" className="text-lg font-bold">
              {aguardando ? "Escolha um novo horário" : "Remarcar consulta"}
            </h2>
            <p className="text-sm bpp-sheet-suave mt-1">
              {consulta.especialidade} · horários livres na agenda de {consulta.medico || "seu médico"}.
            </p>
          </>
        ) : acao === "reembolso" ? (
          <>
            <h2 id="titulo-sheet-consulta" className="text-lg font-bold">Reembolso integral</h2>
            <p className="text-sm bpp-sheet-suave mt-1">
              {consulta.especialidade} com {consulta.medico}. {fraseMotivoReagendamento(consulta.motivoReagendamento)}. A consulta será encerrada e o valor pago volta para você, sem multa.
            </p>
          </>
        ) : (
          <>
            <h2 id="titulo-sheet-consulta" className="text-lg font-bold">Cancelar consulta?</h2>
            <p className="text-sm bpp-sheet-suave mt-1">
              {consulta.especialidade} · {consulta.data} às {consulta.hora}. O médico será avisado.
            </p>
          </>
        )}

        {acao === "remarcar" && remarcacao ? (
          <PainelPagamentoMulta
            consulta={consulta}
            remarcacao={remarcacao}
            cobranca={cobranca}
            enviando={enviando}
            onDesistir={() => void desistir()}
            onOutroHorario={tentarOutroHorario}
            onFechar={fechar}
          />
        ) : (
        <>
        <BlocoPrevia
          acao={acao}
          previa={previa}
          carregando={carregando}
          erro={erro}
          onTentarDeNovo={recarregar}
          motivoReagendamento={consulta.motivoReagendamento}
        />

        {acao === "remarcar" ? (
          permitido ? (
            agendaLivre.length === 0 ? (
              <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">Não há vaga na agenda deste médico nos próximos 14 dias.</p>
            ) : (
              <>
                <label className="block text-xs font-bold mt-4 mb-2 bpp-sheet-suave">Data</label>
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
                        dataEscolhida === d.iso ? "bpp-sheet-sel" : "bpp-sheet-borda bpp-sheet-cartao"
                      }`}
                    >
                      <span className="block text-sm font-bold">{d.rotulo}</span>
                      <span className="block text-xs bpp-sheet-suave">{d.sub}</span>
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-bold mt-4 mb-2 bpp-sheet-suave">Horário</label>
                <div className="grid grid-cols-3 gap-2">
                  {(diaSelecionado?.horarios ?? []).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setNovaHora(h)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border ${
                        horaEscolhida === h ? "bpp-sheet-sel-cheio" : "bpp-sheet-borda bpp-sheet-cartao"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                {exigePagamento && onPagarMulta ? (
                  <>
                    <div className="text-xs font-bold mt-4 mb-2 bpp-sheet-suave inline-flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Forma de pagamento da multa
                    </div>
                    <p className="text-sm bpp-sheet-suave">Cartão de crédito, no pagamento seguro do Stripe.</p>
                  </>
                ) : null}
              </>
            )
          ) : null
        ) : permitido && acao === "cancelar" ? (
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-4 w-full rounded-xl border bpp-sheet-borda p-3 text-sm bpp-sheet-campo"
            rows={3}
            placeholder="Motivo (opcional)"
            aria-label="Motivo do cancelamento (opcional)"
          />
        ) : null}

        {acao !== "remarcar" && condicoesMudaram ? (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm" role="alert">
            <p className="font-bold text-amber-900 dark:text-amber-100 inline-flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              As condições mudaram desde que você abriu esta tela.
            </p>
            <p className="bpp-sheet-suave mt-1">
              Os valores acima acabaram de ser atualizados. Confira a multa e o reembolso e confirme novamente para concluir o cancelamento.
            </p>
          </div>
        ) : null}
        {acao !== "remarcar" && erroRevalidacao ? (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm" role="alert">
            <p className="font-bold text-red-900 dark:text-red-100">Não foi possível confirmar as condições agora.</p>
            <p className="bpp-sheet-suave mt-1">
              {erroRevalidacao} Para sua segurança, o cancelamento não foi feito sem conferir os valores. Toque em confirmar para tentar de novo.
            </p>
          </div>
        ) : null}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={fechar}
            disabled={enviando}
            className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold disabled:opacity-40"
          >
            Voltar
          </button>
          {acao === "remarcar" ? (
            <button
              type="button"
              disabled={
                !prontoParaConfirmar ||
                pagamentoIndisponivel ||
                (exigePagamento && !metodo) ||
                !dataEscolhida ||
                !horaEscolhida ||
                agendaLivre.length === 0
              }
              onClick={() => void confirmarRemarcacao()}
              className="bpp-toque flex-1 py-3 rounded-xl bpp-sheet-primario text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
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
              className={`bpp-toque flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 ${
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
        </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const ROTULO_METODO: Record<string, string> = { cartao: "Cartão" };

/** Cobrança da multa + acompanhamento do status da reserva da nova data. */
function PainelPagamentoMulta({
  consulta,
  remarcacao: r,
  cobranca,
  enviando,
  onDesistir,
  onOutroHorario,
  onFechar,
}: {
  consulta: Consulta;
  remarcacao: RemarcacaoWire;
  cobranca: CobrancaMulta | null;
  enviando: boolean;
  onDesistir: () => void;
  onOutroHorario: () => void;
  onFechar: () => void;
}) {
  const dataOriginal = `${consulta.data} às ${consulta.hora}`;
  const metodo = ROTULO_METODO[cobranca?.metodo ?? r.metodo] ?? r.metodo;
  const valor = fmtCentavos(cobranca?.valorCentavos ?? r.multaCentavos);

  if (r.status === "pendente") {
    return (
      <>
        <div className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-sm" role="status" aria-live="polite">
          <p className="font-bold text-sky-900 dark:text-sky-100 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Aguardando o pagamento da multa
          </p>
          <ul className="mt-3 space-y-1.5 bpp-sheet-suave">
            <li>
              Nova data reservada: <strong className="bpp-sheet-forte">{r.novaDataTexto}</strong>
            </li>
            <li>
              Multa: <strong className="bpp-sheet-forte">{valor}</strong> · {metodo}
            </li>
            <li>Reserva válida até {fmtHora(r.expiraEm)} (horário de Brasília)</li>
          </ul>
          {cobranca?.via === "pendente" ? (
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-3">
              O pagamento online ainda não está disponível neste ambiente. Se a multa não for paga até {fmtHora(r.expiraEm)}, a reserva expira sozinha.
            </p>
          ) : (
            <p className="text-xs bpp-sheet-suave mt-3">
              Assim que o pagamento for aprovado, a nova data é confirmada automaticamente.
            </p>
          )}
          <BotaoPagarStripe remarcacaoId={r.id} rotulo="Pagar multa com cartão" className="mt-3 w-full" />
          <p className="text-xs bpp-sheet-suave mt-1">
            Até lá, sua consulta continua em <strong className="bpp-sheet-suave">{dataOriginal}</strong>.
          </p>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onDesistir}
            disabled={enviando}
            className="bpp-toque flex-1 py-3 rounded-xl border border-red-400/40 text-red-700 dark:text-red-200 text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Desistir da remarcação
          </button>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold disabled:opacity-40"
          >
            Fechar
          </button>
        </div>
        <p className="text-xs bpp-sheet-suave mt-2">Ao fechar, a reserva continua; você pode retomar pela tela inicial.</p>
      </>
    );
  }

  if (r.status === "aprovada") {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm" role="status">
        <p className="font-bold text-emerald-900 dark:text-emerald-100">Multa paga — consulta remarcada para {r.novaDataTexto}.</p>
      </div>
    );
  }

  const motivo =
    r.status === "expirada"
      ? "O prazo para pagar a multa terminou e a reserva da nova data expirou."
      : r.status === "falhou"
        ? "O pagamento da multa não foi aprovado."
        : r.status === "cancelada"
          ? "Você desistiu da remarcação e o horário reservado foi liberado."
          : "A remarcação não foi concluída.";
  return (
    <>
      <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm" role="alert">
        <p className="font-bold text-amber-900 dark:text-amber-100">{motivo}</p>
        <p className="bpp-sheet-suave mt-1">
          Sua consulta continua na data original: <strong className="bpp-sheet-forte">{dataOriginal}</strong>.
        </p>
        {r.status === "expirada" ? (
          <p className="text-xs bpp-sheet-suave mt-2">Se o pagamento for concluído depois do prazo, a multa é devolvida automaticamente.</p>
        ) : null}
      </div>
      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onFechar} className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold">
          Fechar
        </button>
        <button type="button" onClick={onOutroHorario} className="bpp-toque flex-1 py-3 rounded-xl bpp-sheet-primario text-sm font-bold">
          Escolher outro horário
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function BlocoPrevia({
  acao,
  previa,
  carregando,
  erro,
  onTentarDeNovo,
  motivoReagendamento,
}: {
  acao: AcaoSheet;
  previa: PreviaCancelamento | null;
  carregando: boolean;
  erro: string | null;
  onTentarDeNovo: () => void;
  motivoReagendamento?: Consulta["motivoReagendamento"];
}) {
  if (carregando && !previa) {
    return <EstadoCarregando texto="Calculando multa e reembolso…" superficie="janela" className="mt-4" />;
  }
  if (erro || !previa) {
    return (
      <EstadoErro
        texto={erro ?? "Não foi possível carregar a prévia."}
        detalhe="Para sua segurança, a confirmação só fica disponível depois de mostrarmos os valores."
        onTentarDeNovo={onTentarDeNovo}
        superficie="janela"
        className="mt-4"
      />
    );
  }

  const permitido = acao === "remarcar" ? previa.podeRemarcar : previa.podeCancelar;
  if (!permitido) {
    const encerrada = previa.status === "cancelada" || previa.status === "concluida";
    return (
      <div className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm bpp-sheet-suave" role="note">
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
        <p className="font-bold text-emerald-900 dark:text-emerald-100">Sem multa. {fraseMotivoReagendamento(motivoReagendamento)}.</p>
        {acao !== "remarcar" && previaTemReembolso(p) ? (
          <p className="bpp-sheet-suave mt-1">
            Reembolso integral: <strong className="bpp-sheet-forte">{fmtCentavos(p.reembolsoCentavos)}</strong>. O reembolso é automático, sem necessidade de aprovação.
          </p>
        ) : acao === "remarcar" ? (
          <p className="bpp-sheet-suave mt-1">Escolha um novo horário; o valor já pago continua valendo para a consulta.</p>
        ) : null}
      </div>
    );
  }

  if (p.multaCentavos > 0 && acao === "remarcar") {
    return (
      <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm" role="alert">
        <p className="font-bold text-amber-900 dark:text-amber-100 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Para confirmar a nova data, é preciso pagar a multa de {fmtCentavos(p.multaCentavos)} ({multaPct}%) pelo app.
        </p>
        <p className="bpp-sheet-suave mt-1">A consulta continua na data original até o pagamento ser aprovado.</p>
        <p className="bpp-sheet-suave mt-2 text-xs">
          Remarcações com {janelaHoras} h ou menos de antecedência têm multa. O prazo sem multa terminou em {p.semMultaAteTexto}.
        </p>
      </div>
    );
  }

  if (p.multaCentavos > 0) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm" role="alert">
        <p className="font-bold text-amber-900 dark:text-amber-100 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Será aplicada uma multa de {fmtCentavos(p.multaCentavos)} ({multaPct}%).
        </p>
        <p className="bpp-sheet-suave mt-1">
          Cancelamentos feitos com {janelaHoras} h ou menos de antecedência têm multa. O prazo sem multa terminou em {p.semMultaAteTexto}.
        </p>
        {acao === "cancelar" && previaTemReembolso(p) ? (
          <p className="bpp-sheet-suave mt-2">
            Valor a ser reembolsado: <strong className="bpp-sheet-forte">{fmtCentavos(p.reembolsoCentavos)}</strong> de {fmtCentavos(p.valorCentavos)}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm">
      <p className="font-bold">Sem multa</p>
      {/* B39: isenção com motivo próprio (ex.: falta do médico) mostra o motivo. */}
      {textoIsencao(p.isencao) ? (
        <p className="bpp-sheet-suave mt-1">{textoIsencao(p.isencao)}</p>
      ) : p.isencao === "fora_da_janela" ? (
        <p className="bpp-sheet-suave mt-1">
          {acao === "remarcar" ? "Remarque" : "Cancele"} sem multa até {p.semMultaAteTexto} (horário de Brasília). Depois disso, a multa é de {multaPct}% do valor.
        </p>
      ) : null}
      {acao === "cancelar" && p.valorCentavos > 0 ? (
        p.pago ? (
          <p className="bpp-sheet-suave mt-2">
            Reembolso integral: <strong className="bpp-sheet-forte">{fmtCentavos(p.reembolsoCentavos)}</strong>, automático.
          </p>
        ) : (
          <p className="bpp-sheet-suave mt-2 text-xs">Esta consulta ainda não foi paga — não há valor a devolver.</p>
        )
      ) : null}
    </div>
  );
}
