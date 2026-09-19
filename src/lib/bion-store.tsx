"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

/* ==================================================================== */
/* Tipos públicos — mesmas formas usadas por todos os componentes BION  */
/* ==================================================================== */

export type ApptStatus = "confirmada" | "pendente_anamnese" | "cancelada" | "concluida" | "em_espera";

/** Anamnese guiada pela BION IA (resumo sincronizado com o servidor). */
export type AnamneseResumo = {
  id: string;
  consultaId: string;
  medico: string;
  especialidade: string;
  etapa: string;
  status: "em_andamento" | "concluida";
  coleta: Record<string, Record<string, unknown>>;
  documentos: { nome: string; tipo: string; exameImportado: boolean; resumo?: string }[];
  atualizadaEm: string;
  ts: number;
};

export type Consulta = {
  id: string;
  medico: string;
  especialidade: string;
  paciente: string;
  medicoId?: string; // ids do servidor — usados pela mensageria e contactos
  pacienteId?: string;
  data: string; // "Hoje" | "14 Dez"
  hora: string; // "14:30"
  status: ApptStatus;
  ts: number; // timestamp para filtros de período e contagem regressiva
  remarcada?: boolean;
  motivoCancelamento?: string;
  motivoConsulta?: string;
  valor?: string;
  pago?: boolean;
  resumoMedico?: string;
  dataISO?: string;
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

export type Mensagem = {
  id: string;
  deId: string;
  de: string;
  paraId: string;
  para: string;
  texto: string;
  lida: boolean;
  minha: boolean;
  quando: string; // "Hoje às 09:12" | "dd/mm/aaaa às hh:mm"
  ts: number;
};

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
  profissao?: string;
  estadoCivil?: string;
  comorbidades?: string[];
  foto?: string;
};

// Medição do paciente (peso | altura | pa) — app imersivo, seção 2
export type Medicao = {
  id: string;
  tipo: "peso" | "altura" | "pa";
  valor1: number;
  valor2?: number;
  criadoEm: string; // ISO
  quando: string; // rótulo curto ("12 Jan", "Hoje")
};

// Resultado de exame laboratorial lido pela BION IA ou cadastrado manualmente
export type ItemExame = {
  nome: string;
  valor: number;
  unidade?: string;
  refMin?: number;
  refMax?: number;
};

export type ExameLab = {
  id: string;
  titulo: string;
  dataColeta: string; // ISO
  itens: ItemExame[];
  arquivoNome?: string;
  origem: "bion-ia" | "manual";
  quando: string; // rótulo curto
};

export type Sessao = {
  id?: string;
  role: "paciente" | "medico" | "admin";
  nome: string;
  email?: string;
};

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

export type AuditCategoria =
  | "autenticacao"
  | "consulta"
  | "documento"
  | "prontuario"
  | "usuario"
  | "admin"
  | "suporte"
  | "consentimento"
  | "sistema";

export type AuditSeveridade = "info" | "warning" | "critical";

export type AuditLog = {
  id: string;
  ts: number;
  acao: string;
  categoria: AuditCategoria;
  severidade: AuditSeveridade;
  usuario: string;
  role: Sessao["role"];
  entidade?: string;
  entidadeId?: string;
  detalhes?: string;
};

export type PacienteRegistro = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  idade: number;
  genero: string;
  convenio: string;
  status: "ativo" | "inativo";
  desde: string;
};

/* ==================================================================== */
/* Formatação (client-side, a partir dos timestamps enviados pela API)  */
/* ==================================================================== */

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmtCurta = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, amanha)) return "Amanhã";
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const fmtLonga = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtQuando = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${fmtHora(iso)}`;
};

const fmtTicketData = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, hoje)) return `Hoje às ${fmtHora(iso)}`;
  if (mesmoDia(d, ontem)) return `Ontem às ${fmtHora(iso)}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} às ${fmtHora(iso)}`;
};

const fmtDataBR = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const fmtValorBRL = (v: number) =>
  Number.isInteger(v) ? `R$ ${v}` : `R$ ${v.toFixed(2).replace(".", ",")}`;

/* ==================================================================== */
/* Formas vindas da API (wire)                                          */
/* ==================================================================== */

type EstadoFresco = {
  usuario: { id: string; nome: string; email: string; role: "PACIENTE" | "MEDICO" | "ADMIN" };
  medicoes?: {
    id: string; tipo: string; valor1: number; valor2?: number; criadoEm: string;
  }[];
  exames?: {
    id: string; titulo: string; dataColeta: string;
    itens: { nome: string; valor: number; unidade?: string; refMin?: number; refMax?: number }[];
    arquivoNome?: string; origem: string; createdAt: string;
  }[];
  anamneses?: {
    id: string; consultaId: string; medico: string; especialidade: string;
    etapa: string; status: string; coleta: Record<string, Record<string, unknown>>;
    documentos: { nome: string; tipo: string; exameImportado: boolean; resumo?: string }[];
    updatedAt: string;
  }[];
  pacientePerfil: {
    nome: string; idade: number; genero: string; cpf: string; email: string; telefone: string;
    convenio: string; alergias: string[]; medicamentos: string[]; tipoSanguineo: string;
    peso?: string; altura?: string; profissao?: string; estadoCivil?: string;
    comorbidades?: string[]; foto?: string;
  } | null;
  consultas: {
    id: string; medicoId: string; medico: string; pacienteId: string; paciente: string;
    especialidade: string; dataInicio: string; status: string;
    motivoConsulta?: string; motivoCancelamento?: string; resumoMedico?: string;
    valor: number; pago: boolean; remarcada?: boolean;
  }[];
  documentos: {
    id: string; tipo: string; titulo: string; conteudo: string; medico: string; paciente: string;
    medicamento?: string | null; posologia?: string | null; duracao?: string | null;
    observacoes?: string | null; cid?: string | null; createdAt: string;
  }[];
  arquivos: {
    id: string; nome: string; tipo: string; tamanhoKb: number; enviadoPor: string;
    consulta: string; createdAt: string;
  }[];
  notificacoes: {
    id: string; paraRole?: string | null; tipo: string; titulo: string; texto: string;
    lida: boolean; createdAt: string;
  }[];
  medicos: {
    id: string; nome: string; crm: string; especialidade: string; subespecialidades: string[];
    valor: number; avaliacao: number; numAvaliacoes: number; formacao: string; experiencia: string;
    idiomas: string[]; bio: string; foto?: string; status: string; horariosDisponiveis: string[];
  }[];
  pacientes: {
    id: string; nome: string; email: string; telefone: string; cpf: string; idade: number;
    genero: string; convenio: string; status: string; desde: string;
  }[];
  tickets: {
    id: string; usuario: string; perfil: string; assunto: string; categoria: string; mensagem: string;
    status: string; resposta?: string; respondidoPor?: string; dataResposta?: string; createdAt: string;
  }[];
  lembretes: {
    id: string; titulo: string; horario: string; tipo: string; frequencia: string;
    feito: boolean; medicamento?: string | null;
  }[];
  avaliacoes: {
    id: string; paciente: string; medico: string; especialidade: string; nota: number;
    comentario?: string; pontualidade?: number; atencao?: number; clareza?: number; createdAt: string;
  }[];
  consentimentos: {
    id: string; paciente: string; quem: string; perfil: string; finalidade: string;
    documentos: number; aceito: boolean; createdAt: string;
  }[];
  auditLogs: {
    id: string; ts: number; acao: string; categoria: string; severidade: string;
    usuario: string; role: string; entidade?: string; entidadeId?: string; detalhes?: string;
  }[];
  mensagens: {
    id: string; deId: string; de: string; paraId: string; para: string;
    texto: string; lida: boolean; createdAt: string;
  }[];
  suporte: { id: string | null; nome: string };
};

/**
 * Delta de mutação — resposta leve das rotas que devolvem APENAS a entidade
 * afetada (POST /api/consultas, PATCH /api/notificacoes, POST /api/mensagens).
 * Qualquer campo ausente é simplesmente ignorado; um payload com `usuario`
 * é tratado como estado fresco completo (contrato antigo, p/ compatibilidade).
 */
type DeltaWire = {
  consulta?: EstadoFresco["consultas"][number];
  anamnese?: NonNullable<EstadoFresco["anamneses"]>[number];
  mensagem?: EstadoFresco["mensagens"][number];
  notificacoes?: EstadoFresco["notificacoes"];
  audit?: EstadoFresco["auditLogs"][number];
  consultaCriada?: string;
};

/* ==================================================================== */
/* Infra do store                                                       */
/* ==================================================================== */

const SESSAO_VAZIA: Sessao = { role: "paciente", nome: "", email: "" };

const PERFIL_VAZIO: PacientePerfil = {
  nome: "", idade: 0, genero: "", cpf: "", email: "", telefone: "", convenio: "Particular",
  alergias: [], medicamentos: [], tipoSanguineo: "",
};

const SUPORTE_VAZIO = { id: null as string | null, nome: "Suporte BION" };

const fmtMensagem = (m: {
  id: string; deId: string; de: string; paraId: string; para: string;
  texto: string; lida: boolean; createdAt: string;
}): Mensagem => ({
  id: m.id,
  deId: m.deId,
  de: m.de,
  paraId: m.paraId,
  para: m.para,
  texto: m.texto,
  lida: m.lida,
  minha: false, // preenchido pelo chamador (precisa do id da sessão)
  quando: fmtTicketData(m.createdAt),
  ts: new Date(m.createdAt).getTime(),
});

async function api<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json as { erro?: string } | null)?.erro ?? "Não foi possível concluir a operação.";
      toast.error(msg);
      return null;
    }
    return json as T;
  } catch {
    toast.error("Falha de conexão com o servidor.");
    return null;
  }
}

type RespostaAuth = { ok: boolean; role?: Sessao["role"] };

type Store = {
  sessao: Sessao;
  autenticado: boolean;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<RespostaAuth>;
  registrar: (nome: string, email: string, senha: string) => Promise<RespostaAuth>;
  sair: () => Promise<void>;
  medicoes: Medicao[];
  exames: ExameLab[];
  anamneses: AnamneseResumo[];
  registrarMedicao: (tipo: "peso" | "altura" | "pa", valor1: number, valor2?: number) => Promise<boolean>;
  aplicarEstadoFresco: (d: unknown) => boolean;
  /** Aplica delta de mutação (entidade única) vindo do servidor; compatível com estado fresco completo. */
  aplicarDelta: (d: unknown) => boolean;
  excluirExame: (id: string) => void;
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
  mensagens: Mensagem[];
  suporte: { id: string | null; nome: string };
  naoLidasMensagens: number;
  enviarMensagem: (paraId: string, texto: string) => void;
  marcarConversaLida: (comUsuarioId: string) => void;
  emitirDocumento: (d: Omit<Documento, "id" | "data">) => void;
  cancelarConsulta: (id: string, motivo: string) => void;
  remarcarConsulta: (id: string, data: string, hora: string) => void;
  concluirConsulta: (id: string, resumo?: string) => void;
  adicionarConsulta: (c: Omit<Consulta, "id" | "status" | "ts"> & { status?: "pendente_anamnese" }) => void;
  concluirAnamnese: (consultaId: string) => Promise<boolean>;
  registrarDocAnamnese: (consultaId: string, doc: { nome: string; tipo: string; exameImportado: boolean; resumo?: string }) => void;
  adicionarArquivo: (a: Omit<Arquivo, "id" | "data">) => void;
  marcarLida: (id: string) => void;
  marcarTodasLidas: () => void;
  avaliacoes: Avaliacao[];
  avaliarConsulta: (a: Omit<Avaliacao, "id" | "quando" | "ts">) => void;
  consentimentos: Consentimento[];
  consentimentosVisiveis: Consentimento[];
  registrarConsentimento: (
    c: Omit<Consentimento, "id" | "quando" | "quem" | "perfil">,
  ) => Consentimento;
  adicionarTicket: (t: Omit<TicketSuporte, "id" | "data" | "status">) => void;
  responderTicket: (id: string, resposta: string) => void;
  adicionarLembrete: (l: Omit<Lembrete, "id" | "feito">) => void;
  alternarLembrete: (id: string) => void;
  removerLembrete: (id: string) => void;
  atualizarPacientePerfil: (p: Partial<PacientePerfil>) => void;
  atualizarMedico: (id: string, dados: Partial<Medico>) => void;
  aprovarMedico: (id: string) => void;
  suspenderMedico: (id: string) => void;
  auditLogs: AuditLog[];
  registrarAudit: (log: Omit<AuditLog, "id" | "ts" | "usuario" | "role">) => void;
  anonimizarPaciente: (nome: string) => void;
  excluirDadosPaciente: (nome: string) => void;
  pacientes: PacienteRegistro[];
  adicionarPaciente: (p: Omit<PacienteRegistro, "id" | "desde">) => void;
  atualizarPaciente: (id: string, dados: Partial<PacienteRegistro>) => void;
  excluirPaciente: (id: string) => void;
  adicionarMedico: (m: Omit<Medico, "id" | "avaliacao" | "numAvaliacoes">) => void;
  excluirMedico: (id: string) => void;
  atualizarConsulta: (id: string, dados: Partial<Consulta>) => void;
};

const BionContext = createContext<Store | null>(null);

/* ==================================================================== */
/* Provider — dados vivem no banco (via API), não mais no localStorage  */
/* ==================================================================== */

export function BionProvider({ children }: { children: ReactNode }) {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<PacienteRegistro[]>([]);
  const [tickets, setTickets] = useState<TicketSuporte[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [pacientePerfil, setPacientePerfil] = useState<PacientePerfil>(PERFIL_VAZIO);
  const [sessao, setSessaoState] = useState<Sessao>(SESSAO_VAZIA);
  const [consentimentos, setConsentimentos] = useState<Consentimento[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [exames, setExames] = useState<ExameLab[]>([]);
  const [anamneses, setAnamneses] = useState<AnamneseResumo[]>([]);
  const [suporte, setSuporte] = useState<{ id: string | null; nome: string }>(SUPORTE_VAZIO);
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const sessaoRef = useRef(sessao);
  const consultasRef = useRef(consultas);
  const medicosRef = useRef(medicos);
  const pacientesRef = useRef(pacientes);
  const lembretesRef = useRef(lembretes);

  useEffect(() => {
    sessaoRef.current = sessao;
  }, [sessao]);
  useEffect(() => {
    consultasRef.current = consultas;
  }, [consultas]);
  useEffect(() => {
    medicosRef.current = medicos;
  }, [medicos]);
  useEffect(() => {
    pacientesRef.current = pacientes;
  }, [pacientes]);
  useEffect(() => {
    lembretesRef.current = lembretes;
  }, [lembretes]);

  /** Aplica o estado fresco vindo do servidor */
  const aplicar = useCallback((d: EstadoFresco | null) => {
    if (!d) return;
    setSessaoState({
      id: d.usuario.id,
      role: d.usuario.role.toLowerCase() as Sessao["role"],
      nome: d.usuario.nome,
      email: d.usuario.email,
    });
    setConsultas(
      d.consultas.map((c) => ({
        id: c.id,
        medico: c.medico,
        especialidade: c.especialidade,
        paciente: c.paciente,
        medicoId: c.medicoId,
        pacienteId: c.pacienteId,
        data: fmtCurta(c.dataInicio),
        hora: fmtHora(c.dataInicio),
        status: c.status as Consulta["status"],
        ts: new Date(c.dataInicio).getTime(),
        remarcada: c.remarcada,
        motivoCancelamento: c.motivoCancelamento,
        motivoConsulta: c.motivoConsulta,
        resumoMedico: c.resumoMedico,
        valor: fmtValorBRL(c.valor),
        pago: c.pago,
        dataISO: c.dataInicio,
      })),
    );
    setDocumentos(
      d.documentos.map((x) => ({
        id: x.id,
        tipo: x.tipo as Documento["tipo"],
        titulo: x.titulo,
        medico: x.medico,
        paciente: x.paciente,
        conteudo: x.conteudo,
        data: fmtLonga(x.createdAt),
        medicamento: x.medicamento ?? undefined,
        posologia: x.posologia ?? undefined,
        duracao: x.duracao ?? undefined,
        observacoes: x.observacoes ?? undefined,
        cid: x.cid ?? undefined,
      })),
    );
    setArquivos(
      d.arquivos.map((a) => ({
        id: a.id, nome: a.nome, tipo: a.tipo, tamanhoKb: a.tamanhoKb,
        enviadoPor: a.enviadoPor as Arquivo["enviadoPor"], data: fmtLonga(a.createdAt),
        consulta: a.consulta,
      })),
    );
    setNotificacoes(
      d.notificacoes.map((n) => ({
        id: n.id,
        para: (n.paraRole?.toLowerCase() || undefined) as Notificacao["para"],
        tipo: n.tipo as Notificacao["tipo"],
        titulo: n.titulo, texto: n.texto,
        hora: fmtTicketData(n.createdAt),
        lida: n.lida,
      })),
    );
    setMedicos(
      d.medicos.map((m) => ({
        id: m.id, nome: m.nome, crm: m.crm, especialidade: m.especialidade,
        subespecialidades: m.subespecialidades, valor: m.valor, avaliacao: m.avaliacao,
        numAvaliacoes: m.numAvaliacoes, formacao: m.formacao, experiencia: m.experiencia,
        idiomas: m.idiomas, bio: m.bio, foto: m.foto,
        status: m.status as Medico["status"], horariosDisponiveis: m.horariosDisponiveis,
      })),
    );
    setPacientes(
      d.pacientes.map((p) => ({
        id: p.id, nome: p.nome, email: p.email, telefone: p.telefone, cpf: p.cpf,
        idade: p.idade, genero: p.genero, convenio: p.convenio,
        status: p.status as PacienteRegistro["status"], desde: fmtDataBR(p.desde),
      })),
    );
    setTickets(
      d.tickets.map((t) => ({
        id: t.id, usuario: t.usuario, perfil: t.perfil as TicketSuporte["perfil"],
        assunto: t.assunto, categoria: t.categoria as TicketSuporte["categoria"],
        mensagem: t.mensagem, status: t.status as TicketSuporte["status"],
        data: fmtTicketData(t.createdAt), resposta: t.resposta,
        respondidoPor: t.respondidoPor, dataResposta: t.dataResposta ? fmtTicketData(t.dataResposta) : undefined,
      })),
    );
    setLembretes(
      d.lembretes.map((l) => ({
        id: l.id, titulo: l.titulo, horario: l.horario,
        tipo: l.tipo as Lembrete["tipo"], frequencia: l.frequencia, feito: l.feito,
        medicamento: l.medicamento ?? undefined,
      })),
    );
    setAvaliacoes(
      d.avaliacoes.map((a) => ({
        id: a.id, paciente: a.paciente, medico: a.medico, especialidade: a.especialidade,
        nota: a.nota, comentario: a.comentario, pontualidade: a.pontualidade,
        atencao: a.atencao, clareza: a.clareza, quando: fmtQuando(a.createdAt),
        ts: new Date(a.createdAt).getTime(),
      })),
    );
    setConsentimentos(
      d.consentimentos.map((c) => ({
        id: c.id, paciente: c.paciente, quem: c.quem,
        perfil: c.perfil as Sessao["role"], finalidade: c.finalidade,
        documentos: c.documentos, quando: fmtQuando(c.createdAt), aceito: c.aceito,
      })),
    );
    setAuditLogs(
      d.auditLogs.map((l) => ({
        id: l.id, ts: l.ts, acao: l.acao,
        categoria: l.categoria as AuditLog["categoria"],
        severidade: l.severidade as AuditLog["severidade"],
        usuario: l.usuario, role: l.role as Sessao["role"],
        entidade: l.entidade, entidadeId: l.entidadeId, detalhes: l.detalhes,
      })),
    );
    setMensagens(d.mensagens.map((m) => ({ ...fmtMensagem(m), minha: m.deId === d.usuario.id })));
    if (d.medicoes) {
      setMedicoes(
        d.medicoes.map((m) => ({
          id: m.id,
          tipo: m.tipo as Medicao["tipo"],
          valor1: m.valor1,
          valor2: m.valor2,
          criadoEm: m.criadoEm,
          quando: fmtCurta(m.criadoEm),
        })),
      );
    }
    if (d.exames) {
      setExames(
        d.exames.map((e) => ({
          id: e.id,
          titulo: e.titulo,
          dataColeta: e.dataColeta,
          itens: e.itens,
          arquivoNome: e.arquivoNome,
          origem: e.origem as ExameLab["origem"],
          quando: fmtCurta(e.dataColeta),
        })),
      );
    }
    if (d.anamneses) {
      setAnamneses(
        d.anamneses.map((a) => ({
          id: a.id,
          consultaId: a.consultaId,
          medico: a.medico,
          especialidade: a.especialidade,
          etapa: a.etapa,
          status: a.status as AnamneseResumo["status"],
          coleta: a.coleta,
          documentos: a.documentos,
          atualizadaEm: fmtTicketData(a.updatedAt),
          ts: new Date(a.updatedAt).getTime(),
        })),
      );
    }
    if (d.suporte.id) setSuporte(d.suporte);
    if (d.pacientePerfil) setPacientePerfil(d.pacientePerfil);
  }, []);

  /** Carrega sessão + bootstrap ao montar */
  useEffect(() => {
    (async () => {
      const s = await api<{ autenticado: boolean; usuario?: { id: string; nome: string; email: string; role: string } }>(
        "/api/auth/sessao",
      );
      if (s?.autenticado && s.usuario) {
        const dados = await api<EstadoFresco>("/api/bootstrap");
        if (dados) {
          aplicar(dados);
          setAutenticado(true);
        }
      }
      setCarregando(false);
    })();
  }, [aplicar]);

  /** Busca silenciosa de mensagens (polling) — sem toast em caso de falha */
  const buscarMensagens = useCallback(async () => {
    try {
      const res = await fetch("/api/mensagens", { headers: { "Content-Type": "application/json" } });
      if (!res.ok) return;
      const json = (await res.json()) as { mensagens?: Parameters<typeof fmtMensagem>[0][] } | null;
      if (json?.mensagens) {
        setMensagens(
          json.mensagens.map((m) => ({
            ...fmtMensagem(m),
            minha: m.deId === sessaoRef.current.id,
          })),
        );
      }
    } catch {
      // polling silencioso: rede instável não deve alarmar o usuário
    }
  }, []);

  /** Polling de novas mensagens (~4s) enquanto autenticado */
  useEffect(() => {
    if (!autenticado) return;
    const id = setInterval(() => void buscarMensagens(), 4000);
    return () => clearInterval(id);
  }, [autenticado, buscarMensagens]);

  /** Executa mutação na API e aplica o estado fresco retornado */
  const mutar = useCallback(
    async (url: string, method: string, corpo?: unknown): Promise<boolean> => {
      const dados = await api<EstadoFresco>(url, {
        method,
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      if (!dados) return false;
      aplicar(dados);
      return true;
    },
    [aplicar],
  );

  const entrar = useCallback(
    async (email: string, senha: string): Promise<RespostaAuth> => {
      const dados = await api<EstadoFresco>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      });
      if (!dados) return { ok: false };
      aplicar(dados);
      setAutenticado(true);
      return { ok: true, role: dados.usuario.role.toLowerCase() as Sessao["role"] };
    },
    [aplicar],
  );

  const registrar = useCallback(
    async (nome: string, email: string, senha: string): Promise<RespostaAuth> => {
      const dados = await api<EstadoFresco>("/api/auth/registro", {
        method: "POST",
        body: JSON.stringify({ nome, email, senha }),
      });
      if (!dados) return { ok: false };
      aplicar(dados);
      setAutenticado(true);
      return { ok: true, role: dados.usuario.role.toLowerCase() as Sessao["role"] };
    },
    [aplicar],
  );

  const sair = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // mesmo sem rede, encerra a sessão local
    }
    setAutenticado(false);
    setSessaoState(SESSAO_VAZIA);
    setConsultas([]);
    setArquivos([]);
    setNotificacoes([]);
    setDocumentos([]);
    setPacientes([]);
    setTickets([]);
    setLembretes([]);
    setConsentimentos([]);
    setAuditLogs([]);
    setAvaliacoes([]);
    setMensagens([]);
    setMedicoes([]);
    setExames([]);
    setAnamneses([]);
    setSuporte(SUPORTE_VAZIO);
    setPacientePerfil(PERFIL_VAZIO);
  }, []);

  /** Registra medição (peso/altura/PA) — devolve true se o servidor confirmou.
   *  Auditoria é gerada pelo servidor. */
  const registrarMedicao = useCallback(
    async (tipo: "peso" | "altura" | "pa", valor1: number, valor2?: number) => {
      const ok = await mutar("/api/medicoes", "POST", {
        tipo,
        valor1,
        ...(valor2 !== undefined ? { valor2 } : {}),
      });
      return ok;
    },
    [mutar],
  );

  /** Aplica um estado fresco externo (ex.: resposta do upload de laudo pela IA). */
  const aplicarEstadoFresco = useCallback(
    (d: unknown) => {
      if (!d || typeof d !== "object" || !("usuario" in (d as Record<string, unknown>))) return false;
      aplicar(d as EstadoFresco);
      return true;
    },
    [aplicar],
  );

  /**
   * Aplica um DELTA vindo do servidor (entidade única criada/atualizada).
   * Compatível com o contrato antigo: se o payload traz `usuario`, é estado
   * fresco completo e segue pelo caminho de sempre (`aplicar`).
   */
  const aplicarDelta = useCallback(
    (d: unknown): boolean => {
      if (!d || typeof d !== "object") return false;
      if ("usuario" in d) {
        return aplicarEstadoFresco(d);
      }
      const delta = d as DeltaWire;
      if (delta.consulta) {
        const c = delta.consulta;
        const mapeada: Consulta = {
          id: c.id,
          medico: c.medico,
          especialidade: c.especialidade,
          paciente: c.paciente,
          medicoId: c.medicoId,
          pacienteId: c.pacienteId,
          data: fmtCurta(c.dataInicio),
          hora: fmtHora(c.dataInicio),
          status: c.status as Consulta["status"],
          ts: new Date(c.dataInicio).getTime(),
          remarcada: c.remarcada,
          motivoCancelamento: c.motivoCancelamento,
          motivoConsulta: c.motivoConsulta,
          resumoMedico: c.resumoMedico,
          valor: fmtValorBRL(c.valor),
          pago: c.pago,
          dataISO: c.dataInicio,
        };
        setConsultas((prev) =>
          prev.some((x) => x.id === mapeada.id)
            ? prev.map((x) => (x.id === mapeada.id ? mapeada : x))
            : [...prev, mapeada],
        );
      }
      if (delta.anamnese) {
        const a = delta.anamnese;
        const mapeada: AnamneseResumo = {
          id: a.id,
          consultaId: a.consultaId,
          medico: a.medico,
          especialidade: a.especialidade,
          etapa: a.etapa,
          status: a.status as AnamneseResumo["status"],
          coleta: a.coleta,
          documentos: a.documentos,
          atualizadaEm: fmtTicketData(a.updatedAt),
          ts: new Date(a.updatedAt).getTime(),
        };
        setAnamneses((prev) =>
          prev.some((x) => x.id === mapeada.id)
            ? prev.map((x) => (x.id === mapeada.id ? mapeada : x))
            : [mapeada, ...prev],
        );
      }
      if (delta.mensagem) {
        const m = {
          ...fmtMensagem(delta.mensagem),
          minha: delta.mensagem.deId === sessaoRef.current.id,
        };
        setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
      if (delta.notificacoes?.length) {
        const lidas = new Set(delta.notificacoes.filter((n) => n.lida).map((n) => n.id));
        if (lidas.size) {
          setNotificacoes((prev) =>
            prev.map((n) => (lidas.has(n.id) ? { ...n, lida: true } : n)),
          );
        }
        // Notificações novas criadas pela própria mutação (ainda não no estado)
        const novas = delta.notificacoes.filter((n) => n.lida === false);
        if (novas.length) {
          setNotificacoes((prev) => {
            const ids = new Set(prev.map((n) => n.id));
            const adicionaveis = novas
              .filter((n) => !ids.has(n.id))
              .map((n) => ({
                id: n.id,
                para: (n.paraRole?.toLowerCase() || undefined) as Notificacao["para"],
                tipo: n.tipo as Notificacao["tipo"],
                titulo: n.titulo,
                texto: n.texto,
                hora: fmtTicketData(n.createdAt),
                lida: n.lida,
              }));
            return adicionaveis.length ? [...adicionaveis, ...prev] : prev;
          });
        }
      }
      if (delta.audit && sessaoRef.current.role === "admin") {
        const a = delta.audit;
        const entrada: AuditLog = {
          id: a.id,
          ts: a.ts,
          acao: a.acao,
          categoria: a.categoria as AuditLog["categoria"],
          severidade: a.severidade as AuditLog["severidade"],
          usuario: a.usuario,
          role: a.role as Sessao["role"],
          entidade: a.entidade,
          entidadeId: a.entidadeId,
          detalhes: a.detalhes,
        };
        setAuditLogs((prev) => [entrada, ...prev.filter((x) => x.id !== entrada.id)]);
      }
      return true;
    },
    [aplicarEstadoFresco],
  );

  const excluirExame = useCallback(
    (id: string) => void mutar("/api/exames", "DELETE", { id }),
    [mutar],
  );

  const documentosVisiveis = useMemo(() => {
    if (sessao.role === "paciente") return documentos.filter((d) => d.paciente === sessao.nome);
    if (sessao.role === "medico") {
      const pacientesVinculados = new Set(
        consultas.filter((c) => c.medico === sessao.nome).map((c) => c.paciente),
      );
      return documentos.filter(
        (d) => d.medico === sessao.nome || pacientesVinculados.has(d.paciente),
      );
    }
    return documentos;
  }, [documentos, consultas, sessao]);

  const notificacoesVisiveis = useMemo(
    () => notificacoes.filter((n) => !n.para || n.para === sessao.role),
    [notificacoes, sessao],
  );

  const consentimentosVisiveis = useMemo(() => {
    if (sessao.role === "admin") return consentimentos;
    if (sessao.role === "paciente") return consentimentos.filter((c) => c.paciente === sessao.nome);
    return consentimentos.filter((c) => c.quem === sessao.nome);
  }, [consentimentos, sessao]);

  /** Registro de eventos leves de interface (ex.: exportação de PDF).
   *  O servidor só aceita ações da whitelist e força categoria/severidade —
   *  por isso apenas acao/detalhes são enviados. */
  const registrarAudit = useCallback(
    (log: Omit<AuditLog, "id" | "ts" | "usuario" | "role">) => {
      void mutar("/api/auditoria", "POST", { acao: log.acao, detalhes: log.detalhes });
    },
    [mutar],
  );

  /** Contrato delta: PATCH /api/notificacoes devolve APENAS a(s) notificação(ões) marcada(s). */
  const marcarLida = useCallback(
    async (id: string) => {
      const d = await api<DeltaWire>("/api/notificacoes", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
      aplicarDelta(d);
    },
    [aplicarDelta],
  );

  const marcarTodasLidas = useCallback(
    async () => {
      const d = await api<DeltaWire>("/api/notificacoes", {
        method: "PATCH",
        body: JSON.stringify({ todas: true }),
      });
      aplicarDelta(d);
    },
    [aplicarDelta],
  );

  /** Contrato delta: PATCH /api/consultas/[id] devolve APENAS a consulta
   *  atualizada; notificações e auditoria são geradas pelo servidor. */
  const mutarConsultaDelta = useCallback(
    async (id: string, corpo: Record<string, unknown>) => {
      const d = await api<DeltaWire>(`/api/consultas/${id}`, {
        method: "PATCH",
        body: JSON.stringify(corpo),
      });
      aplicarDelta(d);
    },
    [aplicarDelta],
  );

  const cancelarConsulta = useCallback(
    (id: string, motivo: string) => {
      void mutarConsultaDelta(id, { acao: "cancelar", motivo });
    },
    [mutarConsultaDelta],
  );

  const remarcarConsulta = useCallback(
    (id: string, data: string, hora: string) => {
      void mutarConsultaDelta(id, { acao: "remarcar", data, hora });
    },
    [mutarConsultaDelta],
  );

  const concluirConsulta = useCallback(
    (id: string, resumo?: string) => {
      void mutarConsultaDelta(id, { acao: "concluir", resumo });
    },
    [mutarConsultaDelta],
  );

  const adicionarConsulta = useCallback(
    async (c: Omit<Consulta, "id" | "status" | "ts"> & { status?: "pendente_anamnese" }) => {
      const medicoId = medicosRef.current.find((m) => m.nome === c.medico)?.id;
      if (!medicoId) {
        toast.error("Médico não encontrado para o agendamento.");
        return;
      }
      // Status e pagamento são decididos PELO SERVIDOR (sempre pendente_anamnese;
      // confirmação de pagamento via gateway). Contrato delta: devolve apenas a
      // consulta criada + anamnese + pagamento + efeitos.
      const d = await api<DeltaWire>("/api/consultas", {
        method: "POST",
        body: JSON.stringify({
          medicoId,
          data: c.data,
          hora: c.hora,
          motivoConsulta: c.motivoConsulta,
          valor: c.valor,
        }),
      });
      aplicarDelta(d);
    },
    [aplicarDelta],
  );

  /** Conclui a anamnese e confirma a consulta (servidor notifica médico + paciente). */
  const concluirAnamnese = useCallback(
    async (consultaId: string) => {
      return mutar("/api/anamnese", "PATCH", { consultaId, acao: "concluir" });
    },
    [mutar],
  );

  /** Registra um documento anexado durante a anamnese. */
  const registrarDocAnamnese = useCallback(
    (consultaId: string, doc: { nome: string; tipo: string; exameImportado: boolean; resumo?: string }) => {
      void mutar("/api/anamnese", "PATCH", { consultaId, acao: "documento", documento: doc });
    },
    [mutar],
  );

  const adicionarArquivo = useCallback(
    (a: Omit<Arquivo, "id" | "data">) => {
      void mutar("/api/arquivos", "POST", {
        nome: a.nome,
        tipo: a.tipo,
        tamanhoKb: a.tamanhoKb,
        enviadoPor: a.enviadoPor,
        consulta: a.consulta,
      });
    },
    [mutar],
  );

  const emitirDocumento = useCallback(
    (d: Omit<Documento, "id" | "data">) => {
      // Paciente identificado por ID (nunca por nome — homônimos existem).
      const pacienteId =
        pacientesRef.current.find((p) => p.nome === d.paciente)?.id ??
        consultasRef.current.find((c) => c.paciente === d.paciente)?.pacienteId;
      if (!pacienteId) {
        toast.error("Paciente não encontrado para o documento.");
        return;
      }
      void mutar("/api/documentos", "POST", {
        tipo: d.tipo,
        titulo: d.titulo,
        conteudo: d.conteudo,
        pacienteId,
        medicamento: d.medicamento,
        posologia: d.posologia,
        duracao: d.duracao,
        observacoes: d.observacoes,
        cid: d.cid,
      });
    },
    [mutar],
  );

  const avaliarConsulta = useCallback(
    (a: Omit<Avaliacao, "id" | "quando" | "ts">) => {
      const medicoId = medicosRef.current.find((m) => m.nome === a.medico)?.id;
      if (!medicoId) {
        toast.error("Médico não encontrado para a avaliação.");
        return;
      }
      void mutar("/api/avaliacoes", "POST", {
        medicoId,
        nota: a.nota,
        comentario: a.comentario,
        pontualidade: a.pontualidade,
        atencao: a.atencao,
        clareza: a.clareza,
      });
    },
    [mutar],
  );

  const registrarConsentimento = useCallback(
    (c: Omit<Consentimento, "id" | "quando" | "quem" | "perfil">): Consentimento => {
      const registro: Consentimento = {
        ...c,
        id: `local-${Date.now()}`,
        quem: sessaoRef.current.nome,
        perfil: sessaoRef.current.role,
        quando: new Date().toLocaleString("pt-BR"),
      };
      void mutar("/api/consentimentos", "POST", {
        finalidade: c.finalidade,
        documentos: c.documentos,
        aceito: c.aceito,
        ...(c.paciente
          ? { pacienteId: pacientesRef.current.find((p) => p.nome === c.paciente)?.id }
          : {}),
      });
      return registro;
    },
    [mutar],
  );

  const adicionarTicket = useCallback(
    (t: Omit<TicketSuporte, "id" | "data" | "status">) => {
      void mutar("/api/tickets", "POST", {
        assunto: t.assunto,
        categoria: t.categoria,
        mensagem: t.mensagem,
      });
    },
    [mutar],
  );

  const responderTicket = useCallback(
    (id: string, resposta: string) => {
      void mutar(`/api/tickets/${id}`, "PATCH", { resposta });
    },
    [mutar],
  );

  const adicionarLembrete = useCallback(
    (l: Omit<Lembrete, "id" | "feito">) => {
      void mutar("/api/lembretes", "POST", {
        titulo: l.titulo,
        horario: l.horario,
        tipo: l.tipo,
        frequencia: l.frequencia,
        medicamento: l.medicamento,
      });
    },
    [mutar],
  );

  const alternarLembrete = useCallback(
    (id: string) => {
      const l = lembretesRef.current.find((x) => x.id === id);
      void mutar(`/api/lembretes/${id}`, "PATCH", { feito: !(l?.feito ?? false) });
    },
    [mutar],
  );

  const removerLembrete = useCallback(
    (id: string) => void mutar(`/api/lembretes/${id}`, "DELETE"),
    [mutar],
  );

  const atualizarPacientePerfil = useCallback(
    (p: Partial<PacientePerfil>) => {
      void mutar("/api/perfil", "PATCH", { ...p });
    },
    [mutar],
  );

  const atualizarMedico = useCallback(
    (id: string, dados: Partial<Medico>) => {
      void mutar(`/api/medicos/${id}`, "PATCH", {
        acao: "atualizar",
        ...dados,
      });
    },
    [mutar],
  );

  const aprovarMedico = useCallback(
    (id: string) => {
      void mutar(`/api/medicos/${id}`, "PATCH", { acao: "aprovar" });
    },
    [mutar],
  );

  const suspenderMedico = useCallback(
    (id: string) => void mutar(`/api/medicos/${id}`, "PATCH", { acao: "suspender" }),
    [mutar],
  );

  const anonimizarPaciente = useCallback(
    (nome: string) => {
      const id = pacientesRef.current.find((p) => p.nome === nome)?.id;
      if (!id) {
        toast.error("Paciente não encontrado.");
        return;
      }
      void mutar("/api/admin/lgpd", "POST", { acao: "anonimizar", pacienteId: id });
    },
    [mutar],
  );

  const excluirDadosPaciente = useCallback(
    (nome: string) => {
      const id = pacientesRef.current.find((p) => p.nome === nome)?.id;
      if (!id) {
        toast.error("Paciente não encontrado.");
        return;
      }
      void mutar("/api/admin/lgpd", "POST", { acao: "excluir", pacienteId: id });
    },
    [mutar],
  );

  const adicionarPaciente = useCallback(
    (p: Omit<PacienteRegistro, "id" | "desde">) => {
      void mutar("/api/pacientes", "POST", {
        nome: p.nome,
        email: p.email,
        telefone: p.telefone,
        cpf: p.cpf,
        idade: p.idade,
        genero: p.genero,
        convenio: p.convenio,
        status: p.status,
      });
    },
    [mutar],
  );

  const atualizarPaciente = useCallback(
    (id: string, dados: Partial<PacienteRegistro>) => {
      void mutar(`/api/pacientes/${id}`, "PATCH", { ...dados });
    },
    [mutar],
  );

  const excluirPaciente = useCallback(
    (id: string) => void mutar(`/api/pacientes/${id}`, "DELETE"),
    [mutar],
  );

  const adicionarMedico = useCallback(
    (m: Omit<Medico, "id" | "avaliacao" | "numAvaliacoes">) => {
      void mutar("/api/medicos", "POST", {
        nome: m.nome,
        crm: m.crm,
        especialidade: m.especialidade,
        subespecialidades: m.subespecialidades,
        valor: m.valor,
        formacao: m.formacao,
        experiencia: m.experiencia,
        idiomas: m.idiomas,
        bio: m.bio,
        horariosDisponiveis: m.horariosDisponiveis,
        status: m.status,
      });
    },
    [mutar],
  );

  const excluirMedico = useCallback(
    (id: string) => void mutar(`/api/medicos/${id}`, "DELETE"),
    [mutar],
  );

  const atualizarConsulta = useCallback(
    (id: string, dados: Partial<Consulta>) => {
      // Médico identificado por ID (nunca por nome — homônimos existem).
      const medicoId = dados.medico
        ? medicosRef.current.find((m) => m.nome === dados.medico)?.id
        : undefined;
      void mutarConsultaDelta(id, {
        acao: "atualizar",
        data: dados.data,
        hora: dados.hora,
        ...(medicoId ? { medicoId } : {}),
        especialidade: dados.especialidade,
        status: dados.status,
        pago: dados.pago,
        valor: dados.valor,
      });
    },
    [mutarConsultaDelta],
  );

  /** Contrato delta: POST /api/mensagens devolve APENAS a mensagem criada. */
  const enviarMensagem = useCallback(
    async (paraId: string, texto: string) => {
      const d = await api<DeltaWire>("/api/mensagens", {
        method: "POST",
        body: JSON.stringify({ paraId, texto }),
      });
      aplicarDelta(d);
    },
    [aplicarDelta],
  );

  const marcarConversaLida = useCallback(
    (comUsuarioId: string) => void mutar("/api/mensagens", "PATCH", { comUsuarioId }),
    [mutar],
  );

  const value = useMemo<Store>(
    () => ({
      sessao,
      autenticado,
      carregando,
      entrar,
      registrar,
      sair,
      consultas,
      arquivos,
      notificacoes,
      documentos,
      medicos,
      tickets,
      lembretes,
      pacientePerfil,
      documentosVisiveis,
      naoLidas: notificacoesVisiveis.filter((n) => !n.lida).length,
      notificacoesVisiveis,
      mensagens,
      suporte,
      naoLidasMensagens: mensagens.filter((m) => !m.minha && !m.lida).length,
      enviarMensagem,
      marcarConversaLida,
      emitirDocumento,
      cancelarConsulta,
      remarcarConsulta,
      concluirConsulta,
      adicionarConsulta,
      adicionarArquivo,
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
      auditLogs,
      registrarAudit,
      anonimizarPaciente,
      excluirDadosPaciente,
      pacientes,
      medicoes, exames, registrarMedicao, aplicarEstadoFresco, aplicarDelta, excluirExame,
      anamneses, concluirAnamnese, registrarDocAnamnese,
      adicionarPaciente,
      atualizarPaciente,
      excluirPaciente,
      adicionarMedico,
      excluirMedico,
      atualizarConsulta,
    }),
    [
      sessao, autenticado, carregando, entrar, registrar, sair,
      consultas, arquivos, notificacoes, notificacoesVisiveis, documentos, medicos,
      tickets, lembretes, pacientePerfil, documentosVisiveis,
      mensagens, suporte, enviarMensagem, marcarConversaLida,
      emitirDocumento, cancelarConsulta, remarcarConsulta, concluirConsulta,
      adicionarConsulta, adicionarArquivo, marcarLida, marcarTodasLidas,
      consentimentos, consentimentosVisiveis, registrarConsentimento, avaliacoes, avaliarConsulta,
      adicionarTicket, responderTicket, adicionarLembrete, alternarLembrete, removerLembrete,
      atualizarPacientePerfil, atualizarMedico, aprovarMedico, suspenderMedico,
      auditLogs, registrarAudit, anonimizarPaciente, excluirDadosPaciente,
      pacientes, medicoes, exames, registrarMedicao, aplicarEstadoFresco, aplicarDelta, excluirExame,
      anamneses, concluirAnamnese, registrarDocAnamnese,
      adicionarPaciente, atualizarPaciente, excluirPaciente,
      adicionarMedico, excluirMedico, atualizarConsulta,
    ],
  );

  return <BionContext.Provider value={value}>{children}</BionContext.Provider>;
}

export function useBion() {
  const ctx = useContext(BionContext);
  if (!ctx) throw new Error("useBion deve ser usado dentro de BionProvider");
  return ctx;
}
