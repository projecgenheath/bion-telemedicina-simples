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
/* Tipos públicos, formatação e constantes vazias vivem em bion-tipos.ts */
/* (divisão do monólito — item 8 da auditoria). Reexportados abaixo para */
/* que os imports existentes ("@/lib/bion-store") continuem funcionando. */
/* ==================================================================== */

import {
  ApptStatus,
  AnamneseResumo,
  Arquivo,
  AuditCategoria,
  AuditLog,
  AuditSeveridade,
  Avaliacao,
  Consentimento,
  Consulta,
  Documento,
  ExameLab,
  ItemExame,
  Lembrete,
  Medicao,
  Medico,
  Mensagem,
  Notificacao,
  NotifTipo,
  PacientePerfil,
  PacienteRegistro,
  Sessao,
  TicketSuporte,
  SESSAO_VAZIA,
  PERFIL_VAZIO,
  SUPORTE_VAZIO,
  fmtCurta,
  fmtDataBR,
  fmtHora,
  fmtLonga,
  fmtMensagem,
  fmtQuando,
  fmtTicketData,
  fmtValorBRL,
} from "./bion-tipos";

export type {
  ApptStatus,
  AnamneseResumo,
  Arquivo,
  AuditCategoria,
  AuditLog,
  AuditSeveridade,
  Avaliacao,
  Consentimento,
  Consulta,
  Documento,
  ExameLab,
  ItemExame,
  Lembrete,
  Medicao,
  Medico,
  Mensagem,
  Notificacao,
  NotifTipo,
  PacientePerfil,
  PacienteRegistro,
  Sessao,
  TicketSuporte,
} from "./bion-tipos";

export {
  fmtCurta,
  fmtDataBR,
  fmtHora,
  fmtLonga,
  fmtMensagem,
  fmtQuando,
  fmtTicketData,
  fmtValorBRL,
} from "./bion-tipos";

/* ==================================================================== */
/* Formas vindas da API (wire)                                          */
/* ==================================================================== */

type EstadoFresco = {
  usuario: {
    id: string; nome: string; email: string; role: "PACIENTE" | "MEDICO" | "ADMIN";
    precisaTrocarSenha?: boolean; // V4 — troca obrigatória (contas criadas pelo admin)
  };
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
 * afetada (POST /api/consultas, PATCH /api/notificacoes, POST /api/mensagens,
 * lembretes, medições, auditoria…). Qualquer campo ausente é simplesmente
 * ignorado; um payload com `usuario` é tratado como estado fresco completo
 * (contrato antigo, p/ compatibilidade).
 */
type DeltaWire = {
  consulta?: EstadoFresco["consultas"][number];
  anamnese?: NonNullable<EstadoFresco["anamneses"]>[number];
  mensagem?: EstadoFresco["mensagens"][number];
  mensagens?: EstadoFresco["mensagens"]; // recibos de leitura (PATCH /api/mensagens)
  notificacoes?: EstadoFresco["notificacoes"];
  audit?: EstadoFresco["auditLogs"][number];
  consultaCriada?: string;
  lembrete?: EstadoFresco["lembretes"][number];
  lembreteRemovido?: string;
  medicao?: NonNullable<EstadoFresco["medicoes"]>[number];
  perfilPaciente?: { peso?: string; altura?: string }; // sincronização peso/altura (POST /api/medicoes)
};

/* ==================================================================== */
/* Infra do store                                                       */
/* ==================================================================== */

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

type RespostaSenha = { ok: boolean; erro?: string };

type Store = {
  sessao: Sessao;
  autenticado: boolean;
  carregando: boolean;
  /** V4 — conta criada pela administração: troca de senha obrigatória. */
  precisaTrocarSenha: boolean;
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<RespostaSenha>;
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
  emitirDocumento: (d: Omit<Documento, "id" | "data">, pacienteIdExplicito?: string) => void;
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
  avaliarConsulta: (a: Omit<Avaliacao, "id" | "quando" | "ts">, medicoIdExplicito?: string) => void;
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
  anonimizarPaciente: (nome: string, pacienteIdExplicito?: string) => void;
  excluirDadosPaciente: (nome: string, pacienteIdExplicito?: string) => void;
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
  const [precisaTrocarSenha, setPrecisaTrocarSenha] = useState(false);

  const sessaoRef = useRef(sessao);
  const consultasRef = useRef(consultas);
  const medicosRef = useRef(medicos);
  const pacientesRef = useRef(pacientes);
  const lembretesRef = useRef(lembretes);
  /** Polling incremental: createdAt da mensagem mais recente já conhecida. */
  const ultimaMsgTsRef = useRef<string | null>(null);
  /** Single-flight do bootstrap (evita duas cargas completas em montagens rápidas). */
  const bootstrapEmAndamentoRef = useRef(false);

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
    setPrecisaTrocarSenha(!!d.usuario.precisaTrocarSenha);
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
    // Polling incremental: guarda o instante da mensagem mais recente
    const tsMaximo = d.mensagens.reduce((acc, m) => (m.createdAt > acc ? m.createdAt : acc), "");
    ultimaMsgTsRef.current = tsMaximo || null;
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

  /** Carrega sessão + bootstrap ao montar (single-flight: montagens rápidas
   *  ou re-montagens do provider não disparam duas cargas completas). */
  useEffect(() => {
    if (bootstrapEmAndamentoRef.current) return;
    bootstrapEmAndamentoRef.current = true;
    (async () => {
      const s = await api<{ autenticado: boolean; usuario?: { id: string; nome: string; email: string; role: string; precisaTrocarSenha?: boolean } }>(
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
      bootstrapEmAndamentoRef.current = false;
    })();
  }, [aplicar]);

  /** Mescla mensagens no estado (novas por id, atualizações de recibo de
   *  leitura) e avança o marcador do polling incremental. */
  const mesclarMensagens = useCallback((rows: Parameters<typeof fmtMensagem>[0][]) => {
    if (!rows.length) return;
    setMensagens((prev) => {
      const mapa = new Map(prev.map((m) => [m.id, m]));
      for (const m of rows) {
        mapa.set(m.id, { ...fmtMensagem(m), minha: m.deId === sessaoRef.current.id });
      }
      const arr = Array.from(mapa.values());
      arr.sort((a, b) => a.ts - b.ts);
      return arr;
    });
    const tsMaximo = rows.reduce((acc, m) => (m.createdAt > acc ? m.createdAt : acc), "");
    if (tsMaximo) {
      const atual = ultimaMsgTsRef.current;
      ultimaMsgTsRef.current = !atual || tsMaximo > atual ? tsMaximo : atual;
    }
  }, []);

  /** Polling de mensagens — INCREMENTAL: com ?desde= o servidor devolve apenas
   *  mensagens novas ou com recibo de leitura atualizado (payload mínimo a
   *  cada 4s em vez de recarregar a conversa inteira). Sem toast em falha. */
  const buscarMensagens = useCallback(async () => {
    try {
      const desde = ultimaMsgTsRef.current;
      const url = desde
        ? `/api/mensagens?desde=${encodeURIComponent(desde)}`
        : "/api/mensagens";
      const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
      if (!res.ok) return;
      const json = (await res.json()) as { mensagens?: Parameters<typeof fmtMensagem>[0][] } | null;
      if (json?.mensagens) {
        if (desde) {
          mesclarMensagens(json.mensagens);
        } else {
          // primeira varredura sem marcador — substitui (comportamento original)
          setMensagens(
            json.mensagens.map((m) => ({
              ...fmtMensagem(m),
              minha: m.deId === sessaoRef.current.id,
            })),
          );
        }
      }
    } catch {
      // polling silencioso: rede instável não deve alarmar o usuário
    }
  }, [mesclarMensagens]);

  /** Polling de novas mensagens (~4s) enquanto autenticado */
  useEffect(() => {
    if (!autenticado) return;
    const id = setInterval(() => void buscarMensagens(), 4000);
    return () => clearInterval(id);
  }, [autenticado, buscarMensagens]);

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
    setPrecisaTrocarSenha(false);
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
    ultimaMsgTsRef.current = null;
  }, []);

  /** V4 — troca de senha autenticada (contas criadas pela administração
   *  nascem com senha padrão; o app bloqueia até a troca). Ao concluir,
   *  o flag local cai e o app é liberado sem novo login. */
  const trocarSenha = useCallback(
    async (senhaAtual: string, novaSenha: string): Promise<RespostaSenha> => {
      try {
        const res = await fetch("/api/auth/senha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senhaAtual, novaSenha }),
        });
        const json = (await res.json().catch(() => null)) as { erro?: string } | null;
        if (!res.ok) {
          return { ok: false, erro: json?.erro ?? "Não foi possível alterar a senha." };
        }
        setPrecisaTrocarSenha(false);
        return { ok: true };
      } catch {
        return { ok: false, erro: "Falha de conexão com o servidor." };
      }
    },
    [],
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
        // mantém o marcador do polling incremental adiantado
        if (!ultimaMsgTsRef.current || delta.mensagem.createdAt > ultimaMsgTsRef.current) {
          ultimaMsgTsRef.current = delta.mensagem.createdAt;
        }
      }
      // Recibos de leitura (PATCH /api/mensagens) — atualiza "lida" por id
      if (delta.mensagens?.length) {
        const atualizadas = new Map(
          delta.mensagens.map((m) => [m.id, { ...fmtMensagem(m), minha: m.deId === sessaoRef.current.id }]),
        );
        setMensagens((prev) => prev.map((m) => atualizadas.get(m.id) ?? m));
      }
      // Lembretes (contrato delta — POST/PATCH/DELETE /api/lembretes)
      if (delta.lembrete) {
        const l = delta.lembrete;
        const mapeado: Lembrete = {
          id: l.id,
          titulo: l.titulo,
          horario: l.horario,
          tipo: l.tipo as Lembrete["tipo"],
          frequencia: l.frequencia,
          feito: l.feito,
          medicamento: l.medicamento ?? undefined,
        };
        setLembretes((prev) =>
          prev.some((x) => x.id === mapeado.id)
            ? prev.map((x) => (x.id === mapeado.id ? mapeado : x))
            : [...prev, mapeado],
        );
      }
      if (delta.lembreteRemovido) {
        const id = delta.lembreteRemovido;
        setLembretes((prev) => prev.filter((x) => x.id !== id));
      }
      // Medição (contrato delta — POST /api/medicoes)
      if (delta.medicao) {
        const m = delta.medicao;
        const mapeada: Medicao = {
          id: m.id,
          tipo: m.tipo as Medicao["tipo"],
          valor1: m.valor1,
          valor2: m.valor2,
          criadoEm: m.criadoEm,
          quando: fmtCurta(m.criadoEm),
        };
        setMedicoes((prev) => (prev.some((x) => x.id === mapeada.id) ? prev : [...prev, mapeada]));
      }
      // Peso/altura sincronizados no perfil pela medição
      if (delta.perfilPaciente) {
        const p = delta.perfilPaciente;
        setPacientePerfil((prev) => ({ ...prev, ...(p.peso ? { peso: p.peso } : {}), ...(p.altura ? { altura: p.altura } : {}) }));
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

  /**
   * Executa mutação na API e aplica a resposta ao store.
   * Contrato UNIFICADO (auditoria FASE 1): a resposta pode ser estado fresco
   * completo (tem `usuario` — carregarDados) OU delta (entidade única);
   * `aplicarDelta` decide. Qualquer OUTRA forma (ex.: {texto, etapa} da
   * triagem) é ignorada SEM quebrar o store — a mutação persistiu no
   * servidor e o estado local é recarregado pelo bootstrap/polling.
   */
  const mutar = useCallback(
    async (url: string, method: string, corpo?: unknown): Promise<boolean> => {
      const dados = await api<unknown>(url, {
        method,
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      if (!dados) return false;
      aplicarDelta(dados);
      return true;
    },
    [aplicarDelta],
  );

  /** Registra medição (peso/altura/PA) — devolve true se o servidor confirmou.
   *  Auditoria é gerada pelo servidor. Contrato delta: aplica a medição e o
   *  peso/altura sincronizados sem recarregar o estado inteiro. */
  const registrarMedicao = useCallback(
    async (tipo: "peso" | "altura" | "pa", valor1: number, valor2?: number) => {
      const d = await api<DeltaWire>("/api/medicoes", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          valor1,
          ...(valor2 !== undefined ? { valor2 } : {}),
        }),
      });
      if (!d) return false;
      aplicarDelta(d);
      return true;
    },
    [aplicarDelta],
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
   *  por isso apenas acao/detalhes são enviados. Contrato delta: devolve
   *  APENAS a linha criada (sem recarregar o app a cada exportação). */
  const registrarAudit = useCallback(
    async (log: Omit<AuditLog, "id" | "ts" | "usuario" | "role">) => {
      const d = await api<DeltaWire>("/api/auditoria", {
        method: "POST",
        body: JSON.stringify({
          acao: log.acao,
          detalhes: log.detalhes,
        }),
      });
      if (d) aplicarDelta(d);
    },
    [aplicarDelta],
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
    async (c: Omit<Consulta, "id" | "status" | "ts">) => {
      // Médico identificado por ID quando o chamador o tem (nunca por nome —
      // homônimos existem); a busca por nome fica só como último recurso.
      const medicoId = c.medicoId ?? medicosRef.current.find((m) => m.nome === c.medico)?.id;
      if (!medicoId) {
        toast.error("Médico não encontrado para o agendamento.");
        return;
      }
      // Status e pagamento são decididos PELO SERVIDOR: o pagamento confirma
      // a consulta (gateway simulado no ato; webhook real depois) e a triagem
      // (anamnese) fica disponível até 5 minutos antes do horário. Contrato
      // delta: devolve apenas a consulta criada + anamnese + pagamento + efeitos.
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

  /** Conclui a triagem (anamnese) e envia ao médico (servidor notifica médico + paciente). */
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
    (d: Omit<Documento, "id" | "data">, pacienteIdExplicito?: string) => {
      // Paciente identificado por ID (nunca por nome — homônimos existem):
      // 1º ID explícito do chamador, depois busca por nome (último recurso).
      const pacienteId =
        pacienteIdExplicito ??
        consultasRef.current.find((c) => c.paciente === d.paciente)?.pacienteId ??
        pacientesRef.current.find((p) => p.nome === d.paciente)?.id;
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
    (a: Omit<Avaliacao, "id" | "quando" | "ts">, medicoIdExplicito?: string) => {
      // Médico por ID explícito do chamador; nome só como último recurso.
      const medicoId = medicoIdExplicito ?? medicosRef.current.find((m) => m.nome === a.medico)?.id;
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
      void (async () => {
        const d = await api<DeltaWire>("/api/lembretes", {
          method: "POST",
          body: JSON.stringify({
            titulo: l.titulo,
            horario: l.horario,
            tipo: l.tipo,
            frequencia: l.frequencia,
            medicamento: l.medicamento,
          }),
        });
        if (d) aplicarDelta(d);
      })();
    },
    [aplicarDelta],
  );

  const alternarLembrete = useCallback(
    (id: string) => {
      const l = lembretesRef.current.find((x) => x.id === id);
      void (async () => {
        const d = await api<DeltaWire>(`/api/lembretes/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ feito: !(l?.feito ?? false) }),
        });
        if (d) aplicarDelta(d);
      })();
    },
    [aplicarDelta],
  );

  const removerLembrete = useCallback(
    (id: string) => {
      void (async () => {
        const d = await api<DeltaWire>(`/api/lembretes/${id}`, { method: "DELETE" });
        if (d) aplicarDelta(d);
      })();
    },
    [aplicarDelta],
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

  /** LGPD — operações IRREVERSÍVEIS: paciente SEMPRE por ID (nome só como
   *  último recurso quando o chamador não tem o id). */
  const anonimizarPaciente = useCallback(
    (nome: string, pacienteIdExplicito?: string) => {
      const id = pacienteIdExplicito ?? pacientesRef.current.find((p) => p.nome === nome)?.id;
      if (!id) {
        toast.error("Paciente não encontrado.");
        return;
      }
      void mutar("/api/admin/lgpd", "POST", { acao: "anonimizar", pacienteId: id });
    },
    [mutar],
  );

  const excluirDadosPaciente = useCallback(
    (nome: string, pacienteIdExplicito?: string) => {
      const id = pacienteIdExplicito ?? pacientesRef.current.find((p) => p.nome === nome)?.id;
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

  /** Contrato delta: PATCH /api/mensagens devolve APENAS as mensagens com
   *  recibo de leitura atualizado — a conversa aberta não recarrega o app. */
  const marcarConversaLida = useCallback(
    (comUsuarioId: string) => {
      void (async () => {
        const d = await api<DeltaWire>("/api/mensagens", {
          method: "PATCH",
          body: JSON.stringify({ comUsuarioId }),
        });
        if (d) aplicarDelta(d);
      })();
    },
    [aplicarDelta],
  );

  const value = useMemo<Store>(
    () => ({
      sessao,
      autenticado,
      carregando,
      precisaTrocarSenha,
      trocarSenha,
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
      sessao, autenticado, carregando, precisaTrocarSenha, trocarSenha, entrar, registrar, sair,
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
