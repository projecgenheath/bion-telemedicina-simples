import "server-only";
import { db } from "@/lib/db";

/**
 * M4 (auditoria do perfil do paciente) — unicidade do CPF entre pacientes,
 * checada na aplicação (sem migração obrigatória).
 *
 * Recebe o CPF JÁ VALIDADO e formatado por `validarCpf` ("000.000.000-00") e
 * procura em outro perfil tanto o formato mascarado quanto só os dígitos
 * (cadastros antigos gravavam sem máscara). A garantia definitiva contra
 * corrida (dois cadastros simultâneos) é o índice único parcial da migração
 * `supabase/migrations/20261001122959_perfil_paciente_cpf_unico.sql`
 * (B-32: comentário citava a migração com nome errado) — NÃO APLICADA em
 * nenhum ambiente até hoje; enquanto não for aplicada, a corrida segue
 * aberta (a checagem aqui é só na aplicação).
 */
export async function cpfEmUsoPorOutroPaciente(cpfFormatado: string, userIdAtual?: string): Promise<boolean> {
  if (!cpfFormatado) return false;
  const digitos = cpfFormatado.replace(/\D/g, "");
  const outro = await db.perfilPaciente.findFirst({
    where: {
      cpf: { in: [cpfFormatado, digitos] },
      ...(userIdAtual ? { userId: { not: userIdAtual } } : {}),
    },
    select: { id: true },
  });
  return outro !== null;
}

export const ERRO_CPF_EM_USO =
  "Este CPF já está vinculado a outra conta. Se ele é seu, fale com o suporte.";

export const ERRO_CPF_BLOQUEADO =
  "O CPF não pode ser alterado depois de cadastrado. Para corrigir, fale com o suporte.";
