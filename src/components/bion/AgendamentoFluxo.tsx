"use client";

import { useState } from "react";
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
import { diaFusoClinica } from "@/lib/bion-tipos";
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
  const { medicos, sessao, adicionarConsulta, adicionarArquivo } = useBion();

  const [step, setStep] = useState(0);
  const [especialidade, setEspecialidade] = useState("Clínica Geral");
  const [medicoSelecionado, setMedicoSelecionado] = useState<Medico | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState("Hoje");
  const [horaSelecionada, setHoraSelecionada] = useState("14:30");
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

  const steps = PASSOS_AGENDAMENTO;

  const medicosFiltrados = medicos.filter(
    (m) => m.status === "ativo" && (!especialidade || m.especialidade === especialidade),
  );

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

  const finalizarAgendamento = () => {
    setProcessandoPagamento(true);

    setTimeout(() => {
      setProcessandoPagamento(false);

      const med = medicoSelecionado ?? medicosFiltrados[0] ?? medicos[0];
      const motivoCompleto =
        [...sintomasEscolhidos, motivoTexto.trim() ? motivoTexto.trim() : ""]
          .filter(Boolean)
          .join(" • ") || "Consulta de rotina";

      adicionarConsulta({
        medico: med.nome,
        medicoId: med.id,
        especialidade: med.especialidade,
        paciente: sessao.nome,
        data: dataSelecionada,
        hora: horaSelecionada,
        motivoConsulta: motivoCompleto,
        valor: `R$ ${med.valor}`,
      });

      // Salva arquivos anexados no histórico
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
        description: `${med.nome} — ${dataSelecionada} às ${horaSelecionada}. Complete a anamnese para confirmar.`,
      });

      proximoPasso();
    }, 900);
  };

  // Gerador de datas dos próximos 14 dias
  const diasDisponiveis = Array.from({ length: 14 }).map((_, i) => {
    // Dias no fuso da clínica, não no do navegador.
    const d = diaFusoClinica(i);
    const diaNum = d.dia;
    const meses = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const sem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.semana];
    const rotulo = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${diaNum} ${meses[d.mes]}`;
    return { rotulo, sem, diaNum, mes: meses[d.mes] };
  });

  const medicoAtual = medicoSelecionado ?? medicosFiltrados[0] ?? medicos[0];

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
        setMedicoSelecionado={setMedicoSelecionado}
        setMedicoModal={setMedicoModal}
        proximoPasso={proximoPasso}
        dataSelecionada={dataSelecionada}
        setDataSelecionada={setDataSelecionada}
        horaSelecionada={horaSelecionada}
        setHoraSelecionada={setHoraSelecionada}
        diasDisponiveis={diasDisponiveis}
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
                  setMedicoSelecionado(medicoModal);
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
