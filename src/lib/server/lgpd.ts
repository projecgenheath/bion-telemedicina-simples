import "server-only";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { removerNumerosLongos as removerNumerosLongosLocal } from "@/lib/anonimizar-medico-logica";
import { filtrarAbertas, idsPendenciaConcluidos, lerPathsStorage, marcaPendencia } from "@/lib/lgpd-pendencias-logica";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { BUCKET_DOCUMENTOS } from "@/lib/supabase/storage";
import {
  cifrarIdentificacao,
  complementarIdentificacao,
  dataNascimentoParaCofre,
  decifrarIdentificacao,
  exigirChaveCofre,
  hashCpf,
  hashNome,
  type IdentificacaoClara,
} from "@/lib/server/cofre";
import { dataNascimentoParaIso, idadeDeNascimento } from "@/lib/idade";
import {
  STATUS_CONSULTA_ENCERRADA,
  STATUS_PAGAMENTO_PENDENTE,
  STATUS_REEMBOLSO_ABERTO,
  STATUS_REMARCACAO_ABERTA,
  STATUS_RENOVACAO_ABERTA,
  motivosBloqueioExclusao,
  type PendenciasExclusao,
} from "@/lib/exclusao-conta-logica";
import {
  DADOS_PERFIL_MEDICO_PSEUDONIMIZADO,
  DADO_REMOVIDO_MEDICO,
  STATUS_CONSULTA_ENCERRADA_MEDICO,
  STATUS_EVOLUCAO_ABERTA,
  STATUS_REEMBOLSO_PENDENTE,
  STATUS_REMARCACAO_ABERTA_MEDICO,
  STATUS_RENOVACAO_ABERTA_MEDICO,
  STATUS_REPASSE_ABERTO,
  classificarConsultasAbertas,
  motivosBloqueioAnonimizacaoMedico,
  type PendenciasMedico,
} from "@/lib/anonimizar-medico-logica";

/** Cliente do Prisma fora (db) ou dentro de uma transação (tx). */
type Cliente = Prisma.TransactionClient;

/**
 * Anonimização LGPD (art. 12 / art. 16) de um paciente, feita pela administração.
 *
 * Duas camadas, com regras diferentes:
 *
 * 1) CADASTRO / LOGIN / DADOS NÃO CLÍNICOS — anonimizados ou removidos:
 *    identidade (nome, e-mail, senha), dados cadastrais do perfil (CPF,
 *    data de nascimento, telefone, foto, profissão, estado civil, convênio —
 *    ver DADOS_PERFIL_PSEUDONIMIZADO), usuário no Supabase
 *    Auth, arquivos PESSOAIS no Storage, consentimentos (`quem`), nomes na
 *    auditoria, tickets, comentários de avaliação, lembretes, notificações e
 *    mensagens trocadas com quem NÃO é médico (suporte/admin).
 *
 * 2) REGISTRO CLÍNICO (prontuário) — PRESERVADO, apenas pseudonimizado:
 *    consultas (motivo e resumo médico), anamnese, exames laboratoriais,
 *    medições, documentos clínicos (receitas, atestados, solicitações),
 *    arquivos clínicos, mensagens com médicos e os dados clínicos do perfil
 *    (alergias, medicamentos, comorbidades, tipo sanguíneo, peso, altura,
 *    idade, gênero — a IDADE fica: o histórico clínico usa; a data de
 *    nascimento exata sai do cadastro e vai só para o cofre). A Lei
 *    13.787/2018 (art. 6º) exige guarda do prontuário por no mínimo 20 anos; a LGPD (art. 16, I) autoriza a conservação para
 *    cumprimento de obrigação legal. O vínculo clínico continua pelo `id`
 *    interno do paciente, agora sem nome/e-mail/CPF (pseudônimo).
 *
 * Ordem (para ser IDEMPOTENTE e permitir nova tentativa após falha):
 *   a) Supabase Auth (remove o usuário; "não encontrado" = já removido);
 *   b) Storage (remove só objetos pessoais; remover o que não existe é ok);
 *   c) Postgres numa transação — incluindo o COFRE de identificação
 *      (nome, CPF, data de nascimento cifrados; ver src/lib/server/cofre.ts;
 *      a data vem de PerfilPaciente.dataNascimento, com fallback na anamnese),
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

/**
 * Campos CADASTRAIS do PerfilPaciente zerados na pseudonimização. A data de
 * nascimento exata é identificador direto: sai do perfil (null) e fica só no
 * cofre cifrado. Dados clínicos (alergias, medicamentos, comorbidades, tipo
 * sanguíneo, peso, altura, IDADE, gênero) fazem parte do prontuário e ficam —
 * por isso `idade` NÃO está aqui.
 */
export const DADOS_PERFIL_PSEUDONIMIZADO = {
  cpf: "",
  dataNascimento: null,
  telefone: "",
  convenio: "Particular",
  profissao: "",
  estadoCivil: "",
  foto: null,
} as const;

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
      "Supabase Storage não configurado no servidor (service role): não é possível remover os arquivos pessoais.",
      503,
    );
  }
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET_DOCUMENTOS).remove(paths.slice(i, i + 100));
    if (error) {
      console.error("[LGPD] falha ao remover objetos do Storage", error.message);
      throw erroStatus(
        "Falha ao remover arquivos pessoais do Storage.",
        502,
      );
    }
  }
}

/**
 * Pendências que impedem anonimizar o paciente (mesmo critério da exclusão
 * pelo próprio paciente, em paciente/conta). Aceita `tx` para rodar DENTRO da
 * transação da escrita (revisão do #95, item 8).
 */
export async function pendenciasExclusaoPaciente(cli: Cliente, pacienteId: string): Promise<PendenciasExclusao> {
  const [consultasAtivas, reembolsosAbertos, remarcacoesAbertas, renovacoesAbertas, pagamentosPendentesSemConsulta] =
    await Promise.all([
      cli.consulta.count({ where: { pacienteId, status: { notIn: [...STATUS_CONSULTA_ENCERRADA] } } }),
      cli.reembolso.count({
        where: {
          status: { in: [...STATUS_REEMBOLSO_ABERTO] },
          OR: [
            { pagamento: { consulta: { pacienteId } } },
            { pagamento: { pedidoRenovacao: { pacienteId } } },
            { remarcacao: { consulta: { pacienteId } } },
          ],
        },
      }),
      cli.remarcacaoPendente.count({ where: { status: { in: [...STATUS_REMARCACAO_ABERTA] }, consulta: { pacienteId } } }),
      cli.pedidoRenovacao.count({ where: { pacienteId, status: { in: [...STATUS_RENOVACAO_ABERTA] } } }),
      cli.pagamento.count({
        where: { consultaId: null, status: { in: [...STATUS_PAGAMENTO_PENDENTE] }, pedidoRenovacao: { pacienteId } },
      }),
    ]);
  return { consultasAtivas, reembolsosAbertos, remarcacoesAbertas, renovacoesAbertas, pagamentosPendentesSemConsulta };
}

/** Erro 409 com a lista de pendências (sem dados pessoais). */
export class PendenciasLgpdError extends Error {
  status = 409;
  constructor(public motivos: string[]) {
    super(`Não é possível anonimizar agora: ${motivos.join(" ")}`);
  }
}

/** Trava a linha do usuário até o fim da transação (serializa com outra anonimização do mesmo id). */
async function travarUsuario(tx: Cliente, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
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
  //      Data de nascimento: PerfilPaciente.dataNascimento ("YYYY-MM-DD", data
  //      pura); só se vazia, o fallback da anamnese.
  const registroCofre = jaEstavaAnonimizado
    ? null
    : {
        userId: pacienteId,
        dadosCifrados: cifrarIdentificacao(pacienteId, {
          nome: paciente.nome,
          cpf: paciente.perfilPaciente?.cpf ?? "",
          dataNascimento: dataNascimentoParaCofre(
            paciente.perfilPaciente?.dataNascimento,
            anamneses.map((a) => a.coleta),
          ),
        }),
        cpfHash: hashCpf(paciente.perfilPaciente?.cpf ?? ""),
        nomeHash: hashNome(paciente.nome),
      };

  // ---- Pendências: checagem antecipada (antes de mexer no Auth/Storage) ----
  //      e de novo DENTRO da transação da escrita (fecha a janela de corrida).
  {
    const motivos = motivosBloqueioExclusao(await pendenciasExclusaoPaciente(db, pacienteId));
    if (motivos.length) throw new PendenciasLgpdError(motivos);
  }

  // ---- (a) Supabase Auth: só BANE antes do banco (reversível). A remoção
  //      definitiva vem depois do commit; se a transação falhar (ex.: 409
  //      por pendência), o ban é desfeito. (b) Storage: só DEPOIS do commit,
  //      e só dos arquivos pessoais sem vínculo clínico (reconferidos na
  //      transação). Arquivo de consulta/prontuário nunca é apagado (20 anos).
  const supabaseIdPaciente = paciente.supabaseId;
  if (supabaseIdPaciente && !jaEstavaAnonimizado) await banirSupabaseAuth(supabaseIdPaciente, true);
  let pathsParaRemover: string[] = [];
  let pessoaisRemovidos = 0;
  try {
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
        // Pendências de novo, na MESMA transação da escrita (com a linha travada).
        await travarUsuario(tx, pacienteId);
        const motivosTx = motivosBloqueioExclusao(await pendenciasExclusaoPaciente(tx, pacienteId));
        if (motivosTx.length) throw new PendenciasLgpdError(motivosTx);

        // 0) Cofre de identificação — mesma transação da pseudonimização:
        //    ou os dois acontecem, ou nenhum. Não sobrescreve registro existente.
        if (registroCofre) {
          await tx.identificacaoCofre.upsert({
            where: { userId: pacienteId },
            create: registroCofre,
            update: {},
          });
        } else {
          // Reexecução com data de nascimento ainda no perfil (conta anonimizada
          // antes de a data ir para o cofre): complementa o cofre ANTES de
          // apagar a data (passo 2), na mesma transação.
          const dataPerfil = dataNascimentoParaIso(paciente.perfilPaciente?.dataNascimento);
          if (dataPerfil) {
            const existente = await tx.identificacaoCofre.findUnique({ where: { userId: pacienteId } });
            let claro: IdentificacaoClara | null = null;
            if (existente) {
              try {
                claro = decifrarIdentificacao(pacienteId, existente.dadosCifrados);
              } catch {
                throw erroStatus(
                  "Não foi possível ler o registro do cofre deste paciente (chave trocada ou registro adulterado). Nada foi alterado no banco.",
                  503,
                );
              }
            }
            const novo = complementarIdentificacao(claro, dataPerfil);
            if (novo) {
              const dadosCifrados = cifrarIdentificacao(pacienteId, novo);
              await tx.identificacaoCofre.upsert({
                where: { userId: pacienteId },
                create: {
                  userId: pacienteId,
                  dadosCifrados,
                  cpfHash: hashCpf(novo.cpf),
                  nomeHash: hashNome(novo.nome),
                },
                update: { dadosCifrados },
              });
            }
          }
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

        // 2) Perfil: só os dados CADASTRAIS (inclusive a data de nascimento,
        //    já guardada no cofre no passo 0). Dados clínicos (alergias,
        //    medicamentos, comorbidades, tipo sanguíneo, peso, altura, idade,
        //    gênero) fazem parte do prontuário e ficam. Sem a data, a idade
        //    exibida passa a ser a coluna `idade`: ela é atualizada para a idade
        //    calculada HOJE (a que o sistema mostrava), congelada daqui em diante.
        const isoNascimento = dataNascimentoParaIso(paciente.perfilPaciente?.dataNascimento);
        const idadeNaAnonimizacao = isoNascimento ? idadeDeNascimento(isoNascimento) : null;
        await tx.perfilPaciente.updateMany({
          where: { userId: pacienteId },
          data: {
            ...DADOS_PERFIL_PSEUDONIMIZADO,
            ...(idadeNaAnonimizacao !== null ? { idade: idadeNaAnonimizacao } : {}),
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

        // 8) Arquivos PESSOAIS: reconfere na transação que continuam sem vínculo
        //    clínico (enviados pelo paciente, sem consulta) e apaga só as linhas;
        //    os objetos do Storage saem depois do commit. Clínicos ficam intactos.
        if (pessoais.length) {
          const aindaPessoais = (
            await tx.arquivo.findMany({
              where: { id: { in: pessoais.map((a) => a.id) }, usuarioId: pacienteId, enviadoPor: "paciente" },
              select: { id: true, storagePath: true, consulta: true },
            })
          ).filter((a) => ["", "envio avulso"].includes(a.consulta.trim().toLowerCase()));
          if (aindaPessoais.length) {
            await tx.arquivo.deleteMany({ where: { id: { in: aindaPessoais.map((a) => a.id) } } });
          }
          pessoaisRemovidos = aindaPessoais.length;
          pathsParaRemover = aindaPessoais.map((a) => a.storagePath).filter((p): p is string => !!p);
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
  } catch (e) {
    if (supabaseIdPaciente && !jaEstavaAnonimizado) {
      await desfazerBanOuRegistrarPendente(pacienteId, supabaseIdPaciente, "PACIENTE");
    }
    throw e;
  }

  const loginSupabaseRemovido = supabaseIdPaciente
    ? await removerAuthOuRegistrarPendente(pacienteId, supabaseIdPaciente, "PACIENTE")
    : false;
  await removerStorageOuRegistrarPendente(pacienteId, pathsParaRemover);

  return {
    apelido,
    jaEstavaAnonimizado,
    arquivosPessoaisRemovidos: pessoaisRemovidos,
    arquivosClinicosPreservados: arquivos.length - pessoaisRemovidos,
    loginSupabaseRemovido,
  };
}


/* ------------------------------------------------------------------ */
/* Remoção do Auth depois do commit, com pendência registrada            */
/* ------------------------------------------------------------------ */

export const ACAO_AUTH_REMOCAO_PENDENTE = "LGPD_AUTH_REMOCAO_PENDENTE";
export const ACAO_AUTH_REMOCAO_CONCLUIDA = "LGPD_AUTH_REMOCAO_CONCLUIDA";

/**
 * Tenta remover o login do Supabase Auth (já banido e desvinculado do banco).
 * Se falhar, grava na auditoria (categoria "admin", fora do descarte #100) o
 * `supabaseId` pendente, para `reprocessarRemocoesAuthPendentes` tentar de novo.
 */
async function removerAuthOuRegistrarPendente(userId: string, supabaseId: string, papel: "PACIENTE" | "MEDICO"): Promise<boolean> {
  try {
    await removerUsuarioSupabaseAuth(supabaseId);
    return true;
  } catch (e) {
    console.error("[LGPD] login ficou banido, mas não foi removido do Supabase Auth", userId);
    await db.auditLog
      .create({
        data: {
          acao: ACAO_AUTH_REMOCAO_PENDENTE,
          categoria: "admin",
          severidade: "critical",
          usuarioNome: "Sistema",
          role: "SISTEMA",
          entidade: papel === "MEDICO" ? "medico" : "paciente",
          entidadeId: userId,
          detalhes: `supabaseId=${supabaseId}; login banido, remoção do Supabase Auth falhou (${(e as Error)?.message?.slice(0, 120) ?? "erro"}). Tentar de novo.`,
        },
      })
      .catch(() => console.error("[LGPD] não consegui registrar a remoção pendente do Auth", userId));
    return false;
  }
}

export const ACAO_STORAGE_REMOCAO_PENDENTE = "LGPD_STORAGE_REMOCAO_PENDENTE";
export const ACAO_STORAGE_REMOCAO_CONCLUIDA = "LGPD_STORAGE_REMOCAO_CONCLUIDA";

/**
 * Remove do Storage os objetos dos arquivos pessoais já apagados no banco
 * (depois do commit). Falhou: grava a pendência na auditoria (categoria
 * "admin") com os caminhos, para `reprocessarRemocoesStoragePendentes`.
 */
async function removerStorageOuRegistrarPendente(pacienteId: string, paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  try {
    await removerObjetosStorage(paths);
    return true;
  } catch (e) {
    console.error("[LGPD] arquivos pessoais não foram removidos do Storage", pacienteId);
    await db.auditLog
      .create({
        data: {
          acao: ACAO_STORAGE_REMOCAO_PENDENTE,
          categoria: "admin",
          severidade: "critical",
          usuarioNome: "Sistema",
          role: "SISTEMA",
          entidade: "paciente",
          entidadeId: pacienteId,
          detalhes: JSON.stringify({ paths, erro: (e as Error)?.message?.slice(0, 120) ?? "erro" }),
        },
      })
      .catch(() => console.error("[LGPD] não consegui registrar a remoção pendente do Storage", pacienteId));
    return false;
  }
}

export const ACAO_PENDENCIA_LGPD_INVALIDA = "LGPD_PENDENCIA_INVALIDA";

/**
 * Pendências ABERTAS de um tipo, das mais antigas: pagina a auditoria em
 * lotes, descarta as que têm conclusão com `pendencia=<id>` dela mesma e só
 * então aplica o limite (as abertas novas não somem atrás das fechadas).
 */
async function pendenciasAbertas(
  pendente: string,
  concluida: string,
  limite: number,
  ate?: Date,
): Promise<{ id: string; entidade: string | null; entidadeId: string | null; detalhes: string | null; createdAt: Date }[]> {
  const LOTE = 200;
  const out: { id: string; entidade: string | null; entidadeId: string | null; detalhes: string | null; createdAt: Date }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const lote = await db.auditLog.findMany({
      where: { acao: pendente, ...(ate ? { createdAt: { lte: ate } } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: LOTE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, entidade: true, entidadeId: true, detalhes: true, createdAt: true },
    });
    if (!lote.length) break;
    const conclusoes = await db.auditLog.findMany({
      where: { acao: concluida, OR: lote.map((p) => ({ detalhes: { startsWith: marcaPendencia(p.id) } })) },
      select: { detalhes: true },
    });
    out.push(...filtrarAbertas(lote, idsPendenciaConcluidos(conclusoes.map((c) => c.detalhes)), limite - out.length));
    if (out.length >= limite || lote.length < LOTE) break;
    cursor = lote[lote.length - 1].id;
  }
  return out;
}

async function registrarConclusao(acao: string, p: { id: string; entidade: string | null; entidadeId: string | null }, extra = "") {
  await db.auditLog.create({
    data: {
      acao, categoria: "admin", severidade: "info",
      usuarioNome: "Sistema", role: "SISTEMA", entidade: p.entidade, entidadeId: p.entidadeId,
      detalhes: marcaPendencia(p.id) + extra,
    },
  });
}

/** Nova tentativa das remoções do Storage pendentes. Detalhes ilegíveis viram falha registrada (uma vez). */
export async function reprocessarRemocoesStoragePendentes(limite = 50): Promise<{ concluidas: number; falhas: number }> {
  const pendentes = await pendenciasAbertas(ACAO_STORAGE_REMOCAO_PENDENTE, ACAO_STORAGE_REMOCAO_CONCLUIDA, limite);
  let concluidas = 0;
  let falhas = 0;
  for (const p of pendentes) {
    const lido = lerPathsStorage(p.detalhes);
    if (!lido.ok) {
      falhas++;
      const marca = marcaPendencia(p.id);
      const jaRegistrada = await db.auditLog.count({ where: { acao: ACAO_PENDENCIA_LGPD_INVALIDA, detalhes: { startsWith: marca } } });
      if (!jaRegistrada) {
        await db.auditLog.create({
          data: {
            acao: ACAO_PENDENCIA_LGPD_INVALIDA, categoria: "admin", severidade: "critical",
            usuarioNome: "Sistema", role: "SISTEMA", entidade: p.entidade, entidadeId: p.entidadeId,
            detalhes: `${marca}; tipo=${ACAO_STORAGE_REMOCAO_PENDENTE}; ${lido.erro}. Remover os arquivos manualmente.`,
          },
        });
      }
      continue;
    }
    try {
      await removerObjetosStorage(lido.paths);
      await registrarConclusao(ACAO_STORAGE_REMOCAO_CONCLUIDA, p);
      concluidas++;
    } catch {
      falhas++;
    }
  }
  return { concluidas, falhas };
}

export const ACAO_AUTH_DESBAN_PENDENTE = "LGPD_AUTH_DESBAN_PENDENTE";
export const ACAO_AUTH_DESBAN_CONCLUIDO = "LGPD_AUTH_DESBAN_CONCLUIDO";

/**
 * A anonimização falhou depois do ban: desfaz o ban. Se isso também falhar,
 * grava a pendência na auditoria (categoria "admin", com o supabaseId) para
 * `reprocessarDesbansPendentes` tentar de novo — a pessoa não fica sem login.
 */
async function desfazerBanOuRegistrarPendente(userId: string, supabaseId: string, papel: "PACIENTE" | "MEDICO"): Promise<void> {
  try {
    await banirSupabaseAuth(supabaseId, false);
  } catch (e) {
    console.error("[LGPD] não consegui desfazer o bloqueio do login", userId);
    await db.auditLog
      .create({
        data: {
          acao: ACAO_AUTH_DESBAN_PENDENTE,
          categoria: "admin",
          severidade: "critical",
          usuarioNome: "Sistema",
          role: "SISTEMA",
          entidade: papel === "MEDICO" ? "medico" : "paciente",
          entidadeId: userId,
          detalhes: `supabaseId=${supabaseId}; anonimização desfeita, mas o login continua banido (${(e as Error)?.message?.slice(0, 120) ?? "erro"}). Tentar de novo.`,
        },
      })
      .catch(() => console.error("[LGPD] não consegui registrar o desbloqueio pendente", userId));
  }
}

/**
 * Nova tentativa dos desbloqueios pendentes. Só desbane se a conta NÃO foi
 * anonimizada depois (ainda ligada ao mesmo supabaseId e não anonimizada).
 */
export async function reprocessarDesbansPendentes(limite = 50): Promise<{ concluidas: number; falhas: number }> {
  const pendentes = await pendenciasAbertas(ACAO_AUTH_DESBAN_PENDENTE, ACAO_AUTH_DESBAN_CONCLUIDO, limite);
  let concluidas = 0;
  let falhas = 0;
  for (const p of pendentes) {
    if (!p.entidadeId) continue;
    const id = /supabaseId=([0-9a-fA-F-]{36})/.exec(p.detalhes ?? "")?.[1];
    if (!id) continue;
    const u = await db.user.findUnique({ where: { id: p.entidadeId }, select: { email: true, supabaseId: true } });
    const concluir = () => registrarConclusao(ACAO_AUTH_DESBAN_CONCLUIDO, p);
    // Anonimizada depois (ou desvinculada): o ban deve ficar.
    if (!u || u.supabaseId !== id || estaAnonimizado(u)) {
      await concluir();
      continue;
    }
    try {
      await banirSupabaseAuth(id, false);
      await concluir();
      concluidas++;
    } catch {
      falhas++;
    }
  }
  return { concluidas, falhas };
}

export const ACAO_PENDENCIA_LGPD_ATRASADA = "LGPD_PENDENCIA_ATRASADA";
/** LGPD: 15 dias para concluir; avisa na auditoria a partir de 10. */
export const DIAS_ALERTA_PENDENCIA_LGPD = 10;

const PARES_PENDENCIA: [string, string][] = [
  [ACAO_AUTH_REMOCAO_PENDENTE, ACAO_AUTH_REMOCAO_CONCLUIDA],
  [ACAO_STORAGE_REMOCAO_PENDENTE, ACAO_STORAGE_REMOCAO_CONCLUIDA],
  [ACAO_AUTH_DESBAN_PENDENTE, ACAO_AUTH_DESBAN_CONCLUIDO],
];

/**
 * Pendências (Auth, Storage, desban) abertas há mais de 10 dias: grava UM
 * aviso `LGPD_PENDENCIA_ATRASADA` (crítico, categoria "admin", só ids) por
 * pendência. Aberta = sem conclusão com `pendencia=<id>` dela mesma.
 */
export async function alertarPendenciasLgpdAtrasadas(agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - DIAS_ALERTA_PENDENCIA_LGPD * 86_400_000);
  let alertas = 0;
  for (const [pendente, concluida] of PARES_PENDENCIA) {
    const antigas = await pendenciasAbertas(pendente, concluida, 200, limite);
    for (const p of antigas) {
      const marca = marcaPendencia(p.id);
      const jaAvisado = await db.auditLog.count({ where: { acao: ACAO_PENDENCIA_LGPD_ATRASADA, detalhes: { startsWith: marca } } });
      if (jaAvisado) continue;
      const dias = Math.floor((agora.getTime() - p.createdAt.getTime()) / 86_400_000);
      await db.auditLog.create({
        data: {
          acao: ACAO_PENDENCIA_LGPD_ATRASADA, categoria: "admin", severidade: "critical",
          usuarioNome: "Sistema", role: "SISTEMA", entidade: p.entidade, entidadeId: p.entidadeId,
          detalhes: `${marca}; tipo=${pendente}; aberta há ${dias} dias (prazo LGPD: 15 dias). Resolver manualmente.`,
        },
      });
      alertas++;
    }
  }
  return alertas;
}

export type PendenciaLgpd = {
  id: string;
  tipo: "auth" | "storage" | "desban";
  entidade: string | null;
  entidadeId: string | null;
  criadaEm: string;
  dias: number;
};

const TIPO_PENDENCIA: Record<string, PendenciaLgpd["tipo"]> = {
  [ACAO_AUTH_REMOCAO_PENDENTE]: "auth",
  [ACAO_STORAGE_REMOCAO_PENDENTE]: "storage",
  [ACAO_AUTH_DESBAN_PENDENTE]: "desban",
};

/** Pendências LGPD abertas (Auth, Storage, desban), lidas da auditoria. Só ids. */
export async function listarPendenciasLgpd(agora: Date = new Date(), limite = 100): Promise<PendenciaLgpd[]> {
  const out: PendenciaLgpd[] = [];
  for (const [pendente, concluida] of PARES_PENDENCIA) {
    for (const p of await pendenciasAbertas(pendente, concluida, limite)) {
      out.push({
        id: p.id,
        tipo: TIPO_PENDENCIA[pendente],
        entidade: p.entidade,
        entidadeId: p.entidadeId,
        criadaEm: p.createdAt.toISOString(),
        dias: Math.floor((agora.getTime() - p.createdAt.getTime()) / 86_400_000),
      });
    }
  }
  return out.sort((a, b) => b.dias - a.dias);
}

/** Reprocessa tudo (cron diário e botão do admin). */
export async function reprocessarPendenciasLgpd(agora: Date = new Date()) {
  const auth = await reprocessarRemocoesAuthPendentes();
  const storage = await reprocessarRemocoesStoragePendentes();
  const desban = await reprocessarDesbansPendentes();
  const atrasadas = await alertarPendenciasLgpdAtrasadas(agora);
  return { auth, storage, desban, atrasadas };
}

/** Nova tentativa das remoções do Auth pendentes. Devolve quantas concluiu. */
export async function reprocessarRemocoesAuthPendentes(limite = 50): Promise<{ concluidas: number; falhas: number }> {
  const pendentes = await pendenciasAbertas(ACAO_AUTH_REMOCAO_PENDENTE, ACAO_AUTH_REMOCAO_CONCLUIDA, limite);
  const removidosNesta = new Set<string>();
  let concluidas = 0;
  let falhas = 0;
  for (const p of pendentes) {
    const id = /supabaseId=([0-9a-fA-F-]{36})/.exec(p.detalhes ?? "")?.[1];
    if (!id) {
      falhas++;
      continue;
    }
    try {
      // Mesma conta em duas pendências: remove uma vez, conclui as duas.
      if (!removidosNesta.has(id)) await removerUsuarioSupabaseAuth(id);
      removidosNesta.add(id);
      await registrarConclusao(ACAO_AUTH_REMOCAO_CONCLUIDA, p, `; supabaseId=${id}`);
      concluidas++;
    } catch {
      falhas++;
    }
  }
  return { concluidas, falhas };
}

/** Tira números longos (CPF, telefone…) de texto livre — regra pura em anonimizar-medico-logica. */
export { removerNumerosLongos } from "@/lib/anonimizar-medico-logica";

/* ------------------------------------------------------------------ */
/* Anonimização do MÉDICO (admin)                                       */
/* ------------------------------------------------------------------ */

/**
 * Pendências do médico que impedem a anonimização. Aceita `tx` para rodar
 * DENTRO da transação da escrita.
 */
export async function pendenciasAnonimizacaoMedico(
  cli: Cliente,
  medicoId: string,
  agora: Date = new Date(),
): Promise<PendenciasMedico> {
  const [consultasAbertas, evolucoesPendentes, repassesAbertos, ajustesSemRepasse, reembolsosPendentes, renovacoesAbertas, remarcacoesAbertas] =
    await Promise.all([
      cli.consulta.findMany({
        where: { medicoId, status: { notIn: [...STATUS_CONSULTA_ENCERRADA_MEDICO] } },
        select: { dataInicio: true, status: true },
      }),
      cli.evolucao.count({ where: { medicoId, status: { in: [...STATUS_EVOLUCAO_ABERTA] } } }),
      cli.repasse.count({ where: { medicoId, status: { in: [...STATUS_REPASSE_ABERTO] } } }),
      cli.repasseAjuste.count({ where: { medicoId, repasseId: null } }),
      cli.reembolso.count({
        where: {
          status: { in: [...STATUS_REEMBOLSO_PENDENTE] },
          OR: [
            { pagamento: { consulta: { medicoId } } },
            { pagamento: { pedidoRenovacao: { medicoId } } },
            { remarcacao: { consulta: { medicoId } } },
          ],
        },
      }),
      cli.pedidoRenovacao.count({ where: { medicoId, status: { in: [...STATUS_RENOVACAO_ABERTA_MEDICO] } } }),
      cli.remarcacaoPendente.count({ where: { status: { in: [...STATUS_REMARCACAO_ABERTA_MEDICO] }, consulta: { medicoId } } }),
    ]);
  const { futuras, emAndamento } = classificarConsultasAbertas(consultasAbertas, agora);
  return {
    consultasFuturas: futuras,
    consultasEmAndamento: emAndamento,
    evolucoesPendentes,
    repassesAbertos,
    ajustesSemRepasse,
    reembolsosPendentes,
    renovacoesAbertas,
    remarcacoesAbertas,
  };
}

/** Bloqueia (ban) o login no Supabase Auth — reversível, usado ANTES da transação. */
async function banirSupabaseAuth(supabaseId: string, banir: boolean): Promise<void> {
  if (!supabaseServiceRoleKey()) {
    throw erroStatus(
      "Supabase não configurado no servidor (service role): não é possível desativar o login. Nada foi alterado.",
      503,
    );
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(supabaseId, { ban_duration: banir ? "876000h" : "none" });
  if (!error) return;
  const naoEncontrado =
    error.status === 404 || error.code === "user_not_found" || /not\s*found/i.test(error.message);
  if (naoEncontrado) return;
  console.error("[LGPD] falha ao (des)bloquear usuário no Supabase Auth", error.status, error.code);
  throw erroStatus("Falha ao desativar o login no Supabase Auth. Nada foi alterado — tente novamente.", 502);
}

export type ResultadoAnonimizacaoMedico = {
  apelido: string;
  /** Motivo informado, sem e-mail/telefone/CNPJ/CPF/PIX do médico e sem números longos. */
  motivoLimpo: string;
  jaEstavaAnonimizado: boolean;
  loginSupabaseRemovido: boolean;
};

/**
 * Anonimização LGPD do médico pela administração.
 *
 * Ordem:
 *  1) checa pendências (rápido, sem efeito);
 *  2) BLOQUEIA (ban) o login no Supabase Auth — reversível;
 *  3) transação única: trava a linha do usuário (FOR UPDATE: inserções que
 *     referenciam o médico — consulta, repasse… — esperam por ela), checa as
 *     pendências DE NOVO e só então grava cofre + pseudônimo;
 *     se a transação falhar, o ban é desfeito e nada muda;
 *  4) remove o usuário do Supabase Auth (falha aqui só é registrada no log:
 *     o login já está banido e o vínculo `supabaseId` já saiu do banco).
 *
 * PRESERVADOS (FKs Restrict, #96): Consulta, Evolucao, Documento, Arquivo,
 * Mensagem, Avaliacao, Repasse/RepasseItem/RepasseAjuste (com a cópia do PIX
 * do momento do pagamento — fiscal), Pagamento, Reembolso, PedidoRenovacao.
 */
export async function anonimizarMedicoCompleto(medicoId: string, motivo = ""): Promise<ResultadoAnonimizacaoMedico> {
  const medico = await db.user.findFirst({
    where: { id: medicoId, role: "MEDICO" },
    include: { perfilMedico: true, dadosRecebimento: true },
  });
  if (!medico) throw erroStatus("Médico não encontrado.", 404);
  exigirChaveCofre();

  const motivosAntes = motivosBloqueioAnonimizacaoMedico(await pendenciasAnonimizacaoMedico(db, medicoId));
  if (motivosAntes.length) throw new PendenciasLgpdError(motivosAntes);

  const jaEstavaAnonimizado = estaAnonimizado(medico);
  // Nome e CRM NÃO viram código (Res. CFM 1.638/2002 e Lei 13.787/2018: o
  // prontuário, receitas e atestados mostram quem atendeu por 20 anos).
  // Ficam no User/PerfilMedico e também cifrados no cofre.
  const apelido = medico.nome;
  let emailAnon = medico.email;
  if (!jaEstavaAnonimizado) {
    const sufixo = crypto.randomBytes(3).toString("hex").toLowerCase();
    emailAnon = `anon-med-${sufixo}-${Date.now().toString(36)}@${DOMINIO_EMAIL_ANON}`;
  }

  const pm = medico.perfilMedico;
  const dr = medico.dadosRecebimento;
  const cpfTitular = dr && dr.titularTipo === "pf" ? dr.titularDocumento : "";
  const registroCofre = jaEstavaAnonimizado
    ? null
    : {
        userId: medicoId,
        dadosCifrados: cifrarIdentificacao(medicoId, {
          nome: medico.nome,
          cpf: cpfTitular,
          dataNascimento: pm?.dataNascimento ? pm.dataNascimento.toISOString().slice(0, 10) : null,
          crm: pm?.crm ?? "",
          cnpj: pm?.cnpj ?? "",
          telefone: pm?.telefone ?? "",
          email: medico.email,
          ...(dr
            ? {
                pixTipo: dr.pixTipo,
                pixChave: dr.pixChave,
                pixTitularTipo: dr.titularTipo,
                pixTitularNome: dr.titularNome,
                pixTitularDocumento: dr.titularDocumento,
              }
            : {}),
        }),
        cpfHash: hashCpf(cpfTitular),
        nomeHash: hashNome(medico.nome),
      };

  // Só os dados que saem do cadastro somem dos textos (nome e CRM ficam).
  const termos = [medico.email, pm?.telefone ?? "", pm?.cnpj ?? "", cpfTitular, dr?.pixChave ?? ""]
    .map((t) => t.trim())
    .filter((t) => t.length >= 5 && t !== medico.nome && t !== (pm?.crm ?? ""))
    .sort((a, b) => b.length - a.length);

  // (2) login bloqueado antes do banco (reversível).
  const supabaseId = medico.supabaseId;
  if (supabaseId) await banirSupabaseAuth(supabaseId, true);

  try {
    await db.$transaction(
      async (tx) => {
        await travarUsuario(tx, medicoId);
        const motivosTx = motivosBloqueioAnonimizacaoMedico(await pendenciasAnonimizacaoMedico(tx, medicoId));
        if (motivosTx.length) throw new PendenciasLgpdError(motivosTx);

        if (registroCofre) {
          await tx.identificacaoCofre.upsert({ where: { userId: medicoId }, create: registroCofre, update: {} });
        }

        await tx.user.update({
          where: { id: medicoId },
          data: {
            email: emailAnon,
            senhaHash: crypto.randomBytes(32).toString("hex"),
            status: "inativo",
            precisaTrocarSenha: false,
            supabaseId: null,
          },
        });
        await tx.perfilMedico.updateMany({
          where: { userId: medicoId },
          data: { ...DADOS_PERFIL_MEDICO_PSEUDONIMIZADO },
        });

        // Chave PIX e documento do titular saem do cadastro (o repasse já pago
        // guarda a própria cópia — obrigação fiscal).
        await tx.dadosRecebimentoMedico.deleteMany({ where: { medicoId } });
        // Fora da agenda / busca.
        await tx.bloqueioAgenda.deleteMany({ where: { medicoId } });

        // Consentimentos e auditoria mantêm nome e CRM (ligam o médico a atos
        // clínicos: prova por 20 anos). Saem só e-mail, telefone, CNPJ, CPF do
        // titular e chave PIX dos detalhes. Escopo por id.
        const logs = await tx.auditLog.findMany({
          where: { OR: [{ usuarioId: medicoId }, { entidadeId: medicoId }] },
          select: { id: true, usuarioNome: true, detalhes: true },
        });
        for (const l of logs) {
          const usuarioNome = substituirTermos(l.usuarioNome, termos, DADO_REMOVIDO_MEDICO);
          const detalhes = l.detalhes === null ? null : substituirTermos(l.detalhes, termos, DADO_REMOVIDO_MEDICO);
          if (usuarioNome !== l.usuarioNome || detalhes !== l.detalhes) {
            await tx.auditLog.update({ where: { id: l.id }, data: { usuarioNome, detalhes } });
          }
        }

        // Suporte (não clínico): tickets e mensagens com quem não é paciente.
        await tx.ticket.updateMany({
          where: { usuarioId: medicoId },
          data: { assunto: MARCADOR_LGPD, mensagem: MARCADOR_LGPD, resposta: MARCADOR_LGPD },
        });
        await tx.mensagem.updateMany({
          where: {
            OR: [
              { deId: medicoId, para: { role: { not: "PACIENTE" } } },
              { paraId: medicoId, de: { role: { not: "PACIENTE" } } },
            ],
          },
          data: { texto: MARCADOR_LGPD },
        });

        await tx.lembrete.deleteMany({ where: { usuarioId: medicoId } });
        await tx.notificacao.deleteMany({ where: { usuarioId: medicoId } });
        await tx.pushInscricao.deleteMany({ where: { usuarioId: medicoId } });
        await tx.sessao.deleteMany({ where: { userId: medicoId } });
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (supabaseId && !jaEstavaAnonimizado) {
      await desfazerBanOuRegistrarPendente(medicoId, supabaseId, "MEDICO");
    }
    throw e;
  }

  // (4) Remove do Auth; a conta já está banida e desvinculada.
  const loginSupabaseRemovido = supabaseId
    ? await removerAuthOuRegistrarPendente(medicoId, supabaseId, "MEDICO")
    : false;

  const motivoLimpo = removerNumerosLongosLocal(substituirTermos(motivo, termos, DADO_REMOVIDO_MEDICO));
  return { apelido, motivoLimpo, jaEstavaAnonimizado, loginSupabaseRemovido };
}
