"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Stethoscope,
  Calendar,
  Clock,
  Star,
  ChevronRight,
  ChevronLeft,
  Check,
  CreditCard,
  QrCode,
  FileText,
  Upload,
  Trash2,
  ShieldCheck,
  Heart,
  Sparkles,
  Search,
  Info,
  ArrowRight,
  UserCheck,
  AlertCircle,
  Copy,
  CheckCheck,
} from "lucide-react";
import { useBion, type Medico } from "@/lib/bion-store";
import { agendaLivreDoMedico } from "@/components/bion/paciente/agenda-medico";
import { diasDoAgendamento, selecaoValida } from "@/components/bion/agendamento/horarios";
import { ModalBion } from "@/components/bion/ModalBion";
import {
  ESPECIALIDADES,
  SINTOMAS_RAPIDOS,
  PASSOS_AGENDAMENTO,
} from "@/components/bion/agendamento/constantes";
import { AgendamentoBarraProgresso } from "@/components/bion/agendamento/BarraProgresso";
import { AgendamentoCorpo } from "@/components/bion/agendamento/Corpo";

export function AgendamentoFluxo({
  onDone,
  onGoToWaitingRoom,
}: {
  onDone: () => void;
  onGoToWaitingRoom: () => void;
}) {
  const { medicos, consultas, sessao, adicionarConsulta, adicionarArquivo } = useBion();

  const [step, setStep] = useState(0);
  const [especialidade, setEspecialidade] = useState("Clínica Geral");
  const [medicoSelecionado, setMedicoSelecionado] = useState<Medico | null>(null);
  // Escolha do paciente: dia pela chave ISO (fuso da clínica) — o rótulo
  // "Hoje"/"Amanhã" muda de significado na virada do dia, o ISO não.
  const [diaEscolhidoIso, setDiaEscolhidoIso] = useState("");
  const [horaEscolhida, setHoraEscolhida] = useState("");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [sintomasEscolhidos, setSintomasEscolhidos] = useState<string[]>([]);
  const [arquivosAnexados, setArquivosAnexados] = useState<
    { nome: string; tamanhoKb: number; tipo: string }[]
  >([]);
  const [metodoPagamento, setMetodoPagamento] = useState<"pix" | "cartao" | "boleto">("pix");
  const [pixCopiado, setPixCopiado] = useState(false);
  const [cartaoNumero, setCartaoNumero] = useState("");
  const [cartaoNome, setCartaoNome] = useState("");
  const [cartaoValidade, setCartaoValidade] = useState("");
  const [cartaoCVV, setCartaoCVV] = useState("");
  const [cartaoParcelas, setCartaoParcelas] = useState("1");
  const [processandoPagamento, setProcessandoPagamento] = useState(false);
  const [medicoModal, setMedicoModal] = useState<Medico | null>(null);
  // Data/hora "congeladas" enquanto o servidor processa e depois de confirmada:
  // a consulta criada passa a ocupar o slot e a seleção derivada ficaria vazia.
  const [selecaoCongelada, setSelecaoCongelada] = useState<{ data: string; hora: string } | null>(
    null,
  );
  // Relógio de 1 minuto: horários que passam a ficar no passado somem da lista.
  const [minutoAtual, setMinutoAtual] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const id = setInterval(() => setMinutoAtual(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(id);
  }, []);

  // adicionarConsulta não devolve sucesso/erro (em erro o store mostra a
  // mensagem do servidor e não cria nada). Para saber se a consulta foi de
  // fato criada, comparamos a lista de consultas após o próximo commit.
  const consultasRef = useRef(consultas);
  const aguardandoCommitRef = useRef<Array<() => void>>([]);
  const [, forcarRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    consultasRef.current = consultas;
    const pendentes = aguardandoCommitRef.current;
    aguardandoCommitRef.current = [];
    pendentes.forEach((resolver) => resolver());
  });
  const proximoCommit = () =>
    new Promise<void>((resolver) => {
      aguardandoCommitRef.current.push(resolver);
      forcarRender();
    });

  const steps = PASSOS_AGENDAMENTO;

  const medicosFiltrados = medicos.filter(
    (m) => m.status === "ativo" && (!especialidade || m.especialidade === especialidade),
  );

  const medicoAtual = medicoSelecionado ?? medicosFiltrados[0] ?? medicos[0];

  // Agenda LIVRE do médico no fuso da clínica (horariosDisponiveis do médico,
  // sem horários passados nem já ocupados por consultas conhecidas no cliente)
  // e sem horários em que o próprio paciente já tem consulta. Outras reservas
  // de outros pacientes só o servidor conhece: o 409 dele continua valendo.
  const diasDisponiveis = useMemo(
    () => diasDoAgendamento(agendaLivreDoMedico(medicoAtual, consultas), consultas),
    [medicoAtual, consultas, minutoAtual],
  );

  // Seleção efetiva: se o dia saiu da agenda ou a hora não está mais livre
  // nele (troca de médico/especialidade, virada do dia, vaga ocupada), a
  // escolha é descartada e o paciente escolhe de novo.
  const selecao = selecaoValida(diasDisponiveis, diaEscolhidoIso, horaEscolhida);
  // Rótulo enviado ao servidor: "Hoje" | "Amanhã" | "D Mês" (parseDataHora).
  const dataSelecionada = selecaoCongelada?.data ?? selecao.dia?.rotulo ?? "";
  const horaSelecionada = selecaoCongelada?.hora ?? selecao.hora;

  const setDataSelecionada = (rotulo: string) => {
    setDiaEscolhidoIso(diasDisponiveis.find((d) => d.rotulo === rotulo)?.iso ?? "");
  };
  const setHoraSelecionada = (hora: string) => setHoraEscolhida(hora);

  const escolherMedico = (m: Medico | null) => {
    if (m?.id !== medicoSelecionado?.id) {
      setDiaEscolhidoIso("");
      setHoraEscolhida("");
    }
    setMedicoSelecionado(m);
  };

  const proximoPasso = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const passoAnterior = () => setStep((s) => Math.max(s - 1, 0));

  const toggleSintoma = (sintoma: string) => {
    setSintomasEscolhidos((prev) =>
      prev.includes(sintoma) ? prev.filter((s) => s !== sintoma) : [...prev, sintoma],
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const novos = Array.from(e.target.files).map((f) => ({
      nome: f.name,
      tamanhoKb: Math.max(1, Math.round(f.size / 1024)),
      tipo: f.type.includes("image") ? "Imagem de exame" : "Documento PDF",
    }));
    setArquivosAnexados((prev) => [...prev, ...novos]);
    e.target.value = "";
  };

  const removerArquivo = (index: number) => {
    setArquivosAnexados((prev) => prev.filter((_, i) => i !== index));
  };

  const copiarChavePix = () => {
    const chave =
      "00020126580014br.gov.bcb.pix0136bion-telemedicina-pay-987655204000053039865802BR5925BION TELEMEDICINA SA6009SAO PAULO62070503***6304A1B2";
    navigator.clipboard?.writeText(chave).catch(() => {});
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2500);
  };

  const finalizarAgendamento = async () => {
    if (processandoPagamento) return;

    const med = medicoAtual;
    if (!med) {
      toast.error("Escolha um médico para continuar.");
      setStep(1);
      return;
    }
    if (!selecao.dia || !selecao.hora) {
      toast.error("Esse horário não está mais disponível", {
        description: "Escolha outro dia ou horário livre na agenda do médico.",
      });
      setStep(selecao.dia ? 3 : 2);
      return;
    }

    const data = selecao.dia.rotulo;
    const hora = selecao.hora;
    const motivoCompleto =
      [...sintomasEscolhidos, motivoTexto.trim() ? motivoTexto.trim() : ""]
        .filter(Boolean)
        .join(" • ") || "Consulta de rotina";

    setProcessandoPagamento(true);
    setSelecaoCongelada({ data, hora });
    const idsAntes = new Set(consultasRef.current.map((c) => c.id));

    try {
      await Promise.resolve(
        adicionarConsulta({
          medico: med.nome,
          medicoId: med.id,
          especialidade: med.especialidade,
          paciente: sessao.nome,
          data,
          hora,
          motivoConsulta: motivoCompleto,
          valor: `R$ ${med.valor}`,
        }),
      );
      await proximoCommit();
    } finally {
      setProcessandoPagamento(false);
    }

    const criada = consultasRef.current.find(
      (c) => !idsAntes.has(c.id) && (c.medicoId ? c.medicoId === med.id : c.medico === med.nome),
    );

    if (!criada) {
      // Servidor recusou (ex.: 409 horário já ocupado, horário no passado) ou
      // falha de rede: o store já mostrou a mensagem do servidor. Nada foi
      // reservado nem cobrado — volta para a escolha de horário.
      setSelecaoCongelada(null);
      setHoraEscolhida("");
      toast.error("Consulta não reservada", {
        description: "Nenhum pagamento foi confirmado. Escolha outro horário e tente novamente.",
      });
      setStep(3);
      return;
    }

    // Salva arquivos anexados no histórico (só com a consulta criada)
    arquivosAnexados.forEach((a) => {
      adicionarArquivo({
        nome: a.nome,
        tipo: a.tipo,
        tamanhoKb: a.tamanhoKb,
        enviadoPor: "paciente",
        consulta: `${med.especialidade} — ${med.nome}`,
      });
    });

    toast.success("Pagamento aprovado! Consulta reservada", {
      description: `${med.nome} — ${data} às ${hora}. Complete a anamnese para confirmar.`,
    });

    setStep(steps.length - 1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <AgendamentoBarraProgresso step={step} steps={steps} onVoltar={passoAnterior} />

      <AgendamentoCorpo
        step={step}
        especialidade={especialidade}
        setEspecialidade={setEspecialidade}
        medicos={medicos}
        medicosFiltrados={medicosFiltrados}
        medicoSelecionado={medicoSelecionado}
        setMedicoSelecionado={escolherMedico}
        setMedicoModal={setMedicoModal}
        proximoPasso={proximoPasso}
        dataSelecionada={dataSelecionada}
        setDataSelecionada={setDataSelecionada}
        horaSelecionada={horaSelecionada}
        setHoraSelecionada={setHoraSelecionada}
        diasDisponiveis={diasDisponiveis}
        irParaPasso={setStep}
        motivoTexto={motivoTexto}
        setMotivoTexto={setMotivoTexto}
        sintomasEscolhidos={sintomasEscolhidos}
        toggleSintoma={toggleSintoma}
        arquivosAnexados={arquivosAnexados}
        setArquivosAnexados={setArquivosAnexados}
        handleFileUpload={handleFileUpload}
        removerArquivo={removerArquivo}
        metodoPagamento={metodoPagamento}
        setMetodoPagamento={setMetodoPagamento}
        pixCopiado={pixCopiado}
        copiarChavePix={copiarChavePix}
        cartaoNumero={cartaoNumero}
        setCartaoNumero={setCartaoNumero}
        cartaoNome={cartaoNome}
        setCartaoNome={setCartaoNome}
        cartaoValidade={cartaoValidade}
        setCartaoValidade={setCartaoValidade}
        cartaoCVV={cartaoCVV}
        setCartaoCVV={setCartaoCVV}
        cartaoParcelas={cartaoParcelas}
        setCartaoParcelas={setCartaoParcelas}
        processandoPagamento={processandoPagamento}
        finalizarAgendamento={finalizarAgendamento}
        medicoAtual={medicoAtual}
        onGoToWaitingRoom={onGoToWaitingRoom}
        onDone={onDone}
      />

      {/* Modal de Detalhes do Médico */}
      {medicoModal && (
        <ModalBion
          aberto
          onFechar={() => setMedicoModal(null)}
          titulo={`Detalhes do médico: ${medicoModal.nome}`}
          largura="max-w-lg"
          className="py-4"
        >
          <div className="bg-card border rounded-3xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xl shrink-0">
                {medicoModal.nome
                  .split(" ")
                  .slice(-2)
                  .map((w) => w[0])
                  .join("")}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold">{medicoModal.nome}</h3>
                <p className="text-sm text-muted-foreground">
                  {medicoModal.especialidade} • {medicoModal.crm}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-amber-500 dark:text-amber-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-500" /> {medicoModal.avaliacao} (
                  {medicoModal.numAvaliacoes} avaliações)
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="font-bold text-muted-foreground uppercase">
                  Sobre o especialista
                </div>
                <p className="text-foreground mt-1 leading-relaxed">{medicoModal.bio}</p>
              </div>

              <div>
                <div className="font-bold text-muted-foreground uppercase">
                  Formação & Experiência
                </div>
                <p className="text-foreground mt-1">{medicoModal.formacao}</p>
                <p className="text-muted-foreground mt-0.5">{medicoModal.experiencia}</p>
              </div>

              <div>
                <div className="font-bold text-muted-foreground uppercase">Subespecialidades</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {medicoModal.subespecialidades.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-lg bg-muted font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-bold text-muted-foreground uppercase">Idiomas</div>
                <p className="text-foreground mt-1">{medicoModal.idiomas.join(", ")}</p>
              </div>
            </div>

            <div className="pt-3 border-t flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Valor por consulta</div>
                <div className="text-xl font-extrabold text-primary">R$ {medicoModal.valor},00</div>
              </div>
              <button type="button"
                onClick={() => {
                  escolherMedico(medicoModal);
                  setMedicoModal(null);
                  proximoPasso();
                }}
                className="px-5 py-2.5 rounded-xl text-primary-foreground font-bold text-xs"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Escolher este médico
              </button>
            </div>
          </div>
        </ModalBion>
      )}
    </div>
  );
}
