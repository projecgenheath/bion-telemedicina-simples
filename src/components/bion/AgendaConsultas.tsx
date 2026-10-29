"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock, Stethoscope, X, RefreshCw, AlertTriangle, Video } from "lucide-react";
import { EstadoVazio } from "@/components/bion/ui/EstadoVazio";
import { useBion, type Consulta } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { agendaLivreDoMedico, isoDia } from "@/components/bion/paciente/agenda-medico";
import { useDiasBloqueados } from "@/components/bion/paciente/useDiasBloqueados";
import {
  buscarPreviaCancelamento,
  fmtCentavos,
  previaCancelamentoMudou,
  type PreviaCancelamento,
} from "@/components/bion/paciente/usePreviaCancelamento";

export function AgendaConsultas({ perfil }: { perfil: "paciente" | "medico" }) {
  const { consultas, sessao } = useBion();
  // A13: filtro por ID (pacienteId/medicoId); o nome é só fallback para
  // registros legados sem ID — homônimos e grafias não escondem consultas.
  const doUsuario = (id: string | undefined, nome: string) =>
    sessao.id ? (id ? id === sessao.id : nome === sessao.nome) : nome === sessao.nome;
  const lista = consultas.filter((c) =>
    perfil === "paciente" ? doUsuario(c.pacienteId, c.paciente) : doUsuario(c.medicoId, c.medico),
  );
  const ativas = lista.filter((c) => c.status === "confirmada");
  const outras = lista.filter((c) => c.status !== "confirmada");

  return (
    <div className="space-y-3">
      {ativas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma consulta agendada"
          descricao="Quando você marcar uma teleconsulta, ela aparece aqui com data, horário e acesso à sala."
        />
      )}
      {ativas.map((c) => (
        <LinhaConsulta key={c.id} c={c} perfil={perfil} />
      ))}
      {outras.length > 0 && (
        <>
          <div className="pt-2 text-sm font-medium text-muted-foreground">
            Anteriores e canceladas
          </div>
          {outras.map((c) => (
            <LinhaConsulta key={c.id} c={c} perfil={perfil} />
          ))}
        </>
      )}
    </div>
  );
}

function LinhaConsulta({ c, perfil }: { c: Consulta; perfil: "paciente" | "medico" }) {
  const { cancelarConsulta, remarcarConsulta, consultas, medicos, sessao } = useBion();
  const [modal, setModal] = useState<null | "cancelar" | "remarcar">(null);
  const [motivo, setMotivo] = useState("Imprevisto pessoal");
  const [diaIso, setDiaIso] = useState("");
  const [hora, setHora] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A12: só o PACIENTE vê a prévia financeira do cancelamento (o endpoint
  // calcula pela perspectiva de quem chama; médico/admin seguem o fluxo
  // de sempre, sem prévia). Sem prévia carregada, o paciente não confirma
  // no escuro; no clique, a prévia é refeita e divergência bloqueia (A5).
  const souPaciente = perfil === "paciente" && sessao.role === "paciente";
  const [previa, setPrevia] = useState<PreviaCancelamento | null>(null);
  const [previaErro, setPreviaErro] = useState<string | null>(null);
  const [previaVersao, setPreviaVersao] = useState(0);
  const [condicoesMudaram, setCondicoesMudaram] = useState(false);
  const [erroRevalidacao, setErroRevalidacao] = useState<string | null>(null);

  useEffect(() => {
    if (!souPaciente || modal !== "cancelar") return;
    let cancelado = false;
    buscarPreviaCancelamento(c.id)
      .then((p) => {
        if (cancelado) return;
        setPrevia(p);
        setPreviaErro(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setPreviaErro(e instanceof Error ? e.message : "Não foi possível carregar a prévia.");
      });
    return () => {
      cancelado = true;
    };
  }, [souPaciente, modal, previaVersao, c.id]);

  const abrirModal = (m: "cancelar" | "remarcar") => {
    setErro(null);
    setProcessando(false);
    setPrevia(null);
    setPreviaErro(null);
    setCondicoesMudaram(false);
    setErroRevalidacao(null);
    setModal(m);
  };
  const fecharModal = () => {
    setErro(null);
    setProcessando(false);
    setPrevia(null);
    setPreviaErro(null);
    setCondicoesMudaram(false);
    setErroRevalidacao(null);
    setModal(null);
  };

  const cancelada = c.status === "cancelada";
  const concluida = c.status === "concluida";
  // Entrada na sala só para consultas que ainda podem acontecer. Concluída,
  // cancelada, aguardando reagendamento ou com falta não entram na sala.
  const podeEntrar =
    c.status === "confirmada" || c.status === "pendente_anamnese" || c.status === "em_espera";

  // Médico da consulta (por ID; nome só como último recurso, para registros
  // antigos sem medicoId) e sua agenda livre real — grade, pausas, horários
  // ocupados e dias bloqueados — em vez de datas fixas.
  const medico = useMemo(
    () =>
      medicos.find((m) => c.medicoId && m.id === c.medicoId) ??
      medicos.find((m) => m.nome === c.medico),
    [medicos, c.medicoId, c.medico],
  );
  const { bloqueados } = useDiasBloqueados(medico?.id ?? null);
  const isoAtual = isoDia(c.dataISO ?? c.ts);
  const agenda = useMemo(() => {
    // Pré-filtra as consultas deste médico (por ID, ou por nome quando o
    // médico não foi resolvido): assim, mesmo sem o objeto do médico, só os
    // horários dele bloqueiam a agenda — nunca as consultas de outros médicos.
    const doMedico = consultas.filter((cc) =>
      medico
        ? cc.medicoId
          ? cc.medicoId === medico.id
          : cc.medico === medico.nome
        : cc.medico === c.medico,
    );
    const livre = agendaLivreDoMedico(medico, doMedico, c.id, 14, bloqueados);
    // O slot atual aparece como livre porque a própria consulta é excluída
    // dos ocupados — mas remarcar para o mesmo dia/hora não é remarcar:
    // remove-o das opções.
    return livre
      .map((d) => ({
        ...d,
        horarios: d.horarios.filter((h) => !(d.iso === isoAtual && h === c.hora)),
      }))
      .filter((d) => d.horarios.length > 0);
  }, [medico, consultas, c.id, c.medico, c.hora, isoAtual, bloqueados]);
  // Seleção efetiva derivada da agenda (sem efeito): cai no 1º dia/horário
  // livre; se a seleção salva sair da agenda, volta para o 1º livre.
  const diaSelecionado = agenda.find((d) => d.iso === diaIso) ?? agenda[0];
  const horaSelecionada =
    diaSelecionado && diaSelecionado.horarios.includes(hora)
      ? hora
      : (diaSelecionado?.horarios[0] ?? "");

  return (
    <div className="bg-card border rounded-2xl p-4">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`font-semibold truncate ${cancelada ? "line-through text-muted-foreground" : ""}`}
          >
            {perfil === "paciente" ? c.medico : c.paciente}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{c.especialidade}</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {c.data}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {c.hora}
            </span>
          </div>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${cancelada ? "bg-destructive/10 text-destructive" : concluida ? "bg-muted text-muted-foreground" : c.status === "pendente_anamnese" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-accent-soft"}`}
          style={!cancelada && !concluida && c.status !== "pendente_anamnese" ? { color: "var(--accent)" } : undefined}
        >
          {cancelada
            ? "Cancelada"
            : concluida
              ? "Concluída"
              : c.status === "pendente_anamnese"
                ? "Pendente anamnese"
                : c.remarcada
                  ? "Remarcada"
                  : "Confirmada"}
        </span>
      </div>

      {!cancelada && !concluida && (
        <div className="flex flex-wrap gap-2 mt-3">
          {podeEntrar && (
            <a
              href={`/consulta?consulta=${encodeURIComponent(c.id)}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              <Video className="w-4 h-4" /> Entrar na sala
            </a>
          )}
          <button type="button"
            onClick={() => abrirModal("remarcar")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium hover:border-primary hover:text-primary transition"
          >
            <RefreshCw className="w-4 h-4" /> Remarcar
          </button>
          <button type="button"
            onClick={() => abrirModal("cancelar")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium text-destructive hover:bg-destructive/5 transition"
          >
            <X className="w-4 h-4" /> Cancelar
          </button>
        </div>
      )}
      {cancelada && c.motivoCancelamento && (
        <div className="mt-3 text-xs text-muted-foreground">Motivo: {c.motivoCancelamento}</div>
      )}

      {modal && (
        <ModalBion
          aberto
          onFechar={fecharModal}
          titulo={modal === "cancelar" ? "Cancelar consulta" : "Reagendar consulta"}
          largura="max-w-md"
          sheet
          sheetAte="md"
          overlay="bg-black/40"
        >
          <div className="bg-card w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 md:my-6">
            {modal === "cancelar" ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <h2 className="text-xl font-bold mt-4">Cancelar consulta?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {c.especialidade} • {c.data} às {c.hora}. O horário volta a ficar disponível na
                  agenda do médico.
                </p>
                <label className="block text-sm font-medium mt-4 mb-1.5">Motivo</label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full p-3 rounded-xl border bg-background text-sm outline-none focus:border-primary"
                >
                  {[
                    "Imprevisto pessoal",
                    "Melhora dos sintomas",
                    "Conflito de horário",
                    "Outro motivo",
                  ].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                {souPaciente && !previa && !previaErro && (
                  <p className="text-sm text-muted-foreground mt-4">
                    Carregando as condições do cancelamento…
                  </p>
                )}
                {souPaciente && previaErro && (
                  <div
                    className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
                    role="alert"
                  >
                    <p className="font-semibold text-destructive">
                      Não foi possível carregar os valores do cancelamento.
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {previaErro} Para sua segurança, a confirmação só fica disponível depois de
                      mostrarmos a multa e o reembolso.
                    </p>
                    <button type="button"
                      onClick={() => {
                        setPreviaErro(null);
                        setPreviaVersao((v) => v + 1);
                      }}
                      className="mt-2 text-sm font-semibold underline"
                    >
                      Tentar de novo
                    </button>
                  </div>
                )}
                {souPaciente && previa && !previa.podeCancelar && (
                  <p className="mt-4 rounded-2xl border p-4 text-sm text-muted-foreground" role="note">
                    {previa.status === "cancelada" || previa.status === "concluida"
                      ? `Esta consulta já foi ${previa.status === "cancelada" ? "cancelada" : "concluída"} e não pode mais ser cancelada.`
                      : "Esta consulta não pode ser cancelada por aqui. Fale com o suporte se precisar de ajuda."}
                  </p>
                )}
                {souPaciente && previa && previa.podeCancelar && (
                  <div className="mt-4 rounded-2xl border p-4 text-sm space-y-1.5">
                    {previa.cancelar.pago ? (
                      <>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Valor pago</span>
                          <strong>{fmtCentavos(previa.cancelar.valorCentavos)}</strong>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Multa</span>
                          <strong>{fmtCentavos(previa.cancelar.multaCentavos)}</strong>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Reembolso</span>
                          <strong>{fmtCentavos(previa.cancelar.reembolsoCentavos)}</strong>
                        </div>
                        {previa.cancelar.multaCentavos > 0 ? (
                          <p className="text-muted-foreground pt-1">
                            Cancelamentos com {previa.regra.janelaHoras} h ou menos de antecedência
                            têm multa de {previa.regra.multaPct}%. O prazo sem multa terminou em{" "}
                            {previa.cancelar.semMultaAteTexto}.
                          </p>
                        ) : previa.cancelar.isencao === "fora_da_janela" ? (
                          <p className="text-muted-foreground pt-1">
                            Sem multa: cancele sem multa até {previa.cancelar.semMultaAteTexto}{" "}
                            (horário de Brasília). O reembolso é integral e automático.
                          </p>
                        ) : (
                          <p className="text-muted-foreground pt-1">
                            Sem multa: o reembolso é integral e automático.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Esta consulta ainda não foi paga — nenhum valor será cobrado nem
                        reembolsado.
                      </p>
                    )}
                  </div>
                )}
                {souPaciente && condicoesMudaram && (
                  <div
                    className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm"
                    role="alert"
                  >
                    <p className="font-bold text-amber-900 dark:text-amber-100">
                      As condições mudaram desde que você abriu esta tela.
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Os valores acima acabaram de ser atualizados. Confira a multa e o reembolso
                      e confirme novamente para concluir o cancelamento.
                    </p>
                  </div>
                )}
                {souPaciente && erroRevalidacao && (
                  <div
                    className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm"
                    role="alert"
                  >
                    <p className="font-bold text-red-900 dark:text-red-100">
                      Não foi possível confirmar as condições agora.
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {erroRevalidacao} Para sua segurança, o cancelamento não foi feito sem
                      conferir os valores. Toque em confirmar para tentar de novo.
                    </p>
                  </div>
                )}
                {erro && (
                  <p role="alert" className="text-sm text-destructive mt-4">
                    {erro}
                  </p>
                )}
                <div className="flex gap-2 mt-6">
                  <button type="button"
                    onClick={fecharModal}
                    className="flex-1 py-3 rounded-xl border font-medium"
                  >
                    Voltar
                  </button>
                  <button type="button"
                    disabled={
                      processando || (souPaciente && (!previa || !previa.podeCancelar || !!previaErro))
                    }
                    onClick={async () => {
                      setErro(null);
                      setCondicoesMudaram(false);
                      setErroRevalidacao(null);
                      setProcessando(true);
                      // A12/A5 (só paciente): refaz a prévia NESTE clique — o
                      // servidor recalcula a multa agora, então só vale
                      // cancelar sobre os valores atuais. Mudou → não cancela:
                      // mostra os valores novos e pede nova confirmação.
                      // Falhou a busca → não cancela no escuro.
                      let confirmada: PreviaCancelamento | null = null;
                      if (souPaciente) {
                        if (!previa) {
                          setProcessando(false);
                          return;
                        }
                        try {
                          confirmada = await buscarPreviaCancelamento(c.id);
                        } catch (e) {
                          setProcessando(false);
                          setErroRevalidacao(
                            e instanceof Error
                              ? e.message
                              : "Não foi possível confirmar as condições do cancelamento.",
                          );
                          return;
                        }
                        if (previaCancelamentoMudou(previa, confirmada) || !confirmada.podeCancelar) {
                          setPrevia(confirmada);
                          setProcessando(false);
                          if (confirmada.podeCancelar) setCondicoesMudaram(true);
                          return;
                        }
                      }
                      const ok = await cancelarConsulta(c.id, motivo);
                      setProcessando(false);
                      if (!ok) {
                        // O erro do servidor já virou toast no store; o modal
                        // fica aberto com o motivo preservado para tentar de novo.
                        setErro("Não foi possível cancelar. Tente de novo.");
                        return;
                      }
                      toast.warning("Consulta cancelada", {
                        description:
                          confirmada?.cancelar.pago && confirmada.cancelar.reembolsoCentavos > 0
                            ? `${c.especialidade} com ${c.medico} — ${c.data} às ${c.hora} • Reembolso de ${fmtCentavos(confirmada.cancelar.reembolsoCentavos)}`
                            : `${c.especialidade} com ${c.medico} — ${c.data} às ${c.hora}`,
                      });
                      fecharModal();
                    }}
                    className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold disabled:opacity-50"
                  >
                    {processando ? "Cancelando…" : "Confirmar cancelamento"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">Remarcar consulta</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Escolha a nova data e horário com {c.medico} — só aparecem dias
                  e horários livres da agenda dele nos próximos 14 dias, e o
                  horário atual não pode ser escolhido como “novo”.
                </p>
                {agenda.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-4">
                    Nenhum horário livre nos próximos 14 dias para este médico.
                  </p>
                ) : (
                  <>
                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Data</div>
                      <div className="flex flex-wrap gap-2">
                        {agenda.map((d) => (
                          <button type="button"
                            key={d.iso}
                            onClick={() => setDiaIso(d.iso)}
                            className={`px-3 py-2 rounded-xl border text-sm ${diaSelecionado?.iso === d.iso ? "border-primary bg-primary-soft text-primary" : ""}`}
                          >
                            {d.rotulo}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Horário</div>
                      <div className="grid grid-cols-3 gap-2">
                        {(diaSelecionado?.horarios ?? []).map((h) => (
                          <button type="button"
                            key={h}
                            onClick={() => setHora(h)}
                            className={`py-2 rounded-xl border text-sm ${horaSelecionada === h ? "border-primary bg-primary-soft text-primary" : ""}`}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {erro && (
                  <p role="alert" className="text-sm text-destructive mt-4">
                    {erro}
                  </p>
                )}
                <div className="flex gap-2 mt-6">
                  <button type="button"
                    onClick={fecharModal}
                    className="flex-1 py-3 rounded-xl border font-medium"
                  >
                    Voltar
                  </button>
                  <button type="button"
                    disabled={processando || !diaSelecionado || !horaSelecionada}
                    onClick={async () => {
                      if (!diaSelecionado || !horaSelecionada) {
                        setErro("Escolha um dia e horário livres.");
                        return;
                      }
                      if (diaSelecionado.iso === isoAtual && horaSelecionada === c.hora) {
                        setErro("Escolha um horário diferente do atual.");
                        return;
                      }
                      setErro(null);
                      setProcessando(true);
                      // ISO (AAAA-MM-DD): sem ambiguidade de ano, ao contrário
                      // de rótulos como "12 Dez". O servidor aceita ISO.
                      const ok = await remarcarConsulta(c.id, diaSelecionado.iso, horaSelecionada);
                      setProcessando(false);
                      if (!ok) {
                        // O erro do servidor já virou toast no store; o modal
                        // fica aberto com a seleção preservada para tentar de novo.
                        setErro("Não foi possível remarcar. Escolha outro horário ou tente de novo.");
                        return;
                      }
                      toast.success("Consulta remarcada", {
                        description: `Novo horário: ${diaSelecionado.rotulo} às ${horaSelecionada}`,
                      });
                      fecharModal();
                    }}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                  >
                    {processando ? "Remarcando…" : "Confirmar novo horário"}
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalBion>
      )}
    </div>
  );
}
