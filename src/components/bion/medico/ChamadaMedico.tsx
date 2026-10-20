"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Pill, Award, X } from "lucide-react";
import { useBion as useStore } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { EncerrarAtendimento, type EscolhaEncerrar } from "@/components/bion/consulta/EncerrarAtendimento";
import { ConsultaNaoEncontrada, SalaConsultaTela } from "@/components/bion/consulta/SalaConsultaTela";
import { useSalaConsulta } from "@/components/bion/consulta/useSalaConsulta";
import { avisarDadosMedicoAlterados } from "@/components/bion/medico/useDadosMedico";
import { PainelEvolucao } from "@/components/bion/medico/evolucao/PainelEvolucao";

/**
 * Sala de teleconsulta do MÉDICO (movida de Consulta.tsx sem mudança visual
 * nem de comportamento): a sala comum + emissão de receita/atestado/exame e
 * a escolha do desfecho ao encerrar.
 */
export function ChamadaMedico({ onEnd, consultaId }: { onEnd: () => void; consultaId?: string }) {
  const role = "medico" as const;
  const { emitirDocumento, aplicarDelta } = useStore();
  const sala = useSalaConsulta({ role, consultaId, onEnd });
  const { sessao, consultaAtual, idSala, contraparteNome, anotacoes, sairDaSala, tele } = sala;
  const { outroOnline } = tele;

  // Teleconsulta v2: painel da Evolução (deslizar) e trava do próximo
  // atendimento — o servidor também recusa a sala com 409 evolucao_pendente.
  const [evolucaoAberta, setEvolucaoAberta] = useState(false);
  const abrirEvolucao = useCallback(() => setEvolucaoAberta(true), []);
  const fecharEvolucao = useCallback(() => setEvolucaoAberta(false), []);
  const [pendente, setPendente] = useState<{ consultaId: string; paciente: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/medico/evolucao-pendente", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ pendente: { consultaId: string; paciente: string } | null }>) : null))
      .then((j) => {
        if (vivo) setPendente(j?.pendente && j.pendente.consultaId !== idSala ? j.pendente : null);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [idSala]);

  // Modais de Emissão
  const [modalReceita, setModalReceita] = useState(false);
  const [modalAtestado, setModalAtestado] = useState(false);
  const [modalExame, setModalExame] = useState(false);

  // Formulários de emissão — SEMPRE vazios: nada clínico pré-preenchido
  // (um clique em "emitir" não pode gerar receita/atestado/exame fictício).
  // Form Receita
  const [recTitulo, setRecTitulo] = useState("");
  const [recMedicamento, setRecMedicamento] = useState("");
  const [recPosologia, setRecPosologia] = useState("");
  const [recDuracao, setRecDuracao] = useState("");
  const [recObs, setRecObs] = useState("");

  // Form Atestado
  const [atestDias, setAtestDias] = useState("");
  const [atestCid, setAtestCid] = useState("");
  const [atestObs, setAtestObs] = useState("");

  // Form Exame
  const [exameNome, setExameNome] = useState("");
  const [exameUrgencia, setExameUrgencia] = useState("Rotina");
  const [exameObs, setExameObs] = useState("");

  const limparReceita = () => {
    setRecTitulo("");
    setRecMedicamento("");
    setRecPosologia("");
    setRecDuracao("");
    setRecObs("");
  };
  const limparAtestado = () => {
    setAtestDias("");
    setAtestCid("");
    setAtestObs("");
  };
  const limparExame = () => {
    setExameNome("");
    setExameUrgencia("Rotina");
    setExameObs("");
  };

  /** Emissão só com consulta ativa e paciente identificado (por ID). */
  const pacienteIdAtual = consultaAtual?.pacienteId;
  const podeEmitir = () => {
    if (!consultaAtual || !pacienteIdAtual) {
      toast.error("Nenhuma consulta ativa identificada", {
        description: "Não foi possível identificar o paciente desta consulta. Documento não emitido.",
      });
      return false;
    }
    return true;
  };

  const salvarReceita = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recMedicamento.trim() || !recPosologia.trim() || !recDuracao.trim()) return;
    if (!podeEmitir()) return;
    const medicamento = recMedicamento.trim();
    const obs = recObs.trim();
    emitirDocumento(
      {
        tipo: "receita",
        titulo: recTitulo.trim() || `Receita — ${medicamento}`,
        medico: sessao.nome,
        paciente: contraparteNome,
        medicamento,
        posologia: recPosologia.trim(),
        duracao: recDuracao.trim(),
        observacoes: obs,
        conteudo: `${medicamento} — ${recPosologia.trim()} por ${recDuracao.trim()}.${obs ? ` ${obs}` : ""}`,
      },
      pacienteIdAtual,
    );
    toast.success("Receita emitida", {
      description: "Disponível no painel do paciente. Documento sem assinatura digital ICP-Brasil.",
    });
    limparReceita();
    setModalReceita(false);
  };

  const salvarAtestado = (e: React.FormEvent) => {
    e.preventDefault();
    const dias = parseInt(atestDias, 10);
    if (!Number.isFinite(dias) || dias < 1 || !atestObs.trim()) return;
    if (!podeEmitir()) return;
    const cid = atestCid.trim();
    const obs = atestObs.trim();
    const rotuloDias = `${dias} ${dias === 1 ? "dia" : "dias"}`;
    emitirDocumento(
      {
        tipo: "atestado",
        titulo: `Atestado — ${rotuloDias} de afastamento`,
        medico: sessao.nome,
        paciente: contraparteNome,
        cid: cid || undefined,
        duracao: rotuloDias,
        observacoes: obs,
        conteudo: `Atesto para os devidos fins que o(a) paciente necessita de afastamento por ${rotuloDias}.${cid ? ` CID: ${cid}.` : ""} ${obs}`,
      },
      pacienteIdAtual,
    );
    toast.success("Atestado emitido", {
      description: "Disponível no painel do paciente. Documento sem assinatura digital ICP-Brasil.",
    });
    limparAtestado();
    setModalAtestado(false);
  };

  const salvarExame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exameNome.trim()) return;
    if (!podeEmitir()) return;
    emitirDocumento(
      {
        tipo: "exame_solicitado",
        titulo: `Solicitação de Exame — ${exameNome.trim()}`,
        medico: sessao.nome,
        paciente: contraparteNome,
        duracao: exameUrgencia,
        observacoes: exameObs.trim(),
        conteudo: `Solicita-se: ${exameNome.trim()} (urgência: ${exameUrgencia}).${exameObs.trim() ? ` ${exameObs.trim()}` : ""}`,
      },
      pacienteIdAtual,
    );
    toast.success("Exame solicitado", {
      description: "O pedido foi enviado ao painel do paciente.",
    });
    limparExame();
    setModalExame(false);
  };

  // Médico: "Encerrar" abre a escolha (concluir / falta do paciente / falha
  // técnica / sair sem concluir). Regras do Alisson (06/10/2026): sem o
  // paciente na sala a consulta NÃO é concluída (o servidor também recusa).
  const [escolhaAberta, setEscolhaAberta] = useState(false);


  const encerrar = () => {
    if (idSala) {
      setEscolhaAberta(true);
      return;
    }
    sairDaSala();
  };

  /** Executa a escolha do médico. Devolve a recusa do servidor (fica no modal) ou null. */
  const executarEscolha = async (escolha: EscolhaEncerrar): Promise<string | null> => {
    if (!idSala) return "Nenhuma consulta identificada nesta sala.";
    if (escolha === "sair") {
      setEscolhaAberta(false);
      toast.info("Você saiu sem concluir", {
        description: "Dá para marcar falta do paciente ou falha técnica pela agenda até 23:30 de hoje.",
      });
      sairDaSala();
      return null;
    }
    // C4: SEMPRE a consulta desta sala (a mesma usada no WebRTC).
    const req =
      escolha === "concluir"
        ? fetch(`/api/consultas/${encodeURIComponent(idSala)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao: "concluir", resumo: anotacoes }),
          })
        : fetch(`/api/medico/consultas/${encodeURIComponent(idSala)}/desfecho`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo: escolha }),
          });
    let res: Response;
    try {
      res = await req;
    } catch {
      return "Falha de conexão com o servidor.";
    }
    const json = (await res.json().catch(() => null)) as ({ erro?: string } & Record<string, unknown>) | null;
    if (!res.ok) return json?.erro ?? `Não foi possível concluir a operação (erro ${res.status}).`;
    aplicarDelta(json);
    avisarDadosMedicoAlterados();
    setEscolhaAberta(false);
    if (escolha === "concluir") {
      toast.success("Consulta concluída");
    } else if (escolha === "falta_paciente") {
      toast.success("Falta do paciente registrada", {
        description: "Você recebe normalmente. O paciente foi avisado e pode pedir reembolso em até 7 dias.",
      });
    } else {
      toast.success("Falha técnica registrada", {
        description: "O paciente foi avisado e escolhe entre remarcar sem custo ou o reembolso.",
      });
    }
    sairDaSala();
    return null;
  };

  if (tele.naoEncontrada) return <ConsultaNaoEncontrada role={role} />;

  if (pendente) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-bold">Conclua a evolução de {pendente.paciente} para atender o próximo.</p>
        <button type="button" onClick={abrirEvolucao} className="rounded-full bg-primary text-primary-foreground px-6 py-3 font-bold">
          Abrir evolução pendente
        </button>
        <button type="button" onClick={onEnd} className="underline text-sm">Voltar</button>
        <PainelEvolucao
          consultaId={pendente.consultaId}
          aberto={evolucaoAberta}
          onAbrir={abrirEvolucao}
          onFechar={fecharEvolucao}
          onConcluida={() => {
            setEvolucaoAberta(false);
            window.location.reload();
          }}
        />
      </div>
    );
  }

  return (
    <SalaConsultaTela
      sala={sala}
      role={role}
      onEnd={onEnd}
      onEncerrar={encerrar}
      onReceita={() => setModalReceita(true)}
      onAtestado={() => setModalAtestado(true)}
      onExame={() => setModalExame(true)}
    >
      {idSala ? (
        <PainelEvolucao consultaId={idSala} aberto={evolucaoAberta} onAbrir={abrirEvolucao} onFechar={fecharEvolucao} />
      ) : null}
      <EncerrarAtendimento
        aberto={escolhaAberta}
        consultaId={idSala}
        outroOnline={outroOnline}
        onFechar={() => setEscolhaAberta(false)}
        onEscolher={executarEscolha}
      />

      {/* Modal de Emissão de Receita */}
      {modalReceita && (
        <ModalBion
          aberto
          onFechar={() => setModalReceita(false)}
          titulo="Emitir Receita"
          largura="max-w-lg"
          overlay="bg-black/70 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <form
            onSubmit={salvarReceita}
            className="bg-card text-foreground border rounded-3xl w-full p-6 md:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Pill className="w-5 h-5 text-primary" /> Emitir Receita
              </h3>
              <button
                type="button"
                onClick={() => setModalReceita(false)}
                className="text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Título da Receita (opcional)</label>
                <input
                  aria-label="Título da Receita"
                  value={recTitulo}
                  onChange={(e) => setRecTitulo(e.target.value)}
                  placeholder="Padrão: Receita — <medicamento>"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Medicamento & Dosagem</label>
                  <input
                  aria-label="Medicamento & Dosagem"
                    value={recMedicamento}
                    onChange={(e) => setRecMedicamento(e.target.value)}
                    placeholder="Nome, concentração e forma"
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Duração</label>
                  <input
                  aria-label="Duração"
                    value={recDuracao}
                    onChange={(e) => setRecDuracao(e.target.value)}
                    placeholder="Ex.: 7 dias, uso contínuo"
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Posologia (Modo de usar)</label>
                <input
                  aria-label="Posologia (modo de usar)"
                  value={recPosologia}
                  onChange={(e) => setRecPosologia(e.target.value)}
                  placeholder="Dose, via, frequência e horário"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Observações ao Paciente</label>
                <textarea
                  aria-label="Observações ao Paciente"
                  value={recObs}
                  onChange={(e) => setRecObs(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-primary-foreground font-bold text-xs shadow-md"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Emitir e Disponibilizar ao Paciente
            </button>
          </form>
        </ModalBion>
      )}

      {/* Modal de Emissão de Atestado */}
      {modalAtestado && (
        <ModalBion
          aberto
          onFechar={() => setModalAtestado(false)}
          titulo="Emitir Atestado Médico"
          largura="max-w-lg"
          overlay="bg-black/70 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <form
            onSubmit={salvarAtestado}
            className="bg-card text-foreground border rounded-3xl w-full p-6 md:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" /> Emitir Atestado Médico
              </h3>
              <button
                type="button"
                onClick={() => setModalAtestado(false)}
                className="text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Dias de Afastamento</label>
                  <input
                  aria-label="Dias de Afastamento"
                    value={atestDias}
                    onChange={(e) => setAtestDias(e.target.value)}
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">CID-10 (opcional)</label>
                  <input
                  aria-label="CID-10"
                    value={atestCid}
                    onChange={(e) => setAtestCid(e.target.value)}
                    placeholder="Somente com autorização do paciente"
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Justificativa e Recomendações</label>
                <textarea
                  aria-label="Justificativa e Recomendações"
                  value={atestObs}
                  onChange={(e) => setAtestObs(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-md"
            >
              Emitir Atestado
            </button>
          </form>
        </ModalBion>
      )}

      {/* Modal de Solicitação de Exame */}
      {modalExame && (
        <ModalBion
          aberto
          onFechar={() => setModalExame(false)}
          titulo="Solicitar Exame Complementar"
          largura="max-w-lg"
          overlay="bg-black/70 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <form
            onSubmit={salvarExame}
            className="bg-card text-foreground border rounded-3xl w-full p-6 md:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-500 dark:text-violet-400" /> Solicitar Exame Complementar
              </h3>
              <button
                type="button"
                onClick={() => setModalExame(false)}
                className="text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Exame</label>
                <input
                  aria-label="Exame"
                  value={exameNome}
                  onChange={(e) => setExameNome(e.target.value)}
                  placeholder="Ex: Hemograma Completo, Raio-X de Tórax, TGO/TGP"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Urgência</label>
                <div className="flex gap-2">
                  {["Rotina", "Prioritário", "Urgente"].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setExameUrgencia(u)}
                      className={`flex-1 py-2 rounded-xl border font-bold transition ${
                        exameUrgencia === u
                          ? "bg-violet-600 dark:bg-violet-500 border-violet-600 dark:border-violet-500 text-white"
                          : "hover:border-violet-500 text-muted-foreground"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">Instruções de Preparo</label>
                <textarea
                  aria-label="Instruções de Preparo"
                  value={exameObs}
                  onChange={(e) => setExameObs(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-violet-600 dark:bg-violet-500 hover:bg-violet-700 text-white font-bold text-xs shadow-md transition"
            >
              Enviar Solicitação ao Paciente
            </button>
          </form>
        </ModalBion>
      )}
    </SalaConsultaTela>
  );
}
