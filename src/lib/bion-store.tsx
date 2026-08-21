import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ApptStatus = "confirmada" | "cancelada" | "concluida" | "em_espera";

export type Consulta = {
  id: string;
  medico: string;
  especialidade: string;
  paciente: string;
  data: string; // "Hoje" | "14 Dez"
  hora: string; // "14:30"
  status: ApptStatus;
  ts: number; // timestamp para filtros de período
  remarcada?: boolean;
  motivoCancelamento?: string;
  motivoConsulta?: string;
  valor?: string;
  pago?: boolean;
  resumoMedico?: string;
};

export type Arquivo = {
  id: string;
  nome: string;
  tipo: string;
  tamanhoKb: number;
  enviadoPor: "paciente" | "medico";
  data: string;
  consulta: string;
  url?: string;
};

export type Documento = {
  id: string;
  tipo: "receita" | "atestado" | "exame_solicitado";
  titulo: string;
  medico: string;
  paciente: string;
  conteudo: string;
  data: string;
  medicamento?: string;
  posologia?: string;
  duracao?: string;
  observacoes?: string;
  cid?: string;
};

export type NotifTipo = "lembrete" | "mensagem" | "receita" | "agenda" | "exame" | "suporte";

export type Notificacao = {
  id: string;
  /** perfil destinatário; ausente = todos */
  para?: Sessao["role"];
  tipo: NotifTipo;
  titulo: string;
  texto: string;
  hora: string;
  lida: boolean;
};

export type Medico = {
  id: string;
  nome: string;
  crm: string;
  especialidade: string;
  subespecialidades: string[];
  valor: number;
  avaliacao: number;
  numAvaliacoes: number;
  formacao: string;
  experiencia: string;
  idiomas: string[];
  bio: string;
  foto?: string;
  status: "ativo" | "pendente" | "suspenso";
  horariosDisponiveis: string[];
};

export type TicketSuporte = {
  id: string;
  usuario: string;
  perfil: "paciente" | "medico";
  assunto: string;
  categoria: "tecnico" | "pagamento" | "agendamento" | "outro";
  mensagem: string;
  data: string;
  status: "aberto" | "em_andamento" | "resolvido";
  resposta?: string;
  respondidoPor?: string;
  dataResposta?: string;
};

export type Lembrete = {
  id: string;
  titulo: string;
  horario: string;
  tipo: "Medicação" | "Consulta" | "Exame" | "Hidratação";
  frequencia: string;
  feito: boolean;
  medicamento?: string;
};

export type PacientePerfil = {
  nome: string;
  idade: number;
  genero: string;
  cpf: string;
  email: string;
  telefone: string;
  convenio: string;
  alergias: string[];
  medicamentos: string[];
  tipoSanguineo: string;
  peso?: string;
  altura?: string;
};

export type Sessao = { role: "paciente" | "medico" | "admin"; nome: string; email?: string };

export type Avaliacao = {
  id: string;
  paciente: string;
  medico: string;
  especialidade: string;
  nota: number; // 1-5
  comentario?: string;
  pontualidade?: number;
  atencao?: number;
  clareza?: number;
  quando: string;
  ts: number;
};

export type Consentimento = {
  id: string;
  paciente: string;
  quem: string;
  perfil: Sessao["role"];
  finalidade: string;
  documentos: number;
  quando: string;
  aceito: boolean;
};

let seq = 0;
const uid = () => `id-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

const agora = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const DIA = 86400000;
const diasAtras = (n: number) => Date.now() - n * DIA;

const medicosIniciais: Medico[] = [
  {
    id: "med-1",
    nome: "Dra. Ana Ribeiro",
    crm: "CRM 12345 SP",
    especialidade: "Clínica Geral",
    subespecialidades: ["Medicina Preventiva", "Check-up Geral", "Doenças Crônicas", "Hipertensão"],
    valor: 150,
    avaliacao: 4.9,
    numAvaliacoes: 312,
    formacao: "Graduação em Medicina pela USP (2012) • Residência em Clínica Médica pelo HC-FMUSP (2015)",
    experiencia: "12 anos de experiência em teleatendimento e gestão de pacientes crônicos.",
    idiomas: ["Português", "Inglês", "Espanhol"],
    bio: "Dedicada a um atendimento humanizado, empático e resolutivo. Acredito que a tecnologia deve aproximar médico e paciente.",
    status: "ativo",
    horariosDisponiveis: ["09:00", "10:00", "11:30", "14:30", "15:30", "16:30"],
  },
  {
    id: "med-2",
    nome: "Dr. Carlos Mendes",
    crm: "CRM 23456 RJ",
    especialidade: "Cardiologia",
    subespecialidades: ["Hipertensão", "Arritmias", "Prevenção Cardiovascular", "Acompanhamento Pós-Cirúrgico"],
    valor: 180,
    avaliacao: 4.8,
    numAvaliacoes: 198,
    formacao: "Graduação pela UFRJ (2010) • Especialização pelo Instituto Nacional de Cardiologia (INC)",
    experiencia: "Mais de 14 anos cuidando da saúde do coração de milhares de pacientes em todo o Brasil.",
    idiomas: ["Português", "Inglês"],
    bio: "Especialista em saúde cardiovascular preventiva e controle rigoroso de fatores de risco com acompanhamento próximo.",
    status: "ativo",
    horariosDisponiveis: ["08:30", "10:00", "14:00", "15:30", "17:00"],
  },
  {
    id: "med-3",
    nome: "Dra. Julia Lima",
    crm: "CRM 34567 MG",
    especialidade: "Dermatologia",
    subespecialidades: ["Acne e Rosácea", "Tricologia (Cabelos)", "Dermatologia Clínica", "Peles Sensíveis"],
    valor: 160,
    avaliacao: 5.0,
    numAvaliacoes: 245,
    formacao: "Medicina pela UFMG • Residência em Dermatologia pelo Hospital das Clínicas da UFMG",
    experiencia: "Dermatologista com foco em avaliação fotográfica digital e prescrições individualizadas.",
    idiomas: ["Português", "Francês", "Inglês"],
    bio: "A pele reflete nosso equilíbrio e bem-estar. Meu objetivo é descomplicar seu tratamento dermatológico.",
    status: "ativo",
    horariosDisponiveis: ["09:30", "11:00", "13:30", "15:00", "16:30"],
  },
  {
    id: "med-4",
    nome: "Dr. Roberto Campos",
    crm: "CRM 45678 RS",
    especialidade: "Pediatria",
    subespecialidades: ["Puericultura", "Desenvolvimento Infantil", "Alergias na Infância", "Nutrição Infantil"],
    valor: 160,
    avaliacao: 4.9,
    numAvaliacoes: 180,
    formacao: "Graduação pela UFRGS • Título de Especialista pela Sociedade Brasileira de Pediatria",
    experiencia: "10 anos acolhendo famílias e orientando pais em todas as fases de crescimento.",
    idiomas: ["Português", "Inglês"],
    bio: "Atendimento carinhoso e descomplicado para o bem-estar e saúde plena dos pequenos.",
    status: "ativo",
    horariosDisponiveis: ["08:00", "09:30", "11:00", "14:00", "16:00"],
  },
  {
    id: "med-5",
    nome: "Dra. Camila Torres",
    crm: "CRM 56789 PR",
    especialidade: "Psicologia",
    subespecialidades: ["Terapia Cognitivo-Comportamental", "Ansiedade e Estresse", "Autoconhecimento", "Burnout"],
    valor: 140,
    avaliacao: 4.9,
    numAvaliacoes: 320,
    formacao: "Psicologia pela UFPR • Especialista em Terapia Cognitivo-Comportamental",
    experiencia: "Ampla experiência em acolhimento psicológico online seguro e confidencial.",
    idiomas: ["Português", "Espanhol"],
    bio: "Espaço de escuta sem julgamentos para você lidar com ansiedade, rotina e emoções.",
    status: "ativo",
    horariosDisponiveis: ["08:00", "10:00", "13:00", "15:00", "17:00", "19:00"],
  },
  {
    id: "med-6",
    nome: "Dr. Felipe Rocha",
    crm: "CRM 67890 BA",
    especialidade: "Ortopedia",
    subespecialidades: ["Coluna e Postura", "Dor Crônica", "Ortopedia Esportiva", "Reabilitação"],
    valor: 170,
    avaliacao: 4.7,
    numAvaliacoes: 110,
    formacao: "Medicina pela UFBA • Membro da SBOT (Sociedade Brasileira de Ortopedia e Traumatologia)",
    experiencia: "Orientação diagnóstica precisa e indicação dos melhores caminhos de fisioterapia e reabilitação.",
    idiomas: ["Português"],
    bio: "Focado em alívio da dor, mobilidade e melhora duradoura da qualidade de vida.",
    status: "ativo",
    horariosDisponiveis: ["10:00", "11:30", "14:30", "16:00"],
  },
];

const consultasIniciais: Consulta[] = [
  {
    id: "c1",
    ts: diasAtras(0),
    medico: "Dra. Ana Ribeiro",
    especialidade: "Clínica Geral",
    paciente: "Marina Silva",
    data: "Hoje",
    hora: "14:30",
    status: "confirmada",
    motivoConsulta: "Revisão de exames e acompanhamento de rotina.",
    valor: "R$ 150",
    pago: true,
  },
  {
    id: "c2",
    ts: diasAtras(3),
    medico: "Dr. Carlos Mendes",
    especialidade: "Cardiologia",
    paciente: "Marina Silva",
    data: "12 Dez",
    hora: "15:30",
    status: "confirmada",
    motivoConsulta: "Avaliação de pressão arterial e check-up cardiológico.",
    valor: "R$ 180",
    pago: true,
  },
  {
    id: "c3",
    ts: diasAtras(0),
    medico: "Dra. Ana Ribeiro",
    especialidade: "Clínica Geral",
    paciente: "João Pereira",
    data: "Hoje",
    hora: "16:00",
    status: "confirmada",
    motivoConsulta: "Sintomas gripais e dor de cabeça há 2 dias.",
    valor: "R$ 150",
    pago: true,
  },
  {
    id: "c4",
    ts: diasAtras(45),
    medico: "Dra. Julia Lima",
    especialidade: "Dermatologia",
    paciente: "Marina Silva",
    data: "28 Out",
    hora: "10:00",
    status: "concluida",
    motivoConsulta: "Avaliação de lesão de pele e alergia de contato.",
    valor: "R$ 160",
    pago: true,
    resumoMedico: "Paciente compareceu com queixa de alergia de contato. Prescrito anti-histamínico e hidratação tópica.",
  },
];

const arquivosIniciais: Arquivo[] = [
  {
    id: "a1",
    nome: "hemograma-completo.pdf",
    tipo: "Exame laboratorial",
    tamanhoKb: 480,
    enviadoPor: "paciente",
    data: "08 Nov 2025",
    consulta: "Clínica Geral — Dra. Ana Ribeiro",
  },
  {
    id: "a2",
    nome: "receita-losartana.pdf",
    tipo: "Receita",
    tamanhoKb: 120,
    enviadoPor: "medico",
    data: "12 Nov 2025",
    consulta: "Clínica Geral — Dra. Ana Ribeiro",
  },
  {
    id: "a3",
    nome: "eletrocardiograma-laudo.pdf",
    tipo: "Exame cardiológico",
    tamanhoKb: 650,
    enviadoPor: "paciente",
    data: "20 Out 2025",
    consulta: "Cardiologia — Dr. Carlos Mendes",
  },
];

const documentosIniciais: Documento[] = [
  {
    id: "d1",
    tipo: "receita",
    titulo: "Receita — Losartana 50mg",
    medico: "Dra. Ana Ribeiro",
    paciente: "Marina Silva",
    conteudo: "Losartana 50mg — 1 comprimido ao dia, pela manhã, por 30 dias.",
    data: "12 Nov 2025",
    medicamento: "Losartana 50mg",
    posologia: "1 comprimido ao dia, pela manhã",
    duracao: "30 dias",
    observacoes: "Medir pressão arterial 2x por semana em repouso.",
  },
  {
    id: "d2",
    tipo: "atestado",
    titulo: "Atestado — 2 dias de afastamento",
    medico: "Dr. Carlos Mendes",
    paciente: "Marina Silva",
    conteudo: "Atesto, para os devidos fins, que a paciente necessita de afastamento de suas atividades por 2 (dois) dias a partir desta data para recuperação clínica.",
    data: "28 Out 2025",
    duracao: "2 dias",
    cid: "R51 (Cefaleia)",
    observacoes: "Paciente orientada a repouso e hidratação.",
  },
  {
    id: "d3",
    tipo: "receita",
    titulo: "Receita — Dipirona 500mg",
    medico: "Dra. Julia Lima",
    paciente: "João Pereira",
    conteudo: "Dipirona 500mg — 1 comprimido a cada 8 horas em caso de dor ou febre.",
    data: "05 Nov 2025",
    medicamento: "Dipirona 500mg",
    posologia: "1 comprimido a cada 8h",
    duracao: "5 dias",
  },
];

const notificacoesIniciais: Notificacao[] = [
  {
    id: "n1",
    tipo: "agenda",
    titulo: "Sua consulta é hoje!",
    texto: "Dra. Ana Ribeiro às 14:30. A sala de espera já está disponível para testes de câmera.",
    hora: "13:45",
    lida: false,
    para: "paciente",
  },
  {
    id: "n2",
    tipo: "lembrete",
    titulo: "Hora do medicamento",
    texto: "Losartana 50mg — tomar 1 comprimido com água.",
    hora: "08:00",
    lida: false,
    para: "paciente",
  },
  {
    id: "n3",
    tipo: "mensagem",
    titulo: "Mensagem da Dra. Ana Ribeiro",
    texto: "Seus exames de sangue estão ótimos, sem alterações importantes 🙂",
    hora: "Ontem",
    lida: true,
    para: "paciente",
  },
  {
    id: "n4",
    tipo: "receita",
    titulo: "Receita assinada disponível",
    texto: "Receita de Losartana 50mg pronta para download e compra na farmácia.",
    hora: "Ontem",
    lida: true,
    para: "paciente",
  },
  {
    id: "n5",
    tipo: "agenda",
    titulo: "Novo paciente agendado",
    texto: "Marina Silva agendou consulta de retorno para hoje às 14:30.",
    hora: "Ontem",
    lida: false,
    para: "medico",
  },
];

const ticketsIniciais: TicketSuporte[] = [
  {
    id: "tk-1",
    usuario: "Marina Silva",
    perfil: "paciente",
    assunto: "Dúvida sobre validação de receita digital na farmácia",
    categoria: "tecnico",
    mensagem: "Gostaria de saber se o QR Code do PDF é aceito em qualquer farmácia de São Paulo.",
    data: "Ontem às 16:30",
    status: "resolvido",
    resposta: "Sim, Marina! Todas as nossas receitas possuem assinatura digital com padrão ICP-Brasil e QR Code válido em farmácias físicas e online.",
    respondidoPor: "Suporte BION",
    dataResposta: "Ontem às 17:10",
  },
  {
    id: "tk-2",
    usuario: "Dra. Ana Ribeiro",
    perfil: "medico",
    assunto: "Solicitação de inclusão de nova subespecialidade",
    categoria: "outro",
    mensagem: "Gostaria de adicionar 'Medicina do Estilo de Vida' ao meu perfil de atendimento.",
    data: "Hoje às 09:15",
    status: "em_andamento",
  },
  {
    id: "tk-3",
    usuario: "João Pereira",
    perfil: "paciente",
    assunto: "Confirmação do pagamento Pix",
    categoria: "pagamento",
    mensagem: "Fiz o pagamento via Pix mas a tela demorou 1 minuto para atualizar. A consulta está confirmada?",
    data: "Hoje às 11:00",
    status: "resolvido",
    resposta: "Olá João! Verificamos aqui e seu Pix foi aprovado com sucesso. Sua consulta com a Dra. Ana Ribeiro está 100% confirmada para hoje às 16:00.",
    respondidoPor: "Suporte BION",
    dataResposta: "Hoje às 11:08",
  },
];

const lembretesIniciais: Lembrete[] = [
  {
    id: "lem-1",
    titulo: "Losartana 50mg",
    horario: "08:00",
    tipo: "Medicação",
    frequencia: "Todos os dias",
    feito: false,
    medicamento: "Losartana 50mg",
  },
  {
    id: "lem-2",
    titulo: "Medir Pressão Arterial",
    horario: "09:00",
    tipo: "Exame",
    frequencia: "Terças e Quintas",
    feito: true,
  },
  {
    id: "lem-3",
    titulo: "Beber 500ml de água",
    horario: "11:00",
    tipo: "Hidratação",
    frequencia: "A cada 2 horas",
    feito: true,
  },
  {
    id: "lem-4",
    titulo: "Consulta com Dra. Ana Ribeiro",
    horario: "14:30",
    tipo: "Consulta",
    frequencia: "Hoje",
    feito: false,
  },
];

const pacientePerfilInicial: PacientePerfil = {
  nome: "Marina Silva",
  idade: 32,
  genero: "Feminino",
  cpf: "123.456.789-00",
  email: "marina.silva@email.com",
  telefone: "(11) 98765-4321",
  convenio: "Particular",
  alergias: ["Dipirona", "Frutos do mar"],
  medicamentos: ["Losartana 50mg (1x/dia)", "Vitamina D 2.000 UI (semanal)"],
  tipoSanguineo: "O+",
  peso: "62 kg",
  altura: "1,68 m",
};

type Store = {
  sessao: Sessao;
  setSessao: (s: Sessao) => void;
  documentosVisiveis: Documento[];
  consultas: Consulta[];
  arquivos: Arquivo[];
  notificacoes: Notificacao[];
  documentos: Documento[];
  medicos: Medico[];
  tickets: TicketSuporte[];
  lembretes: Lembrete[];
  pacientePerfil: PacientePerfil;
  naoLidas: number;
  notificacoesVisiveis: Notificacao[];
  emitirDocumento: (d: Omit<Documento, "id" | "data">) => void;
  cancelarConsulta: (id: string, motivo: string) => void;
  remarcarConsulta: (id: string, data: string, hora: string) => void;
  concluirConsulta: (id: string, resumo?: string) => void;
  adicionarConsulta: (c: Omit<Consulta, "id" | "status" | "ts">) => void;
  adicionarArquivo: (a: Omit<Arquivo, "id" | "data">) => void;
  notificar: (n: Omit<Notificacao, "id" | "hora" | "lida">) => void;
  marcarLida: (id: string) => void;
  marcarTodasLidas: () => void;
  avaliacoes: Avaliacao[];
  avaliarConsulta: (a: Omit<Avaliacao, "id" | "quando" | "ts">) => void;
  consentimentos: Consentimento[];
  consentimentosVisiveis: Consentimento[];
  registrarConsentimento: (c: Omit<Consentimento, "id" | "quando" | "quem" | "perfil">) => Consentimento;
  adicionarTicket: (t: Omit<TicketSuporte, "id" | "data" | "status">) => void;
  responderTicket: (id: string, resposta: string) => void;
  adicionarLembrete: (l: Omit<Lembrete, "id" | "feito">) => void;
  alternarLembrete: (id: string) => void;
  removerLembrete: (id: string) => void;
  atualizarPacientePerfil: (p: Partial<PacientePerfil>) => void;
  atualizarMedico: (id: string, dados: Partial<Medico>) => void;
  aprovarMedico: (id: string) => void;
  suspenderMedico: (id: string) => void;
};

const BionContext = createContext<Store | null>(null);

export function BionProvider({ children }: { children: ReactNode }) {
  const [consultas, setConsultas] = useState<Consulta[]>(consultasIniciais);
  const [arquivos, setArquivos] = useState<Arquivo[]>(arquivosIniciais);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>(notificacoesIniciais);
  const [documentos, setDocumentos] = useState<Documento[]>(documentosIniciais);
  const [medicos, setMedicos] = useState<Medico[]>(medicosIniciais);
  const [tickets, setTickets] = useState<TicketSuporte[]>(ticketsIniciais);
  const [lembretes, setLembretes] = useState<Lembrete[]>(lembretesIniciais);
  const [pacientePerfil, setPacientePerfil] = useState<PacientePerfil>(pacientePerfilInicial);
  const [sessao, setSessao] = useState<Sessao>({ role: "paciente", nome: "Marina Silva", email: "marina.silva@email.com" });
  const [consentimentos, setConsentimentos] = useState<Consentimento[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([
    {
      id: "av1",
      paciente: "Marina Silva",
      medico: "Dra. Julia Lima",
      especialidade: "Dermatologia",
      nota: 5,
      comentario: "Atendimento maravilhoso! Muito atenciosa, explicou detalhadamente o tratamento da minha pele.",
      pontualidade: 5,
      atencao: 5,
      clareza: 5,
      quando: "28/10/2025 10:40",
      ts: diasAtras(45),
    },
    {
      id: "av2",
      paciente: "João Pereira",
      medico: "Dra. Ana Ribeiro",
      especialidade: "Clínica Geral",
      nota: 5,
      comentario: "Excelente médica. Pontual, prestativa e a receita digital funcionou de primeira na farmácia.",
      pontualidade: 5,
      atencao: 5,
      clareza: 5,
      quando: "05/11/2025 16:20",
      ts: diasAtras(20),
    },
    {
      id: "av3",
      paciente: "Beatriz Costa",
      medico: "Dr. Carlos Mendes",
      especialidade: "Cardiologia",
      nota: 5,
      comentario: "Ótimo cardiologista. Passou muita tranquilidade e orientações claras sobre exercícios e pressão.",
      pontualidade: 5,
      atencao: 5,
      clareza: 5,
      quando: "15/11/2025 14:15",
      ts: diasAtras(10),
    },
  ]);

  const hidratado = useRef(false);

  // Hidratação segura no client
  useEffect(() => {
    try {
      const salvo = localStorage.getItem("bion_data_v2");
      if (salvo) {
        const d = JSON.parse(salvo);
        if (Array.isArray(d.consultas)) setConsultas(d.consultas);
        if (Array.isArray(d.arquivos)) setArquivos(d.arquivos);
        if (Array.isArray(d.notificacoes)) setNotificacoes(d.notificacoes);
        if (Array.isArray(d.documentos)) setDocumentos(d.documentos);
        if (Array.isArray(d.medicos)) setMedicos(d.medicos);
        if (Array.isArray(d.tickets)) setTickets(d.tickets);
        if (Array.isArray(d.lembretes)) setLembretes(d.lembretes);
        if (d.pacientePerfil) setPacientePerfil(d.pacientePerfil);
        if (Array.isArray(d.consentimentos)) setConsentimentos(d.consentimentos);
        if (Array.isArray(d.avaliacoes)) setAvaliacoes(d.avaliacoes);
      }
    } catch {
      // fallback
    } finally {
      hidratado.current = true;
    }
  }, []);

  // Salva no localStorage após hidratação
  useEffect(() => {
    if (!hidratado.current) return;
    try {
      localStorage.setItem(
        "bion_data_v2",
        JSON.stringify({
          consultas,
          arquivos,
          notificacoes,
          documentos,
          medicos,
          tickets,
          lembretes,
          pacientePerfil,
          consentimentos,
          avaliacoes,
        }),
      );
    } catch {
      // fallback
    }
  }, [consultas, arquivos, notificacoes, documentos, medicos, tickets, lembretes, pacientePerfil, consentimentos, avaliacoes]);

  const notificar = useCallback((n: Omit<Notificacao, "id" | "hora" | "lida">) => {
    setNotificacoes((prev) => [{ ...n, id: uid(), hora: agora(), lida: false }, ...prev]);
  }, []);

  const cancelarConsulta = useCallback((id: string, motivo: string) => {
    setConsultas((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "cancelada" as const, motivoCancelamento: motivo } : c)),
    );
    setConsultas((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) {
        notificar({
          tipo: "agenda",
          titulo: "Consulta cancelada",
          texto: `${c.medico} — ${c.data} às ${c.hora}. Motivo: ${motivo}`,
        });
      }
      return prev;
    });
  }, [notificar]);

  const remarcarConsulta = useCallback((id: string, data: string, hora: string) => {
    setConsultas((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, data, hora, status: "confirmada" as const, remarcada: true } : c,
      ),
    );
    setConsultas((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) {
        notificar({
          tipo: "agenda",
          titulo: "Consulta remarcada",
          texto: `${c.medico} — novo horário: ${data} às ${hora}. A agenda foi atualizada.`,
        });
      }
      return prev;
    });
  }, [notificar]);

  const concluirConsulta = useCallback((id: string, resumo?: string) => {
    setConsultas((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: "concluida" as const, resumoMedico: resumo ?? c.resumoMedico } : c,
      ),
    );
    setConsultas((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) {
        notificar({
          tipo: "agenda",
          titulo: "Consulta concluída",
          texto: `Atendimento com ${c.medico} finalizado com sucesso. Acesse o resumo e documentos emitidos.`,
          para: "paciente",
        });
      }
      return prev;
    });
  }, [notificar]);

  const adicionarConsulta = useCallback((c: Omit<Consulta, "id" | "status" | "ts">) => {
    const novaConsulta: Consulta = {
      ...c,
      id: uid(),
      status: "confirmada",
      ts: Date.now(),
      pago: true,
    };
    setConsultas((prev) => [novaConsulta, ...prev]);
  }, []);

  const adicionarArquivo = useCallback((a: Omit<Arquivo, "id" | "data">) => {
    const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    setArquivos((prev) => [{ ...a, id: uid(), data }, ...prev]);
    notificar({
      tipo: "exame",
      titulo: a.enviadoPor === "paciente" ? "Exame enviado" : "Novo arquivo do médico",
      texto: `${a.nome} adicionado ao histórico da consulta.`,
    });
  }, [notificar]);

  const emitirDocumento = useCallback((d: Omit<Documento, "id" | "data">) => {
    const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const novoDoc: Documento = { ...d, id: uid(), data };
    setDocumentos((prev) => [novoDoc, ...prev]);
    notificar({
      tipo: "receita",
      titulo: d.tipo === "receita" ? "Receita digital disponível" : d.tipo === "atestado" ? "Atestado emitido" : "Solicitação de exames disponível",
      texto: `${d.titulo} emitido por ${d.medico}. Assinado digitalmente com padrão ICP-Brasil.`,
      para: "paciente",
    });
  }, [notificar]);

  const marcarLida = useCallback((id: string) => {
    setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  }, []);

  const marcarTodasLidas = useCallback(() => {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  }, []);

  const documentosVisiveis = useMemo(() => {
    if (sessao.role === "paciente") return documentos.filter((d) => d.paciente === sessao.nome);
    if (sessao.role === "medico") {
      const pacientesVinculados = new Set(
        consultas.filter((c) => c.medico === sessao.nome).map((c) => c.paciente),
      );
      return documentos.filter((d) => d.medico === sessao.nome || pacientesVinculados.has(d.paciente));
    }
    return documentos;
  }, [documentos, consultas, sessao]);

  const registrarConsentimento = useCallback(
    (c: Omit<Consentimento, "id" | "quando" | "quem" | "perfil">) => {
      const registro: Consentimento = {
        ...c,
        id: uid(),
        quem: sessao.nome,
        perfil: sessao.role,
        quando: new Date().toLocaleString("pt-BR"),
      };
      setConsentimentos((prev) => [registro, ...prev]);
      notificar({
        tipo: "receita",
        titulo: registro.aceito ? "Consentimento registrado" : "Consentimento recusado",
        texto: registro.aceito
          ? `${registro.quem} autorizou a geração do prontuário em PDF (${registro.documentos} documento(s)).`
          : `${registro.quem} recusou o consentimento para gerar o prontuário em PDF.`,
      });
      return registro;
    },
    [sessao, notificar],
  );

  const consentimentosVisiveis = useMemo(() => {
    if (sessao.role === "admin") return consentimentos;
    if (sessao.role === "paciente") return consentimentos.filter((c) => c.paciente === sessao.nome);
    return consentimentos.filter((c) => c.quem === sessao.nome);
  }, [consentimentos, sessao]);

  const avaliarConsulta = useCallback(
    (a: Omit<Avaliacao, "id" | "quando" | "ts">) => {
      const nova: Avaliacao = {
        ...a,
        id: uid(),
        quando: new Date().toLocaleString("pt-BR"),
        ts: Date.now(),
      };
      setAvaliacoes((prev) => [nova, ...prev]);

      // Atualiza nota do médico no cadastro
      setMedicos((prev) =>
        prev.map((m) => {
          if (m.nome === a.medico) {
            const novasNotas = [...avaliacoes.filter((x) => x.medico === a.medico), nova];
            const media = novasNotas.reduce((s, x) => s + x.nota, 0) / novasNotas.length;
            return { ...m, avaliacao: Number(media.toFixed(1)), numAvaliacoes: novasNotas.length };
          }
          return m;
        }),
      );

      notificar({
        tipo: "agenda",
        titulo: "Avaliação enviada",
        texto: `Você avaliou ${a.medico} com ${a.nota} estrela(s). Obrigado pelo retorno!`,
        para: "paciente",
      });

      notificar({
        tipo: "mensagem",
        titulo: "Nova avaliação recebida",
        texto: `${a.paciente} avaliou seu atendimento com ${a.nota} estrela(s).${a.comentario ? ` “${a.comentario}”` : ""}`,
        para: "medico",
      });
    },
    [avaliacoes, notificar],
  );

  const notificacoesVisiveis = useMemo(
    () => notificacoes.filter((n) => !n.para || n.para === sessao.role),
    [notificacoes, sessao],
  );

  const adicionarTicket = useCallback(
    (t: Omit<TicketSuporte, "id" | "data" | "status">) => {
      const novo: TicketSuporte = {
        ...t,
        id: `tk-${Date.now().toString().slice(-4)}`,
        data: "Hoje às " + agora(),
        status: "aberto",
      };
      setTickets((prev) => [novo, ...prev]);
      notificar({
        tipo: "suporte",
        titulo: "Chamado aberto",
        texto: `Seu chamado "${t.assunto}" foi recebido por nossa equipe. Resposta em até 15 minutos.`,
        para: t.perfil,
      });
      notificar({
        tipo: "suporte",
        titulo: "Novo chamado de suporte",
        texto: `${t.usuario} abriu chamado sobre: ${t.assunto}`,
        para: "admin",
      });
    },
    [notificar],
  );

  const responderTicket = useCallback(
    (id: string, resposta: string) => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "resolvido",
                resposta,
                respondidoPor: "Suporte BION",
                dataResposta: "Hoje às " + agora(),
              }
            : t,
        ),
      );
      setTickets((prev) => {
        const t = prev.find((x) => x.id === id);
        if (t) {
          notificar({
            tipo: "suporte",
            titulo: "Chamado respondido",
            texto: `Seu chamado "${t.assunto}" foi respondido pela equipe de suporte BION.`,
            para: t.perfil,
          });
        }
        return prev;
      });
    },
    [notificar],
  );

  const adicionarLembrete = useCallback(
    (l: Omit<Lembrete, "id" | "feito">) => {
      const novo: Lembrete = { ...l, id: uid(), feito: false };
      setLembretes((prev) => [novo, ...prev]);
      notificar({
        tipo: "lembrete",
        titulo: "Lembrete criado",
        texto: `${l.titulo} programado para ${l.horario} (${l.frequencia}).`,
        para: "paciente",
      });
    },
    [notificar],
  );

  const alternarLembrete = useCallback((id: string) => {
    setLembretes((prev) => prev.map((l) => (l.id === id ? { ...l, feito: !l.feito } : l)));
  }, []);

  const removerLembrete = useCallback((id: string) => {
    setLembretes((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const atualizarPacientePerfil = useCallback((p: Partial<PacientePerfil>) => {
    setPacientePerfil((prev) => ({ ...prev, ...p }));
  }, []);

  const atualizarMedico = useCallback((id: string, dados: Partial<Medico>) => {
    setMedicos((prev) => prev.map((m) => (m.id === id ? { ...m, ...dados } : m)));
  }, []);

  const aprovarMedico = useCallback(
    (id: string) => {
      setMedicos((prev) => prev.map((m) => (m.id === id ? { ...m, status: "ativo" } : m)));
      notificar({
        tipo: "agenda",
        titulo: "CRM Médico Aprovado",
        texto: `O cadastro do médico foi validado e ativado para teleconsultas.`,
        para: "admin",
      });
    },
    [notificar],
  );

  const suspenderMedico = useCallback(
    (id: string) => {
      setMedicos((prev) => prev.map((m) => (m.id === id ? { ...m, status: "suspenso" } : m)));
    },
    [],
  );

  const value = useMemo<Store>(
    () => ({
      consultas,
      arquivos,
      notificacoes,
      documentos,
      medicos,
      tickets,
      lembretes,
      pacientePerfil,
      sessao,
      setSessao,
      documentosVisiveis,
      naoLidas: notificacoesVisiveis.filter((n) => !n.lida).length,
      notificacoesVisiveis,
      emitirDocumento,
      cancelarConsulta,
      remarcarConsulta,
      concluirConsulta,
      adicionarConsulta,
      adicionarArquivo,
      notificar,
      marcarLida,
      marcarTodasLidas,
      consentimentos,
      consentimentosVisiveis,
      registrarConsentimento,
      avaliacoes,
      avaliarConsulta,
      adicionarTicket,
      responderTicket,
      adicionarLembrete,
      alternarLembrete,
      removerLembrete,
      atualizarPacientePerfil,
      atualizarMedico,
      aprovarMedico,
      suspenderMedico,
    }),
    [
      consultas,
      arquivos,
      notificacoes,
      notificacoesVisiveis,
      documentos,
      medicos,
      tickets,
      lembretes,
      pacientePerfil,
      sessao,
      documentosVisiveis,
      emitirDocumento,
      cancelarConsulta,
      remarcarConsulta,
      concluirConsulta,
      adicionarConsulta,
      adicionarArquivo,
      notificar,
      marcarLida,
      marcarTodasLidas,
      consentimentos,
      consentimentosVisiveis,
      registrarConsentimento,
      avaliacoes,
      avaliarConsulta,
      adicionarTicket,
      responderTicket,
      adicionarLembrete,
      alternarLembrete,
      removerLembrete,
      atualizarPacientePerfil,
      atualizarMedico,
      aprovarMedico,
      suspenderMedico,
    ],
  );

  return <BionContext.Provider value={value}>{children}</BionContext.Provider>;
}

export function useBion() {
  const ctx = useContext(BionContext);
  if (!ctx) throw new Error("useBion deve ser usado dentro de BionProvider");
  return ctx;
}
