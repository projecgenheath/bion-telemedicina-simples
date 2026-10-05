"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { fmtHora, type Consulta, type Medico } from "@/lib/bion-tipos";
import { agendaLivreDoMedico } from "./agenda-medico";
import { useDiasBloqueados } from "./useDiasBloqueados";
import { fraseMotivoReagendamento } from "./motivo-reagendamento";
import { fmtCentavos, usePreviaCancelamento, type PreviaAcao, type PreviaCancelamento } from "./usePreviaCancelamento";
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
  const { previa, carregando, erro, recarregar } = usePreviaCancelamento(consulta.id, consulta.status);
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");
  const [enviando, setEnviando] = useState(false);
  const [metodo, setMetodo] = useState<MetodoMulta | null>(null);
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
    setMetodo(null);
    recarregar();
    recarregarBloqueios();
  };

  const fechar = () => {
    if (!enviando) onFechar();
  };
  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, fechar);
  useFocoDialogo(true, fechar, dialogoRef);

  return (
    <div ref={dialogoRef} className="absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-sheet-consulta">
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
              {consulta.especialidade} com {consulta.medico}. {fraseMotivoReagendamento(consulta.motivoReagendamento)}. A consulta será encerrada e o valor pago volta para você, sem multa.
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
                      <span className="block text-xs text-white/70">{d.sub}</span>
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
                {exigePagamento && onPagarMulta ? (
                  <>
                    <div className="text-xs font-bold mt-4 mb-2 text-white/80 inline-flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Forma de pagamento da multa
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: "pix", nome: "Pix" },
                        { id: "cartao", nome: "Cartão" },
                      ] as const).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMetodo(m.id)}
                          aria-pressed={metodo === m.id}
                          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                            metodo === m.id ? "border-sky-400 bg-sky-400/15" : "border-white/10 bg-zinc-900"
                          }`}
                        >
                          {m.nome}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )
          ) : null
        ) : permitido && acao === "cancelar" ? (
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-4 w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-sm text-white placeholder:text-white/60"
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
                !prontoParaConfirmar ||
                pagamentoIndisponivel ||
                (exigePagamento && !metodo) ||
                !dataEscolhida ||
                !horaEscolhida ||
                agendaLivre.length === 0
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
        </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const ROTULO_METODO: Record<string, string> = { pix: "Pix", cartao: "Cartão" };

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
          <p className="font-bold text-sky-100 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Aguardando o pagamento da multa
          </p>
          <ul className="mt-3 space-y-1.5 text-white/80">
            <li>
              Nova data reservada: <strong className="text-white">{r.novaDataTexto}</strong>
            </li>
            <li>
              Multa: <strong className="text-white">{valor}</strong> · {metodo}
            </li>
            <li>Reserva válida até {fmtHora(r.expiraEm)} (horário de Brasília)</li>
          </ul>
          {cobranca?.via === "pendente" ? (
            <p className="text-xs text-amber-200 mt-3">
              O pagamento online ainda não está disponível neste ambiente. Se a multa não for paga até {fmtHora(r.expiraEm)}, a reserva expira sozinha.
            </p>
          ) : (
            <p className="text-xs text-white/60 mt-3">
              Assim que o pagamento for aprovado, a nova data é confirmada automaticamente.
            </p>
          )}
          <p className="text-xs text-white/60 mt-1">
            Até lá, sua consulta continua em <strong className="text-white/85">{dataOriginal}</strong>.
          </p>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onDesistir}
            disabled={enviando}
            className="flex-1 py-3 rounded-xl border border-red-400/40 text-red-200 text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Desistir da remarcação
          </button>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-semibold disabled:opacity-40"
          >
            Fechar
          </button>
        </div>
        <p className="text-xs text-white/70 mt-2">Ao fechar, a reserva continua; você pode retomar pela tela inicial.</p>
      </>
    );
  }

  if (r.status === "aprovada") {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm" role="status">
        <p className="font-bold text-emerald-100">Multa paga — consulta remarcada para {r.novaDataTexto}.</p>
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
        <p className="font-bold text-amber-100">{motivo}</p>
        <p className="text-white/80 mt-1">
          Sua consulta continua na data original: <strong className="text-white">{dataOriginal}</strong>.
        </p>
        {r.status === "expirada" ? (
          <p className="text-xs text-white/70 mt-2">Se o pagamento for concluído depois do prazo, a multa é devolvida automaticamente.</p>
        ) : null}
      </div>
      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onFechar} className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-semibold">
          Fechar
        </button>
        <button type="button" onClick={onOutroHorario} className="flex-1 py-3 rounded-xl bg-sky-500 text-zinc-950 text-sm font-bold">
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
        <p className="text-xs text-white/70 mt-1">Para sua segurança, a confirmação só fica disponível depois de mostrarmos os valores.</p>
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
        <p className="font-bold text-emerald-100">Sem multa. {fraseMotivoReagendamento(motivoReagendamento)}.</p>
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
