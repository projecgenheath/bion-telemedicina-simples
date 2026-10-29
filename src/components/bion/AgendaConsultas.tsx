"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock, Stethoscope, X, RefreshCw, AlertTriangle, Video } from "lucide-react";
import { EstadoVazio } from "@/components/bion/ui/EstadoVazio";
import { useBion, type Consulta } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { agendaLivreDoMedico, isoDia } from "@/components/bion/paciente/agenda-medico";
import { useDiasBloqueados } from "@/components/bion/paciente/useDiasBloqueados";

export function AgendaConsultas({ perfil }: { perfil: "paciente" | "medico" }) {
  const { consultas, sessao } = useBion();
  const lista = consultas.filter((c) =>
    perfil === "paciente" ? c.paciente === sessao.nome : c.medico === sessao.nome,
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
  const { cancelarConsulta, remarcarConsulta, consultas, medicos } = useBion();
  const [modal, setModal] = useState<null | "cancelar" | "remarcar">(null);
  const [motivo, setMotivo] = useState("Imprevisto pessoal");
  const [diaIso, setDiaIso] = useState("");
  const [hora, setHora] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abrirModal = (m: "cancelar" | "remarcar") => {
    setErro(null);
    setProcessando(false);
    setModal(m);
  };
  const fecharModal = () => {
    setErro(null);
    setProcessando(false);
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
                    disabled={processando}
                    onClick={async () => {
                      setErro(null);
                      setProcessando(true);
                      const ok = await cancelarConsulta(c.id, motivo);
                      setProcessando(false);
                      if (!ok) {
                        // O erro do servidor já virou toast no store; o modal
                        // fica aberto com o motivo preservado para tentar de novo.
                        setErro("Não foi possível cancelar. Tente de novo.");
                        return;
                      }
                      toast.warning("Consulta cancelada", {
                        description: `${c.especialidade} com ${c.medico} — ${c.data} às ${c.hora}`,
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
