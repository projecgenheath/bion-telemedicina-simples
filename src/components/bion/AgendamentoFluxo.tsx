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

const ESPECIALIDADES = [
  {
    id: "clinica",
    nome: "Clínica Geral",
    desc: "Check-ups, sintomas gerais, receitas e atestados",
    icone: Stethoscope,
  },
  {
    id: "cardio",
    nome: "Cardiologia",
    desc: "Pressão arterial, coração, prevenção e arritmias",
    icone: Heart,
  },
  {
    id: "dermato",
    nome: "Dermatologia",
    desc: "Pele, cabelos, unhas, acne e alergias",
    icone: Sparkles,
  },
  {
    id: "pediatria",
    nome: "Pediatria",
    desc: "Saúde e desenvolvimento infantil e bebês",
    icone: UserCheck,
  },
  {
    id: "psico",
    nome: "Psicologia",
    desc: "Terapia online, ansiedade, estresse e suporte emocional",
    icone: Stethoscope,
  },
  {
    id: "ortopedia",
    nome: "Ortopedia",
    desc: "Dores articulares, postura, coluna e lesões",
    icone: Stethoscope,
  },
];

const SINTOMAS_RAPIDOS = [
  "Dor de cabeça / Enxaqueca",
  "Sintomas gripais / Febre",
  "Renovação de receita de uso contínuo",
  "Check-up geral de rotina",
  "Avaliação de exames laboratoriais",
  "Pressão alta / Palpitações",
  "Alergia na pele / Coceira",
  "Dor nas costas / Postura",
];

export function AgendamentoFluxo({
  onDone,
  onGoToWaitingRoom,
}: {
  onDone: () => void;
  onGoToWaitingRoom: () => void;
}) {
  const { medicos, sessao, adicionarConsulta, adicionarArquivo, notificar } = useBion();

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

  const steps = [
    "Especialidade",
    "Médico",
    "Data",
    "Horário",
    "Motivo & Sintomas",
    "Anexar Exames",
    "Pagamento",
    "Confirmação",
  ];

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
        especialidade: med.especialidade,
        paciente: sessao.nome,
        data: dataSelecionada,
        hora: horaSelecionada,
        motivoConsulta: motivoCompleto,
        valor: `R$ ${med.valor}`,
        pago: true,
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

      notificar({
        tipo: "agenda",
        titulo: "Consulta confirmada com sucesso!",
        texto: `${med.nome} — ${dataSelecionada} às ${horaSelecionada}. Pagamento aprovado.`,
        para: "paciente",
      });

      notificar({
        tipo: "agenda",
        titulo: "Novo paciente agendado",
        texto: `${sessao.nome} agendou para ${dataSelecionada} às ${horaSelecionada}.`,
        para: "medico",
      });

      toast.success("Pagamento aprovado! Consulta confirmada", {
        description: `${med.nome} — ${dataSelecionada} às ${horaSelecionada}`,
      });

      proximoPasso();
    }, 900);
  };

  // Gerador de datas dos próximos 14 dias
  const diasDisponiveis = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const diaNum = d.getDate();
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
    const sem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
    const rotulo = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${diaNum} ${meses[d.getMonth()]}`;
    return { rotulo, sem, diaNum, mes: meses[d.getMonth()] };
  });

  const medicoAtual = medicoSelecionado ?? medicosFiltrados[0] ?? medicos[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Barra de Progresso */}
      <div className="bg-card border rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              Passo {step + 1} de {steps.length}
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight mt-0.5">{steps[step]}</h1>
          </div>
          {step > 0 && step < 7 && (
            <button
              onClick={passoAnterior}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl hover:bg-muted transition"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          )}
        </div>

        {/* Linha de progresso */}
        <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Passo 1: Especialidade */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Selecione a área médica para atendimento imediato ou agendado:
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ESPECIALIDADES.map((esp) => {
              const Icon = esp.icone;
              const isSelected = especialidade === esp.nome;
              const count = medicos.filter(
                (m) => m.especialidade === esp.nome && m.status === "ativo",
              ).length;
              return (
                <button
                  key={esp.id}
                  onClick={() => {
                    setEspecialidade(esp.nome);
                    proximoPasso();
                  }}
                  className={`p-5 rounded-3xl border text-left transition relative flex flex-col justify-between ${
                    isSelected
                      ? "bg-primary-soft border-primary ring-2 ring-primary/20"
                      : "bg-card hover:border-primary/50 hover:shadow-sm"
                  }`}
                >
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-bold text-base text-foreground">{esp.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{esp.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs font-semibold text-primary">
                    <span>{count} médicos disponíveis</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Passo 2: Escolha do Médico */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 text-sm text-muted-foreground">
            <span>
              Médicos especialistas em <strong className="text-foreground">{especialidade}</strong>:
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent-soft text-emerald-700">
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
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-emerald-700">
                        {med.crm}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-500" /> {med.avaliacao}
                      </span>
                      <span>•</span>
                      <span>{med.numAvaliacoes} atendimentos</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {med.subespecialidades.slice(0, 3).map((sub) => (
                        <span
                          key={sub}
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-muted text-muted-foreground"
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
                    <button
                      onClick={() => setMedicoModal(med)}
                      className="px-3 py-2 rounded-xl border text-xs font-semibold hover:bg-muted transition"
                    >
                      Ver Perfil
                    </button>
                    <button
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
      )}

      {/* Passo 3: Data */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Escolha o melhor dia para ser atendido por <strong>{medicoAtual.nome}</strong>:
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {diasDisponiveis.map((d, i) => {
              const isSelected = dataSelecionada === d.rotulo;
              return (
                <button
                  key={i}
                  onClick={() => {
                    setDataSelecionada(d.rotulo);
                    proximoPasso();
                  }}
                  className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                      : "bg-card hover:border-primary hover:bg-primary-soft"
                  }`}
                >
                  <span
                    className={`text-xs ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    {d.sem}
                  </span>
                  <span className="text-2xl font-extrabold">{d.diaNum}</span>
                  <span
                    className={`text-[11px] font-semibold ${isSelected ? "text-primary-foreground" : "text-primary"}`}
                  >
                    {d.rotulo === "Hoje" ? "Hoje" : d.mes}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Passo 4: Horário */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Horários disponíveis para <strong>{dataSelecionada}</strong>:
          </div>

          <div className="bg-card border rounded-3xl p-6 space-y-6">
            <div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Manhã
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {["08:30", "09:00", "09:30", "10:00", "10:30", "11:30"].map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setHoraSelecionada(h);
                      proximoPasso();
                    }}
                    className={`py-3 rounded-xl border text-sm font-bold transition ${
                      horaSelecionada === h
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "hover:border-primary hover:bg-primary-soft"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Tarde / Noite
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "18:00"].map(
                  (h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setHoraSelecionada(h);
                        proximoPasso();
                      }}
                      className={`py-3 rounded-xl border text-sm font-bold transition ${
                        horaSelecionada === h
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "hover:border-primary hover:bg-primary-soft"
                      }`}
                    >
                      {h}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Passo 5: Motivo & Sintomas */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Selecione seus sintomas ou descreva o motivo da sua consulta médica:
          </div>

          <div className="bg-card border rounded-3xl p-6 space-y-5">
            <div>
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                Sintomas rápidos (opcional):
              </label>
              <div className="flex flex-wrap gap-2">
                {SINTOMAS_RAPIDOS.map((sintoma) => {
                  const active = sintomasEscolhidos.includes(sintoma);
                  return (
                    <button
                      key={sintoma}
                      type="button"
                      onClick={() => toggleSintoma(sintoma)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {active && <Check className="w-3 h-3 inline mr-1" />}
                      {sintoma}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                Descreva com suas palavras o que você está sentindo:
              </label>
              <textarea
                value={motivoTexto}
                onChange={(e) => setMotivoTexto(e.target.value)}
                placeholder="Exemplo: Estou com dor de cabeça forte há 3 dias acompanhada de cansaço e gostaria de renovar minha receita..."
                rows={4}
                className="w-full px-4 py-3 rounded-2xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <button
              onClick={proximoPasso}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              Continuar para Anexos <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Passo 6: Anexo de Exames */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Anexe fotos de exames anteriores ou receitas para o médico analisar antes ou durante a
            consulta:
          </div>

          <div className="bg-card border rounded-3xl p-6 space-y-4">
            <label className="border-2 border-dashed border-border hover:border-primary rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-muted/40 hover:bg-primary-soft/30">
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <div className="font-bold text-sm text-foreground">
                Clique para enviar arquivos ou fotos
              </div>
              <div className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG de até 25MB</div>
            </label>

            {arquivosAnexados.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Arquivos Anexados ({arquivosAnexados.length}):
                </div>
                {arquivosAnexados.map((arq, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-2xl bg-muted/70 border text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="truncate font-medium">{arq.nome}</div>
                      <span className="text-muted-foreground shrink-0">{arq.tamanhoKb} KB</span>
                    </div>
                    <button
                      onClick={() => removerArquivo(idx)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-card transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={proximoPasso}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              Avançar para Pagamento <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Passo 7: Pagamento */}
      {step === 6 && (
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
                <button
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
                  <div className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Aprovação Imediata em Segundos
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Abra o app do seu banco, escolha <strong>Pix Copia e Cola</strong> ou aponte a
                    câmera para o QR Code.
                  </p>
                </div>

                <div className="flex items-center gap-2 max-w-md mx-auto">
                  <input
                    readOnly
                    value="00020126580014br.gov.bcb.pix0136bion-telemedicina-pay-987655204000053039865802BR5925BION..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl border bg-muted font-mono"
                  />
                  <button
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
                <input
                  placeholder="Número do Cartão (0000 0000 0000 0000)"
                  value={cartaoNumero}
                  onChange={(e) => setCartaoNumero(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none"
                />
                <input
                  placeholder="Nome impresso no Cartão"
                  value={cartaoNome}
                  onChange={(e) => setCartaoNome(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Validade (MM/AA)"
                    value={cartaoValidade}
                    onChange={(e) => setCartaoValidade(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none"
                  />
                  <input
                    placeholder="CVV (3 dígitos)"
                    value={cartaoCVV}
                    onChange={(e) => setCartaoCVV(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none"
                  />
                </div>
                <select
                  value={cartaoParcelas}
                  onChange={(e) => setCartaoParcelas(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm bg-background outline-none"
                >
                  <option value="1">1x de R$ {medicoAtual.valor},00 (à vista)</option>
                  <option value="2">2x de R$ {(medicoAtual.valor / 2).toFixed(2)} sem juros</option>
                  <option value="3">3x de R$ {(medicoAtual.valor / 3).toFixed(2)} sem juros</option>
                </select>
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

            <button
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
      )}

      {/* Passo 8: Confirmação */}
      {step === 7 && (
        <div className="bg-card border rounded-3xl p-8 text-center space-y-6 shadow-sm">
          <div
            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg"
            style={{ backgroundColor: "var(--accent-soft)" }}
          >
            <Check className="w-10 h-10" style={{ color: "var(--accent)" }} />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
              Pagamento Aprovado com Sucesso
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight mt-1 text-foreground">
              Consulta Agendada!
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Sua teleconsulta com <strong>{medicoAtual.nome}</strong> está confirmada para{" "}
              <strong>
                {dataSelecionada} às {horaSelecionada}
              </strong>
              .
            </p>
          </div>

          <div className="max-w-md mx-auto p-5 rounded-2xl bg-muted/70 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Especialidade:</span>
              <span className="font-semibold">{medicoAtual.especialidade}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Código de Confirmação:</span>
              <span className="font-mono font-bold text-primary">
                BION-{Math.random().toString(36).substring(2, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exames anexados:</span>
              <span>{arquivosAnexados.length} arquivo(s)</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={onGoToWaitingRoom}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Ir para Sala de Espera <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onDone}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl border font-bold text-sm hover:bg-muted transition"
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Médico */}
      {medicoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setMedicoModal(null)}
        >
          <div
            className="bg-card border rounded-3xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
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
                <div className="flex items-center gap-2 mt-1 text-xs text-amber-500 font-bold">
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
              <button
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
        </div>
      )}
    </div>
  );
}
