/* ==================================================================== */
/* BION — tipos públicos e formatação (módulo puro, sem estado)          */
/*                                                                       */
/* Extraído de bion-store.tsx (item 8 da auditoria de hardening —        */
/* divisão do monólito). O store continua re-exportando tudo, então      */
/* os imports existentes (`@/lib/bion-store`) seguem funcionando.        */
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

export const fmtCurta = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, amanha)) return "Amanhã";
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};

export const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const fmtLonga = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

export const fmtQuando = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${fmtHora(iso)}`;
};

export const fmtTicketData = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, hoje)) return `Hoje às ${fmtHora(iso)}`;
  if (mesmoDia(d, ontem)) return `Ontem às ${fmtHora(iso)}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} às ${fmtHora(iso)}`;
};

export const fmtDataBR = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export const fmtValorBRL = (v: number) =>
  Number.isInteger(v) ? `R$ ${v}` : `R$ ${v.toFixed(2).replace(".", ",")}`;

/* ==================================================================== */
/* Constantes vazias e mapeadores compartilhados pelo store              */
/* ==================================================================== */

export const SESSAO_VAZIA: Sessao = { role: "paciente", nome: "", email: "" };

export const PERFIL_VAZIO: PacientePerfil = {
  nome: "", idade: 0, genero: "", cpf: "", email: "", telefone: "", convenio: "Particular",
  alergias: [], medicamentos: [], tipoSanguineo: "",
};

export const SUPORTE_VAZIO = { id: null as string | null, nome: "Suporte BION" };

export const fmtMensagem = (m: {
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
