import "server-only";
import crypto from "crypto";
import { db } from "@/lib/db";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { BUCKET_DOCUMENTOS } from "@/lib/supabase/storage";
import {
  cifrarIdentificacao,
  exigirChaveCofre,
  extrairDataNascimento,
  hashCpf,
  hashNome,
} from "@/lib/server/cofre";

/**
 * Anonimização LGPD (art. 12 / art. 16) de um paciente, feita pela administração.
 *
 * Duas camadas, com regras diferentes:
 *
 * 1) CADASTRO / LOGIN / DADOS NÃO CLÍNICOS — anonimizados ou removidos:
 *    identidade (nome, e-mail, senha), dados cadastrais do perfil (CPF,
 *    telefone, foto, profissão, estado civil, convênio), usuário no Supabase
 *    Auth, arquivos PESSOAIS no Storage, consentimentos (`quem`), nomes na
 *    auditoria, tickets, comentários de avaliação, lembretes, notificações e
 *    mensagens trocadas com quem NÃO é médico (suporte/admin).
 *
 * 2) REGISTRO CLÍNICO (prontuário) — PRESERVADO, apenas pseudonimizado:
 *    consultas (motivo e resumo médico), anamnese, exames laboratoriais,
 *    medições, documentos clínicos (receitas, atestados, solicitações),
 *    arquivos clínicos, mensagens com médicos e os dados clínicos do perfil
 *    (alergias, medicamentos, comorbidades, tipo sanguíneo, peso, altura,
 *    idade, gênero). A Lei 13.787/2018 (art. 6º) exige guarda do prontuário
 *    por no mínimo 20 anos; a LGPD (art. 16, I) autoriza a conservação para
 *    cumprimento de obrigação legal. O vínculo clínico continua pelo `id`
 *    interno do paciente, agora sem nome/e-mail/CPF (pseudônimo).
 *
 * Ordem (para ser IDEMPOTENTE e permitir nova tentativa após falha):
 *   a) Supabase Auth (remove o usuário; "não encontrado" = já removido);
 *   b) Storage (remove só objetos pessoais; remover o que não existe é ok);
 *   c) Postgres numa transação — incluindo o COFRE de identificação
 *      (nome, CPF, data de nascimento cifrados; ver src/lib/server/cofre.ts),
 *      gravado ANTES/junto da pseudonimização, de forma atômica.
 * Sem `BION_COFRE_CHAVE` válida a operação recusa com 503 antes de tudo.
 * Se (a) ou (b) falhar, NADA é alterado no banco e o erro sobe (502/503) —
 * o admin pode repetir. Rodar de novo numa conta já anonimizada reaproveita o
 * pseudônimo e conclui o que tiver faltado.
 */

export const MARCADOR_LGPD = "[removido por anonimização LGPD (art. 12)]";

/** Domínio dos e-mails substitutos — também serve de marcador de conta anonimizada. */
export const DOMINIO_EMAIL_ANON = "anon.bion.app";

export function estaAnonimizado(u: { email: string }): boolean {
  return u.email.toLowerCase().endsWith(`@${DOMINIO_EMAIL_ANON}`);
}

function erroStatus(msg: string, status: number): Error & { status?: number } {
  const e = new Error(msg) as Error & { status?: number };
  e.status = status;
  return e;
}

/* ------------------------------------------------------------------ */
/* Máscaras para a tela de confirmação (dados que identificam sem expor) */
/* ------------------------------------------------------------------ */

export function mascararEmail(email: string): string {
  const [local = "", dominio = ""] = email.split("@");
  if (!dominio) return "•••";
  return `${local.slice(0, 2)}•••@${dominio}`;
}

export function mascararCpfLgpd(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length < 11) return "";
  return `•••.${d.slice(3, 6)}.•••-${d.slice(9, 11)}`;
}

/* ------------------------------------------------------------------ */
/* Arquivos: pessoal x clínico                                          */
/* ------------------------------------------------------------------ */

type ArquivoMin = {
  id: string;
  nome: string;
  tipo: string;
  enviadoPor: string;
  usuarioId: string;
  consulta: string;
  storagePath: string | null;
  createdAt: Date;
};

/** Termos que indicam conteúdo clínico. Só servem para PRESERVAR — nunca
 *  são critério para apagar. */
const TERMOS_CLINICOS =
  /exame|laudo|resultado|receita|atestado|prontu|cl[ií]nic|bion ia|consulta|anamnese/i;

/**
 * Regra (revisão clínica do PR #4 — na dúvida, PRESERVA: prontuário não pode
 * ser destruído). Um arquivo só é "pessoal" (apagável) se TODAS valerem:
 *  1. foi enviado pelo próprio paciente (usuarioId = paciente E enviadoPor = "paciente");
 *  2. o paciente NUNCA teve consulta (qualquer status, inclusive futura ou
 *     cancelada) OU o arquivo foi enviado DEPOIS da última consulta dele
 *     (`ultimaConsulta` = maior dataInicio/createdAt entre as consultas);
 *  3. não está ligado a consulta nem à BION IA (`consulta` vazio ou "Envio avulso");
 *  4. não foi importado como exame (ExameLaboratorial.arquivoNome) nem
 *     anexado à anamnese (Anamnese.documentos).
 * Critério extra só para PRESERVAR: tipo/nome com termo clínico (exame,
 * laudo, receita...). Nome/tipo NUNCA tornam um arquivo apagável.
 * Data inválida ou ausente => preserva. Arquivos enviados por médico ou
 * ligados ao paciente por outra pessoa são sempre clínicos.
 */
export function arquivoEhPessoal(
  a: ArquivoMin,
  pacienteId: string,
  nomesClinicos: Set<string>,
  ultimaConsulta: Date | null,
): boolean {
  // 1) só o que o próprio paciente enviou
  if (a.usuarioId !== pacienteId || a.enviadoPor !== "paciente") return false;
  // 2) nunca teve consulta, ou enviado depois da última consulta
  if (ultimaConsulta) {
    const enviadoEm = a.createdAt instanceof Date ? a.createdAt.getTime() : NaN;
    const corte = ultimaConsulta.getTime();
    if (Number.isNaN(enviadoEm) || Number.isNaN(corte)) return false;
    if (!(enviadoEm > corte)) return false;
  }
  // 3) sem vínculo com consulta / BION IA
  const vinculo = a.consulta.trim().toLowerCase();
  if (vinculo !== "" && vinculo !== "envio avulso") return false;
  // 4) não importado como exame nem anexado à anamnese
  if (nomesClinicos.has(a.nome.trim().toLowerCase())) return false;
  // extra (só preserva): termo clínico no tipo/nome
  if (TERMOS_CLINICOS.test(a.tipo) || TERMOS_CLINICOS.test(a.nome)) return false;
  return true;
}

/**
 * IDs de arquivos ligados ao paciente pelo campo opcional `Arquivo.pacienteId`.
 * O campo ainda NÃO existe no schema do main (virá em outro PR); por isso a
 * consulta é feita em SQL cru e só quando a coluna existir — sem depender
 * dos tipos gerados do Prisma. TODO: quando `pacienteId` entrar no schema,
 * trocar por `db.arquivo.findMany({ where: { pacienteId } })`.
 */
async function idsArquivosPorPacienteId(pacienteId: string): Promise<string[]> {
  const col = await db.$queryRaw<{ existe: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Arquivo' AND column_name = 'pacienteId'
    ) AS existe`;
  if (!col[0]?.existe) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Arquivo" WHERE "pacienteId" = ${pacienteId}`;
  return rows.map((r) => r.id);
}

function nomesDeDocumentosAnamnese(json: string): string[] {
  try {
    const arr = JSON.parse(json || "[]") as { nome?: unknown }[];
    return Array.isArray(arr)
      ? arr.map((d) => (typeof d?.nome === "string" ? d.nome : "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Serviços externos (somente servidor, service role)                   */
/* ------------------------------------------------------------------ */

/** Remove o usuário do Supabase Auth. "Não encontrado" conta como sucesso. */
async function removerUsuarioSupabaseAuth(supabaseId: string): Promise<void> {
  if (!supabaseServiceRoleKey()) {
    throw erroStatus(
      "Supabase não configurado no servidor (service role): não é possível remover o login do paciente. Nada foi alterado.",
      503,
    );
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(supabaseId);
  if (!error) return;
  const naoEncontrado =
    error.status === 404 || error.code === "user_not_found" || /not\s*found/i.test(error.message);
  if (naoEncontrado) return; // já removido (nova tentativa) — idempotente
  console.error("[LGPD] falha ao remover usuário do Supabase Auth", error.status, error.code);
  throw erroStatus(
    "Falha ao remover o login do paciente no Supabase Auth. Nada foi alterado — tente novamente.",
    502,
  );
}

/** Remove objetos do bucket privado. Remover objeto inexistente não é erro. */
async function removerObjetosStorage(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (!supabaseServiceRoleKey()) {
    throw erroStatus(
      "Supabase Storage não configurado no servidor (service role): não é possível remover os arquivos pessoais. Nada foi alterado no banco.",
      503,
    );
  }
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET_DOCUMENTOS).remove(paths.slice(i, i + 100));
    if (error) {
      console.error("[LGPD] falha ao remover objetos do Storage", error.message);
      throw erroStatus(
        "Falha ao remover arquivos pessoais do Storage. Nada foi alterado no banco — tente novamente.",
        502,
      );
    }
  }
}

function substituirTermos(texto: string, termos: string[], por: string): string {
  let out = texto;
  for (const t of termos) out = out.split(t).join(por);
  return out;
}

/* ------------------------------------------------------------------ */
/* Anonimização                                                         */
/* ------------------------------------------------------------------ */

export type ResultadoAnonimizacao = {
  apelido: string;
  jaEstavaAnonimizado: boolean;
  arquivosPessoaisRemovidos: number;
  arquivosClinicosPreservados: number;
  loginSupabaseRemovido: boolean;
};

export async function anonimizarPacienteCompleto(pacienteId: string): Promise<ResultadoAnonimizacao> {
  const paciente = await db.user.findFirst({
    where: { id: pacienteId, role: "PACIENTE" },
    include: { perfilPaciente: true },
  });
  if (!paciente) throw erroStatus("Paciente não encontrado.", 404);
  // Cofre obrigatório: sem chave, recusa (503) antes de qualquer alteração.
  exigirChaveCofre();

  const jaEstavaAnonimizado = estaAnonimizado(paciente);
  let apelido = paciente.nome;
  let emailAnon = paciente.email;
  if (!jaEstavaAnonimizado) {
    const sufixo = crypto.randomBytes(3).toString("hex").toUpperCase();
    apelido = `Paciente Anonimizado ${sufixo}`;
    emailAnon = `anon-${sufixo.toLowerCase()}-${Date.now().toString(36)}@${DOMINIO_EMAIL_ANON}`;
  }

  // ---- Arquivos: classifica pessoal x clínico (antes de qualquer remoção) ----
  const idsPorPacienteId = await idsArquivosPorPacienteId(pacienteId);
  const arquivos = await db.arquivo.findMany({
    where: {
      OR: [{ usuarioId: pacienteId }, ...(idsPorPacienteId.length ? [{ id: { in: idsPorPacienteId } }] : [])],
    },
    select: {
      id: true,
      nome: true,
      tipo: true,
      enviadoPor: true,
      usuarioId: true,
      consulta: true,
      storagePath: true,
      createdAt: true,
    },
  });
  const [exames, anamneses, consultasAgg] = await Promise.all([
    db.exameLaboratorial.findMany({ where: { usuarioId: pacienteId }, select: { arquivoNome: true } }),
    db.anamnese.findMany({ where: { usuarioId: pacienteId }, select: { documentos: true, coleta: true } }),
    // Qualquer status (inclusive cancelada/futura): marco mais conservador.
    db.consulta.aggregate({
      where: { pacienteId },
      _count: { _all: true },
      _max: { dataInicio: true, createdAt: true },
    }),
  ]);
  const ultimaConsulta: Date | null =
    consultasAgg._count._all === 0
      ? null
      : (() => {
          const marcos = [consultasAgg._max.dataInicio, consultasAgg._max.createdAt]
            .map((d) => d?.getTime() ?? Number.NaN)
            .filter((t) => Number.isFinite(t));
          // Sem marco válido => Date inválida => arquivoEhPessoal preserva tudo.
          return new Date(marcos.length ? Math.max(...marcos) : Number.NaN);
        })();
  const nomesClinicos = new Set<string>(
    [
      ...exames.map((e) => e.arquivoNome ?? ""),
      ...anamneses.flatMap((a) => nomesDeDocumentosAnamnese(a.documentos)),
    ]
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  );
  const pessoais = arquivos.filter((a) => arquivoEhPessoal(a, pacienteId, nomesClinicos, ultimaConsulta));

  // ---- Cofre: identificação real cifrada (só na 1ª anonimização — numa
  //      reexecução o nome/CPF reais já não existem no cadastro) ----
  const registroCofre = jaEstavaAnonimizado
    ? null
    : {
        userId: pacienteId,
        dadosCifrados: cifrarIdentificacao(pacienteId, {
          nome: paciente.nome,
          cpf: paciente.perfilPaciente?.cpf ?? "",
          dataNascimento: extrairDataNascimento(anamneses.map((a) => a.coleta)),
        }),
        cpfHash: hashCpf(paciente.perfilPaciente?.cpf ?? ""),
        nomeHash: hashNome(paciente.nome),
      };

  // ---- (a) Supabase Auth e (b) Storage — antes do banco (ver cabeçalho) ----
  let loginSupabaseRemovido = false;
  if (paciente.supabaseId) {
    await removerUsuarioSupabaseAuth(paciente.supabaseId);
    loginSupabaseRemovido = true;
  }
  await removerObjetosStorage(
    pessoais.map((a) => a.storagePath).filter((p): p is string => !!p),
  );

  // ---- Termos identificáveis a remover de textos de auditoria ----
  const termos = [
    paciente.nome,
    paciente.email,
    paciente.perfilPaciente?.cpf ?? "",
    paciente.perfilPaciente?.telefone ?? "",
  ]
    .map((t) => t.trim())
    .filter((t) => t.length >= 5 && t !== apelido)
    .sort((a, b) => b.length - a.length);

  // Entidades do paciente referenciadas pela auditoria (escopo por ID — nunca
  // por nome, para não alterar a auditoria de um homônimo).
  const [consultas, documentos, tickets, avaliacoes, consentimentos, lembretes] = await Promise.all([
    db.consulta.findMany({ where: { pacienteId }, select: { id: true, pagamento: { select: { id: true } } } }),
    db.documento.findMany({ where: { pacienteId }, select: { id: true } }),
    db.ticket.findMany({ where: { usuarioId: pacienteId }, select: { id: true } }),
    db.avaliacao.findMany({ where: { pacienteId }, select: { id: true } }),
    db.consentimento.findMany({ where: { pacienteId }, select: { id: true } }),
    db.lembrete.findMany({ where: { usuarioId: pacienteId }, select: { id: true } }),
  ]);
  const idsEntidades = [
    pacienteId,
    ...consultas.map((c) => c.id),
    ...consultas.flatMap((c) => (c.pagamento ? [c.pagamento.id] : [])),
    ...documentos.map((d) => d.id),
    ...arquivos.map((a) => a.id),
    ...tickets.map((t) => t.id),
    ...avaliacoes.map((a) => a.id),
    ...consentimentos.map((c) => c.id),
    ...lembretes.map((l) => l.id),
  ];

  await db.$transaction(
    async (tx) => {
      // 0) Cofre de identificação — mesma transação da pseudonimização:
      //    ou os dois acontecem, ou nenhum. Não sobrescreve registro existente.
      if (registroCofre) {
        await tx.identificacaoCofre.upsert({
          where: { userId: pacienteId },
          create: registroCofre,
          update: {},
        });
      }

      // 1) Identidade / login: nome, e-mail, senha inutilizada, sem vínculo com o Auth.
      await tx.user.update({
        where: { id: pacienteId },
        data: {
          nome: apelido,
          email: emailAnon,
          senhaHash: crypto.randomBytes(32).toString("hex"),
          status: "inativo",
          precisaTrocarSenha: false,
          supabaseId: null,
        },
      });

      // 2) Perfil: só os dados CADASTRAIS. Dados clínicos (alergias,
      //    medicamentos, comorbidades, tipo sanguíneo, peso, altura, idade,
      //    gênero) fazem parte do prontuário e ficam.
      await tx.perfilPaciente.updateMany({
        where: { userId: pacienteId },
        data: {
          cpf: "",
          telefone: "",
          convenio: "Particular",
          profissao: "",
          estadoCivil: "",
          foto: null,
        },
      });

      // 3) Consentimentos: o registro (prova do consentimento) fica; o nome
      //    de quem registrou, quando é o próprio paciente, vira o pseudônimo.
      await tx.consentimento.updateMany({
        where: { pacienteId, OR: [{ perfil: "PACIENTE" }, { quem: paciente.nome }] },
        data: { quem: apelido },
      });

      // 4) Auditoria: ações do próprio paciente e eventos sobre as entidades
      //    dele passam a mostrar o pseudônimo; nome/e-mail/CPF/telefone saem
      //    dos detalhes. A trilha (ação, data, ids) é mantida.
      const logs = await tx.auditLog.findMany({
        where: { OR: [{ usuarioId: pacienteId }, { entidadeId: { in: idsEntidades } }] },
        select: { id: true, usuarioId: true, usuarioNome: true, detalhes: true },
      });
      for (const l of logs) {
        const usuarioNome = l.usuarioId === pacienteId ? apelido : substituirTermos(l.usuarioNome, termos, apelido);
        const detalhes = l.detalhes === null ? null : substituirTermos(l.detalhes, termos, apelido);
        if (usuarioNome !== l.usuarioNome || detalhes !== l.detalhes) {
          await tx.auditLog.update({ where: { id: l.id }, data: { usuarioNome, detalhes } });
        }
      }

      // 5) Mensagens com quem NÃO é médico (suporte/admin): texto removido.
      //    Mensagens com médicos são comunicação clínica e ficam (revisão clínica).
      await tx.mensagem.updateMany({
        where: {
          OR: [
            { deId: pacienteId, para: { role: { not: "MEDICO" } } },
            { paraId: pacienteId, de: { role: { not: "MEDICO" } } },
          ],
        },
        data: { texto: MARCADOR_LGPD },
      });

      // 6) Tickets de suporte e comentários livres de avaliação (não clínicos).
      await tx.ticket.updateMany({
        where: { usuarioId: pacienteId },
        data: { assunto: MARCADOR_LGPD, mensagem: MARCADOR_LGPD, resposta: MARCADOR_LGPD },
      });
      await tx.avaliacao.updateMany({ where: { pacienteId }, data: { comentario: null } });

      // 7) Dados do app que não são prontuário: lembretes e notificações dirigidas.
      await tx.lembrete.deleteMany({ where: { usuarioId: pacienteId } });
      await tx.notificacao.deleteMany({ where: { usuarioId: pacienteId } });

      // 8) Arquivos PESSOAIS (objetos já removidos do Storage acima).
      //    Arquivos clínicos permanecem intactos.
      if (pessoais.length) {
        await tx.arquivo.deleteMany({ where: { id: { in: pessoais.map((a) => a.id) } } });
      }

      // 9) Sessões revogadas — a conta anonimizada não pode mais ser usada.
      await tx.sessao.deleteMany({ where: { userId: pacienteId } });

      // PRESERVADOS (prontuário — Lei 13.787/2018, 20 anos): Consulta
      // (inclusive motivoConsulta e resumoMedico), Anamnese, ExameLaboratorial,
      // Medicao, Documento (receitas/atestados/solicitações), Pagamento e
      // arquivos clínicos — todos ligados apenas ao id pseudonimizado.
    },
    { timeout: 30_000 },
  );

  return {
    apelido,
    jaEstavaAnonimizado,
    arquivosPessoaisRemovidos: pessoais.length,
    arquivosClinicosPreservados: arquivos.length - pessoais.length,
    loginSupabaseRemovido,
  };
}
