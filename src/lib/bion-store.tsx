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

export type ApptStatus = "confirmada" | "cancelada" | "concluida" | "em_espera";

export type Consulta = {
  id: string;
  medico: string;
  especialidade: string;
  paciente: string;
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
  pacientePerfil: {
    nome: string; idade: number; genero: string; cpf: string; email: string; telefone: string;
    convenio: string; alergias: string[]; medicamentos: string[]; tipoSanguineo: string;
    peso?: string; altura?: string;
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
};

/* ==================================================================== */
/* Infra do store                                                       */
/* ==================================================================== */

const SESSAO_VAZIA: Sessao = { role: "paciente", nome: "", email: "" };

const PERFIL_VAZIO: PacientePerfil = {
  nome: "", idade: 0, genero: "", cpf: "", email: "", telefone: "", convenio: "Particular",
  alergias: [], medicamentos: [], tipoSanguineo: "",
};

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

type RespostaAuth = { ok: boolean };

type Store = {
  sessao: Sessao;
  autenticado: boolean;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<RespostaAuth>;
  registrar: (nome: string, email: string, senha: string) => Promise<RespostaAuth>;
  sair: () => Promise<void>;
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
      return { ok: true };
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
      return { ok: true };
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
    setPacientePerfil(PERFIL_VAZIO);
  }, []);

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

  const notificar = useCallback(
    (n: Omit<Notificacao, "id" | "hora" | "lida">) => {
      void mutar("/api/notificacoes", "POST", {
        tipo: n.tipo,
        titulo: n.titulo,
        texto: n.texto,
        para: n.para,
      });
    },
    [mutar],
  );

  const registrarAudit = useCallback(
    (log: Omit<AuditLog, "id" | "ts" | "usuario" | "role">) => {
      void mutar("/api/auditoria", "POST", log);
    },
    [mutar],
  );

  const marcarLida = useCallback(
    (id: string) => void mutar("/api/notificacoes", "PATCH", { id }),
    [mutar],
  );

  const marcarTodasLidas = useCallback(
    () => void mutar("/api/notificacoes", "PATCH", { todas: true }),
    [mutar],
  );

  const cancelarConsulta = useCallback(
    (id: string, motivo: string) => {
      const c = consultasRef.current.find((x) => x.id === id);
      void mutar(`/api/consultas/${id}`, "PATCH", {
        acao: "cancelar",
        motivo,
        notificacoes: [
          {
            tipo: "agenda",
            titulo: "Consulta cancelada",
            texto: `${c?.medico ?? "Consulta"} — ${c?.data ?? ""} às ${c?.hora ?? ""}. Motivo: ${motivo}`,
          },
        ],
        audit: {
          acao: "CONSULTA_CANCELADA",
          categoria: "consulta",
          severidade: "warning",
          detalhes: `Consulta com ${c?.medico ?? id} cancelada — Motivo: ${motivo}`,
        },
      });
    },
    [mutar],
  );

  const remarcarConsulta = useCallback(
    (id: string, data: string, hora: string) => {
      const c = consultasRef.current.find((x) => x.id === id);
      void mutar(`/api/consultas/${id}`, "PATCH", {
        acao: "remarcar",
        data,
        hora,
        notificacoes: [
          {
            tipo: "agenda",
            titulo: "Consulta remarcada",
            texto: `${c?.medico ?? "Consulta"} — novo horário: ${data} às ${hora}. A agenda foi atualizada.`,
          },
        ],
        audit: {
          acao: "CONSULTA_REMARCADA",
          categoria: "consulta",
          severidade: "warning",
          detalhes: `Consulta com ${c?.medico ?? id} remarcada para ${data} às ${hora}`,
        },
      });
    },
    [mutar],
  );

  const concluirConsulta = useCallback(
    (id: string, resumo?: string) => {
      const c = consultasRef.current.find((x) => x.id === id);
      void mutar(`/api/consultas/${id}`, "PATCH", {
        acao: "concluir",
        resumo,
        notificacoes: [
          {
            tipo: "agenda",
            titulo: "Consulta concluída",
            texto: `Atendimento com ${c?.medico ?? "o médico"} finalizado com sucesso. Acesse o resumo e documentos emitidos.`,
            para: "paciente",
          },
        ],
        audit: {
          acao: "CONSULTA_CONCLUIDA",
          categoria: "consulta",
          detalhes: `Consulta com ${c?.medico ?? id} concluída${resumo ? ` — Resumo: ${resumo.slice(0, 100)}` : ""}`,
        },
      });
    },
    [mutar],
  );

  const adicionarConsulta = useCallback(
    (c: Omit<Consulta, "id" | "status" | "ts">) => {
      const medicoId = medicosRef.current.find((m) => m.nome === c.medico)?.id;
      if (!medicoId) {
        toast.error("Médico não encontrado para o agendamento.");
        return;
      }
      void mutar("/api/consultas", "POST", {
        medicoId,
        data: c.data,
        hora: c.hora,
        motivoConsulta: c.motivoConsulta,
        valor: c.valor,
        pago: c.pago ?? true,
        audit: {
          acao: "CONSULTA_AGENDADA",
          categoria: "consulta",
          detalhes: `Agendamento com ${c.medico} — ${c.especialidade} em ${c.data} às ${c.hora}`,
        },
      });
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
        notificacoes: [
          {
            tipo: "exame",
            titulo: a.enviadoPor === "paciente" ? "Exame enviado" : "Novo arquivo do médico",
            texto: `${a.nome} adicionado ao histórico da consulta.`,
          },
        ],
        audit: {
          acao: "ARQUIVO_ENVIADO",
          categoria: "documento",
          detalhes: `${a.nome} (${a.tipo}, ${a.tamanhoKb}KB) enviado por ${a.enviadoPor}`,
        },
      });
    },
    [mutar],
  );

  const emitirDocumento = useCallback(
    (d: Omit<Documento, "id" | "data">) => {
      void mutar("/api/documentos", "POST", {
        tipo: d.tipo,
        titulo: d.titulo,
        conteudo: d.conteudo,
        paciente: d.paciente,
        medicamento: d.medicamento,
        posologia: d.posologia,
        duracao: d.duracao,
        observacoes: d.observacoes,
        cid: d.cid,
        notificacoes: [
          {
            tipo: "receita",
            titulo:
              d.tipo === "receita"
                ? "Receita digital disponível"
                : d.tipo === "atestado"
                  ? "Atestado emitido"
                  : "Solicitação de exames disponível",
            texto: `${d.titulo} emitido por ${d.medico}. Assinado digitalmente com padrão ICP-Brasil.`,
            para: "paciente",
          },
        ],
        audit: {
          acao: "DOCUMENTO_EMITIDO",
          categoria: "documento",
          detalhes: `${d.tipo === "receita" ? "Receita" : d.tipo === "atestado" ? "Atestado" : "Solicitação de exame"}: ${d.titulo} para ${d.paciente}`,
        },
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
        notificacoes: [
          {
            tipo: "agenda",
            titulo: "Avaliação enviada",
            texto: `Você avaliou ${a.medico} com ${a.nota} estrela(s). Obrigado pelo retorno!`,
            para: "paciente",
          },
          {
            tipo: "mensagem",
            titulo: "Nova avaliação recebida",
            texto: `${a.paciente} avaliou seu atendimento com ${a.nota} estrela(s).${a.comentario ? ` "${a.comentario}"` : ""}`,
            para: "medico",
          },
        ],
        audit: {
          acao: "AVALIACAO_REGISTRADA",
          categoria: "consulta",
          detalhes: `Avaliação ${a.nota} estrela(s) para ${a.medico}${a.comentario ? ` — "${a.comentario.slice(0, 80)}"` : ""}`,
        },
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
        paciente: c.paciente,
        notificacoes: [
          {
            tipo: "receita",
            titulo: registro.aceito ? "Consentimento registrado" : "Consentimento recusado",
            texto: registro.aceito
              ? `${registro.quem} autorizou a geração do prontuário em PDF (${registro.documentos} documento(s)).`
              : `${registro.quem} recusou o consentimento para gerar o prontuário em PDF.`,
          },
        ],
        audit: {
          acao: "CONSENTIMENTO_REGISTRADO",
          categoria: "consentimento",
          severidade: registro.aceito ? "info" : "warning",
          detalhes: `Consentimento ${registro.aceito ? "aceito" : "recusado"} para ${registro.finalidade} (${registro.documentos} documento(s))`,
        },
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
        notificacoes: [
          {
            tipo: "suporte",
            titulo: "Chamado aberto",
            texto: `Seu chamado "${t.assunto}" foi recebido por nossa equipe. Resposta em até 15 minutos.`,
            para: t.perfil,
          },
          {
            tipo: "suporte",
            titulo: "Novo chamado de suporte",
            texto: `${t.usuario} abriu chamado sobre: ${t.assunto}`,
            para: "admin",
          },
        ],
        audit: {
          acao: "TICKET_CRIADO",
          categoria: "suporte",
          detalhes: `Chamado "${t.assunto}" aberto por ${t.usuario} (${t.categoria})`,
        },
      });
    },
    [mutar],
  );

  const responderTicket = useCallback(
    (id: string, resposta: string) => {
      void mutar(`/api/tickets/${id}`, "PATCH", {
        resposta,
        audit: {
          acao: "TICKET_RESPONDIDO",
          categoria: "suporte",
          detalhes: `Chamado respondido pela equipe de suporte`,
        },
      });
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
        notificacoes: [
          {
            tipo: "lembrete",
            titulo: "Lembrete criado",
            texto: `${l.titulo} programado para ${l.horario} (${l.frequencia}).`,
            para: "paciente",
          },
        ],
        audit: {
          acao: "LEMBRETE_CRIADO",
          categoria: "sistema",
          detalhes: `Lembrete "${l.titulo}" — ${l.horario} (${l.frequencia})`,
        },
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
      void mutar("/api/perfil", "PATCH", {
        ...p,
        audit: {
          acao: "PERFIL_ATUALIZADO",
          categoria: "usuario",
          detalhes: `Dados atualizados: ${Object.keys(p).join(", ")}`,
        },
      });
    },
    [mutar],
  );

  const atualizarMedico = useCallback(
    (id: string, dados: Partial<Medico>) => {
      void mutar(`/api/medicos/${id}`, "PATCH", {
        acao: "atualizar",
        ...dados,
        audit: {
          acao: "MEDICO_ATUALIZADO",
          categoria: "admin",
          detalhes: `Dados atualizados: ${Object.keys(dados).join(", ")}`,
        },
      });
    },
    [mutar],
  );

  const aprovarMedico = useCallback(
    (id: string) => {
      void mutar(`/api/medicos/${id}`, "PATCH", {
        acao: "aprovar",
        notificacoes: [
          {
            tipo: "agenda",
            titulo: "CRM Médico Aprovado",
            texto: `O cadastro do médico foi validado e ativado para teleconsultas.`,
            para: "admin",
          },
        ],
      });
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
        audit: {
          acao: "PACIENTE_CRIADO",
          categoria: "admin",
          detalhes: `Paciente ${p.nome} cadastrado`,
        },
      });
    },
    [mutar],
  );

  const atualizarPaciente = useCallback(
    (id: string, dados: Partial<PacienteRegistro>) => {
      void mutar(`/api/pacientes/${id}`, "PATCH", {
        ...dados,
        audit: {
          acao: "PACIENTE_ATUALIZADO",
          categoria: "admin",
          detalhes: `Campos atualizados: ${Object.keys(dados).join(", ")}`,
        },
      });
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
        audit: {
          acao: "MEDICO_CRIADO",
          categoria: "admin",
          detalhes: `Médico ${m.nome} (${m.crm}) cadastrado`,
        },
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
      void mutar(`/api/consultas/${id}`, "PATCH", {
        acao: "atualizar",
        data: dados.data,
        hora: dados.hora,
        medico: dados.medico,
        especialidade: dados.especialidade,
        status: dados.status,
        pago: dados.pago,
        valor: dados.valor,
        audit: {
          acao: "CONSULTA_ATUALIZADA",
          categoria: "admin",
          detalhes: `Campos atualizados: ${Object.keys(dados).join(", ")}`,
        },
      });
    },
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
      auditLogs,
      registrarAudit,
      anonimizarPaciente,
      excluirDadosPaciente,
      pacientes,
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
      emitirDocumento, cancelarConsulta, remarcarConsulta, concluirConsulta,
      adicionarConsulta, adicionarArquivo, notificar, marcarLida, marcarTodasLidas,
      consentimentos, consentimentosVisiveis, registrarConsentimento, avaliacoes, avaliarConsulta,
      adicionarTicket, responderTicket, adicionarLembrete, alternarLembrete, removerLembrete,
      atualizarPacientePerfil, atualizarMedico, aprovarMedico, suspenderMedico,
      auditLogs, registrarAudit, anonimizarPaciente, excluirDadosPaciente,
      pacientes, adicionarPaciente, atualizarPaciente, excluirPaciente,
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
