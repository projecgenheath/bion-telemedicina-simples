import "server-only";
import { db } from "@/lib/db";
import type { UsuarioSessao } from "./auth";

/* ------------------------------------------------------------------ */
/* Utilitários de data (rótulos do cliente: "Hoje", "Amanhã", "12 Dez") */
/* ------------------------------------------------------------------ */

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/**
 * Converte rótulos de data usados pela interface + hora "HH:MM" em Date.
 * Aceita: "Hoje", "Amanhã", "12 Dez", "12 Dez 2026", "2025-12-18", "18/12/2025".
 */
export function parseDataHora(data: string, hora: string): Date {
  const d = new Date();
  d.setSeconds(0, 0);

  const [hh, mm] = (hora || "09:00").split(":").map((n) => parseInt(n, 10));
  d.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0);

  const rotulo = (data || "").trim();
  const lower = rotulo.toLowerCase();

  if (lower === "hoje") {
    // mantém a data de hoje
  } else if (lower === "amanhã" || lower === "amanha") {
    d.setDate(d.getDate() + 1);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(rotulo)) {
    const [y, m, dd] = rotulo.split("-").map((n) => parseInt(n, 10));
    d.setFullYear(y, m - 1, dd);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rotulo)) {
    const [dd, m, y] = rotulo.split("/").map((n) => parseInt(n, 10));
    d.setFullYear(y, m - 1, dd);
  } else {
    // "12 Dez" ou "12 Dez 2026"
    const partes = rotulo.split(/\s+/);
    if (partes.length >= 2) {
      const dia = parseInt(partes[0], 10);
      const mesIdx = MESES.findIndex((m) => m.toLowerCase() === partes[1]?.toLowerCase());
      if (Number.isFinite(dia) && mesIdx >= 0) {
        let ano = d.getFullYear();
        if (partes[2] && /^\d{4}$/.test(partes[2])) {
          ano = parseInt(partes[2], 10);
        } else {
          // se a data ficaria muito no passado, assume próximo ano
          const tentativa = new Date(ano, mesIdx, dia, d.getHours(), d.getMinutes());
          if (tentativa.getTime() < Date.now() - 7 * 86400000) ano += 1;
        }
        d.setFullYear(ano, mesIdx, dia);
      }
    }
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Resolução de relacionamentos                                        */
/* ------------------------------------------------------------------ */

export async function medicoIdPorNome(nome: string): Promise<string | null> {
  const u = await db.user.findFirst({ where: { nome, role: "MEDICO" } });
  return u?.id ?? null;
}

export async function pacienteIdPorNome(nome: string): Promise<string | null> {
  const u = await db.user.findFirst({ where: { nome, role: "PACIENTE" } });
  return u?.id ?? null;
}

/** "R$ 150" | "150" | 150 → 150 (reais, float) */
export function parseValor(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const limpo = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

export function slugEmail(nome: string, dominio: string): string {
  const slug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug || "usuario"}@${dominio}`;
}

/* ------------------------------------------------------------------ */
/* Carregamento filtrado por papel (bootstrap / estado fresco)         */
/* ------------------------------------------------------------------ */

async function idsPacientesDoMedico(medicoId: string): Promise<string[]> {
  const rows = await db.consulta.findMany({
    where: { medicoId },
    select: { pacienteId: true },
    distinct: ["pacienteId"],
  });
  return rows.map((r) => r.pacienteId);
}

async function idsMedicosDoPaciente(pacienteId: string): Promise<string[]> {
  const rows = await db.consulta.findMany({
    where: { pacienteId },
    select: { medicoId: true },
    distinct: ["medicoId"],
  });
  return rows.map((r) => r.medicoId);
}

/**
 * Carrega todo o estado visível para o usuário, conforme o papel.
 * É o payload do bootstrap e também a resposta "fresca" de toda mutação.
 */
export async function carregarDados(usuario: UsuarioSessao) {
  const souAdmin = usuario.role === "ADMIN";
  const souMedico = usuario.role === "MEDICO";
  const souPaciente = usuario.role === "PACIENTE";

  const consultaWhere = souPaciente
    ? { pacienteId: usuario.id }
    : souMedico
      ? { medicoId: usuario.id }
      : {};

  const [consultasRaw, medicosRaw, pacientesRaw] = await Promise.all([
    db.consulta.findMany({
      where: consultaWhere,
      include: {
        medico: { select: { nome: true } },
        paciente: { select: { nome: true } },
      },
      orderBy: { dataInicio: "asc" },
    }),
    db.perfilMedico.findMany({ include: { user: { select: { id: true, nome: true } } } }),
    db.user.findMany({
      where: { role: "PACIENTE" },
      include: { perfilPaciente: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Visibilidade de documentos (espelha a lógica original do app)
  let documentoWhere: Record<string, unknown> = {};
  if (souPaciente) documentoWhere = { pacienteId: usuario.id };
  if (souMedico) {
    const ids = await idsPacientesDoMedico(usuario.id);
    documentoWhere = { OR: [{ medicoId: usuario.id }, { pacienteId: { in: ids } }] };
  }
  const documentos = await db.documento.findMany({
    where: documentoWhere,
    include: {
      medico: { select: { nome: true } },
      paciente: { select: { nome: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Visibilidade de arquivos: próprios + trocados com médicos/pacientes vinculados
  let arquivoWhere: Record<string, unknown> = {};
  if (souPaciente) {
    const idsMed = await idsMedicosDoPaciente(usuario.id);
    arquivoWhere = { OR: [{ usuarioId: usuario.id }, { usuarioId: { in: idsMed } }] };
  } else if (souMedico) {
    const idsPac = await idsPacientesDoMedico(usuario.id);
    arquivoWhere = { OR: [{ usuarioId: usuario.id }, { usuarioId: { in: idsPac } }] };
  }
  const arquivos = await db.arquivo.findMany({ where: arquivoWhere, orderBy: { createdAt: "desc" } });

  const notificacoes = await db.notificacao.findMany({
    where: {
      OR: [{ usuarioId: usuario.id }, { paraRole: usuario.role }, { AND: [{ usuarioId: null }, { paraRole: null }] }],
    },
    orderBy: { createdAt: "desc" },
  });

  const avaliacaoWhere = souPaciente
    ? { pacienteId: usuario.id }
    : souMedico
      ? { medicoId: usuario.id }
      : {};
  const avaliacoesRaw = await db.avaliacao.findMany({
    where: avaliacaoWhere,
    include: {
      paciente: { select: { nome: true } },
      medico: { select: { nome: true, perfilMedico: { select: { especialidade: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const tickets = await db.ticket.findMany({
    where: souAdmin ? {} : { usuarioId: usuario.id },
    include: { usuario: { select: { nome: true } } },
    orderBy: { createdAt: "desc" },
  });

  const lembretes = await db.lembrete.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { horario: "asc" },
  });

  const consentimentoWhere = souAdmin
    ? {}
    : souPaciente
      ? { OR: [{ pacienteId: usuario.id }, { quem: usuario.nome }] }
      : { quem: usuario.nome };
  const consentimentos = await db.consentimento.findMany({
    where: consentimentoWhere,
    include: { paciente: { select: { nome: true } } },
    orderBy: { createdAt: "desc" },
  });

  const auditLogs = souAdmin
    ? await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 })
    : [];

  // Mensageria assíncrona: tudo que o usuário enviou ou recebeu
  const mensagensRaw = await db.mensagem.findMany({
    where: { OR: [{ deId: usuario.id }, { paraId: usuario.id }] },
    include: {
      de: { select: { nome: true } },
      para: { select: { nome: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Usuário de suporte (ADMIN) — contato "Suporte BION" nas conversas
  const suporte = await db.user.findFirst({
    where: { role: "ADMIN", status: "ativo" },
    select: { id: true, nome: true },
  });

  // Pacientes "visíveis": admin vê todos; médico vê vinculados por consultas
  let pacientesVisiveis = pacientesRaw;
  if (souMedico) {
    const ids = await idsPacientesDoMedico(usuario.id);
    pacientesVisiveis = pacientesRaw.filter((p) => ids.includes(p.id));
  } else if (souPaciente) {
    pacientesVisiveis = [];
  }

  const perfilPacienteRaw = souPaciente
    ? await db.perfilPaciente.findUnique({ where: { userId: usuario.id }, include: { user: { select: { nome: true, email: true } } } })
    : null;

  return {
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
    pacientePerfil: perfilPacienteRaw
      ? {
          nome: perfilPacienteRaw.user.nome,
          idade: perfilPacienteRaw.idade,
          genero: perfilPacienteRaw.genero,
          cpf: perfilPacienteRaw.cpf,
          email: perfilPacienteRaw.user.email,
          telefone: perfilPacienteRaw.telefone,
          convenio: perfilPacienteRaw.convenio,
          alergias: JSON.parse(perfilPacienteRaw.alergias || "[]") as string[],
          medicamentos: JSON.parse(perfilPacienteRaw.medicamentos || "[]") as string[],
          tipoSanguineo: perfilPacienteRaw.tipoSanguineo,
          peso: perfilPacienteRaw.peso ?? undefined,
          altura: perfilPacienteRaw.altura ?? undefined,
        }
      : null,
    consultas: consultasRaw.map((c) => ({
      id: c.id,
      medicoId: c.medicoId,
      medico: c.medico.nome,
      pacienteId: c.pacienteId,
      paciente: c.paciente.nome,
      especialidade: c.especialidade,
      dataInicio: c.dataInicio.toISOString(),
      status: c.status,
      motivoConsulta: c.motivoConsulta ?? undefined,
      motivoCancelamento: c.motivoCancelamento ?? undefined,
      resumoMedico: c.resumoMedico ?? undefined,
      valor: c.valor,
      pago: c.pago,
      remarcada: c.remarcada || undefined,
    })),
    documentos: documentos.map((doc) => ({
      id: doc.id,
      tipo: doc.tipo,
      titulo: doc.titulo,
      conteudo: doc.conteudo,
      medico: doc.medico.nome,
      paciente: doc.paciente.nome,
      medicamento: doc.medicamento,
      posologia: doc.posologia,
      duracao: doc.duracao,
      observacoes: doc.observacoes,
      cid: doc.cid,
      createdAt: doc.createdAt.toISOString(),
    })),
    arquivos,
    notificacoes,
    medicos: medicosRaw.map((m) => ({
      id: m.userId,
      nome: m.user.nome,
      crm: m.crm,
      especialidade: m.especialidade,
      subespecialidades: JSON.parse(m.subespecialidades || "[]") as string[],
      valor: m.valor,
      avaliacao: m.avaliacao,
      numAvaliacoes: m.numAvaliacoes,
      formacao: m.formacao,
      experiencia: m.experiencia,
      idiomas: JSON.parse(m.idiomas || "[]") as string[],
      bio: m.bio,
      foto: m.foto ?? undefined,
      status: m.status,
      horariosDisponiveis: JSON.parse(m.horariosDisponiveis || "[]") as string[],
    })),
    pacientes: pacientesVisiveis.map((p) => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      telefone: p.perfilPaciente?.telefone ?? "",
      cpf: p.perfilPaciente?.cpf ?? "",
      idade: p.perfilPaciente?.idade ?? 0,
      genero: p.perfilPaciente?.genero ?? "",
      convenio: p.perfilPaciente?.convenio ?? "Particular",
      status: p.status as "ativo" | "inativo",
      desde: p.createdAt.toISOString(),
    })),
    tickets: tickets.map((t) => ({
      id: t.id,
      usuario: t.usuario.nome,
      perfil: t.perfil,
      assunto: t.assunto,
      categoria: t.categoria,
      mensagem: t.mensagem,
      status: t.status,
      resposta: t.resposta ?? undefined,
      respondidoPor: t.respondidoPor ?? undefined,
      dataResposta: t.dataResposta ? t.dataResposta.toISOString() : undefined,
      createdAt: t.createdAt.toISOString(),
    })),
    lembretes,
    avaliacoes: avaliacoesRaw.map((a) => ({
      id: a.id,
      paciente: a.paciente.nome,
      medico: a.medico.nome,
      especialidade: a.medico.perfilMedico?.especialidade ?? "",
      nota: a.nota,
      comentario: a.comentario ?? undefined,
      pontualidade: a.pontualidade ?? undefined,
      atencao: a.atencao ?? undefined,
      clareza: a.clareza ?? undefined,
      createdAt: a.createdAt.toISOString(),
    })),
    consentimentos: consentimentos.map((c) => ({
      id: c.id,
      paciente: c.paciente?.nome ?? c.quem,
      quem: c.quem,
      perfil: c.perfil.toLowerCase(),
      finalidade: c.finalidade,
      documentos: c.documentos,
      aceito: c.aceito,
      createdAt: c.createdAt.toISOString(),
    })),
    auditLogs: auditLogs.map((l) => ({
      id: l.id,
      ts: l.createdAt.getTime(),
      acao: l.acao,
      categoria: l.categoria,
      severidade: l.severidade,
      usuario: l.usuarioNome,
      role: l.role.toLowerCase(),
      entidade: l.entidade ?? undefined,
      entidadeId: l.entidadeId ?? undefined,
      detalhes: l.detalhes ?? undefined,
    })),
    mensagens: mensagensRaw.map((m) => ({
      id: m.id,
      deId: m.deId,
      de: m.de.nome,
      paraId: m.paraId,
      para: m.para.nome,
      texto: m.texto,
      lida: m.lida,
      createdAt: m.createdAt.toISOString(),
    })),
    suporte: { id: suporte?.id ?? null, nome: suporte?.nome ?? "Suporte BION" },
  };
}

export type DadosFrescos = Awaited<ReturnType<typeof carregarDados>>;

/* ------------------------------------------------------------------ */
/* Efeitos colaterais enviados pelo cliente (notificações + auditoria) */
/* ------------------------------------------------------------------ */

export type NotifPayload = {
  tipo: string;
  titulo: string;
  texto: string;
  para?: "paciente" | "medico" | "admin";
  usuarioId?: string;
};

export type AuditPayload = {
  acao: string;
  categoria: string;
  severidade?: "info" | "warning" | "critical";
  entidade?: string;
  entidadeId?: string;
  detalhes?: string;
};

/** Cria notificações e log de auditoria enviados pelo cliente, com identidade validada no servidor. */
export async function aplicarSideEffects(
  usuario: UsuarioSessao,
  notificacoes?: NotifPayload[],
  audit?: AuditPayload,
): Promise<void> {
  if (notificacoes?.length) {
    await db.notificacao.createMany({
      data: notificacoes.map((n) => ({
        tipo: n.tipo,
        titulo: n.titulo,
        texto: n.texto,
        paraRole: n.para ? n.para.toUpperCase() : null,
        usuarioId: n.usuarioId ?? null,
      })),
    });
  }
  if (audit) {
    const { registrarAudit } = await import("./auth");
    await registrarAudit(usuario, audit);
  }
}
