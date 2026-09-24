import "server-only";
import crypto from "crypto";
import { db } from "@/lib/db";

/**
 * P1 (2026-09) — Anonimização LGPD COMPLETA (art. 12) de um paciente.
 *
 * Antes, "anonimizar" só limpava nome/e-mail/CPF/telefone e deixava para trás:
 * anamnese (triagem conversacional), mensagens do chat, documentos emitidos,
 * tickets de suporte, avaliações e o motivo livre das consultas. Tudo isso é
 * dado pessoal/identificável e precisa sair junto.
 *
 * Regra de ouro (CFM/prontuário): o registro NUNCA é destruído — os dados
 * clínicos consolidados permanecem (consultas, resumos médicos), mas despidos
 * de identificadores. Exclusão definitiva de prontuário não existe mais.
 *
 * Retorna o apelido gerado para auditoria.
 */

export const MARCADOR_LGPD = "[removido por anonimização LGPD (art. 12)]";

export async function anonimizarPacienteCompleto(pacienteId: string): Promise<string> {
  const paciente = await db.user.findFirst({
    where: { id: pacienteId, role: "PACIENTE" },
  });
  if (!paciente) {
    const err = new Error("Paciente não encontrado.") as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  const apelido = `Paciente Anonimizado ${sufixo}`;
  const emailAnon = `anon-${sufixo.toLowerCase()}-${Date.now().toString(36)}@anon.bion.app`;

  await db.$transaction(async (tx) => {
    // 1) Identidade: nome/e-mail substituídos, senha inutilizada, conta inativa.
    await tx.user.update({
      where: { id: pacienteId },
      data: {
        nome: apelido,
        email: emailAnon,
        senhaHash: crypto.randomBytes(32).toString("hex"),
        status: "inativo",
        precisaTrocarSenha: false,
      },
    });

    // 2) Perfil do paciente: todo campo identificável vai embora.
    await tx.perfilPaciente.updateMany({
      where: { userId: pacienteId },
      data: {
        cpf: "",
        telefone: "",
        idade: 0,
        genero: "",
        convenio: "Particular",
        alergias: "[]",
        medicamentos: "[]",
        comorbidades: "[]",
        tipoSanguineo: "",
        peso: null,
        altura: null,
        profissao: "",
        estadoCivil: "",
        foto: null,
      },
    });

    // 3) Anamnese (triagem conversacional): respostas e laudos anexados.
    await tx.anamnese.updateMany({
      where: { usuarioId: pacienteId },
      data: { coleta: "{}", documentos: "[]" },
    });

    // 4) Mensagens do chat (enviadas E recebidas).
    await tx.mensagem.updateMany({
      where: { OR: [{ deId: pacienteId }, { paraId: pacienteId }] },
      data: { texto: MARCADOR_LGPD },
    });

    // 5) Documentos (receitas/atestados/solicitações): conteúdo e metadados
    //    clínicos limpos; o registro permanece para rastreabilidade.
    await tx.documento.updateMany({
      where: { pacienteId },
      data: {
        titulo: "Documento anonimizado",
        conteudo: MARCADOR_LGPD,
        medicamento: null,
        posologia: null,
        duracao: null,
        observacoes: null,
        cid: null,
      },
    });

    // 6) Tickets de suporte (assunto, mensagem e resposta).
    await tx.ticket.updateMany({
      where: { usuarioId: pacienteId },
      data: { assunto: MARCADOR_LGPD, mensagem: MARCADOR_LGPD, resposta: MARCADOR_LGPD },
    });

    // 7) Avaliações: comentário livre é identificável.
    await tx.avaliacao.updateMany({
      where: { pacienteId },
      data: { comentario: null },
    });

    // 8) Consultas — PRONTUÁRIO PRESERVADO. Apenas o motivo (texto livre
    //    digitado pelo paciente) é removido; resumoMedico permanece.
    await tx.consulta.updateMany({
      where: { pacienteId },
      data: { motivoConsulta: null },
    });

    // 9) Arquivos enviados (laudos/fotos): metadado vai para o marcador.
    await tx.arquivo.updateMany({
      where: { usuarioId: pacienteId },
      data: { nome: MARCADOR_LGPD },
    });

    // 10) Sessões revogadas — a conta anonimizada não pode mais ser usada.
    await tx.sessao.deleteMany({ where: { userId: pacienteId } });
  });

  return apelido;
}
