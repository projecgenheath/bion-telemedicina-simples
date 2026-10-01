import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { UsuarioSessao } from "./auth";
import { idCuid, isErro } from "./validar";

/**
 * A3/A4 (auditoria 2026-09) — FONTE ÚNICA da regra de acesso a `Arquivo`.
 * Usada tanto na LISTAGEM (carregarDados → bootstrap/estado fresco) quanto
 * no DOWNLOAD (GET /api/arquivos?id=): o que aparece na lista é exatamente o
 * que pode ser baixado, e vice-versa.
 *
 * - ADMIN: todos.
 * - PACIENTE: os que ele enviou OU destinados a ele (pacienteId).
 * - MÉDICO: os que ele enviou, OU enviados por um paciente com quem ele
 *   tem/teve consulta, OU destinados (pacienteId) a um paciente com quem ele
 *   tem/teve consulta — assim um 2º médico do mesmo paciente abre exames
 *   enviados a esse paciente por outro médico.
 * - Qualquer outro papel: nenhum.
 *
 * "Consulta" = qualquer status (mesma regra de idsPacientesDoMedico).
 */
export function whereArquivosVisiveis(
  usuario: Pick<UsuarioSessao, "id" | "role">,
): Prisma.ArquivoWhereInput {
  if (usuario.role === "ADMIN") return {};
  if (usuario.role === "PACIENTE") {
    return { OR: [{ usuarioId: usuario.id }, { pacienteId: usuario.id }] };
  }
  if (usuario.role === "MEDICO") {
    const pacienteDoMedico: Prisma.UserWhereInput = {
      consultasComoPaciente: { some: { medicoId: usuario.id } },
    };
    return {
      OR: [
        { usuarioId: usuario.id },
        { usuario: pacienteDoMedico },
        { paciente: pacienteDoMedico },
      ],
    };
  }
  return { id: { in: [] } };
}

/** O usuário pode ver/baixar este arquivo? (mesma regra da listagem) */
export async function podeAcessarArquivo(
  usuario: Pick<UsuarioSessao, "id" | "role">,
  arquivoId: string,
): Promise<boolean> {
  const row = await db.arquivo.findFirst({
    where: { AND: [{ id: arquivoId }, whereArquivosVisiveis(usuario)] },
    select: { id: true },
  });
  return row !== null;
}

/** O paciente informado é PACIENTE e tem/teve consulta com este médico? */
export async function pacienteVinculadoAoMedico(medicoId: string, pacienteId: string): Promise<boolean> {
  const c = await db.consulta.findFirst({
    where: { medicoId, pacienteId, paciente: { role: "PACIENTE" } },
    select: { id: true },
  });
  return c !== null;
}

export type DestinoUpload =
  | { ok: true; pacienteId: string | null }
  | { ok: false; status: 400 | 403 | 404; erro: string };

const vazio = (v: unknown) => v === undefined || v === null || v === "";

/**
 * A3 — destinatário (Arquivo.pacienteId) de um upload, resolvido e validado
 * NO SERVIDOR (POST /api/arquivos). Campos opcionais do cliente:
 * `pacienteId` e/ou `consultaId`.
 * - PACIENTE: sempre ele mesmo (valores do cliente são ignorados).
 * - MÉDICO: com `consultaId`, a consulta precisa ser DELE e o paciente vem
 *   dela; com `pacienteId`, precisa ter/ter tido consulta com esse paciente;
 *   com os dois, precisam coincidir. Sem nenhum → pacienteId NULL
 *   (comportamento anterior preservado; visível só ao médico e ao admin).
 * - ADMIN: opcional; a consulta precisa existir / o paciente precisa ser PACIENTE.
 * - Outros papéis: NULL.
 */
export async function resolverDestinoUpload(
  usuario: Pick<UsuarioSessao, "id" | "role">,
  pacienteBruto: unknown,
  consultaBruta: unknown,
): Promise<DestinoUpload> {
  if (usuario.role === "PACIENTE") return { ok: true, pacienteId: usuario.id };
  if (usuario.role !== "MEDICO" && usuario.role !== "ADMIN") return { ok: true, pacienteId: null };

  let pacienteId: string | null = null;
  if (!vazio(pacienteBruto)) {
    const id = idCuid(pacienteBruto, "pacienteId");
    if (isErro(id)) return { ok: false, status: 400, erro: id.erro };
    pacienteId = id;
  }

  if (!vazio(consultaBruta)) {
    const consultaId = idCuid(consultaBruta, "consultaId");
    if (isErro(consultaId)) return { ok: false, status: 400, erro: consultaId.erro };
    const consulta = await db.consulta.findUnique({
      where: { id: consultaId },
      select: { medicoId: true, pacienteId: true },
    });
    if (!consulta) return { ok: false, status: 404, erro: "Consulta não encontrada." };
    if (usuario.role === "MEDICO" && consulta.medicoId !== usuario.id) {
      return { ok: false, status: 403, erro: "Esta consulta não é sua." };
    }
    if (pacienteId && pacienteId !== consulta.pacienteId) {
      return { ok: false, status: 400, erro: "pacienteId não corresponde ao paciente da consulta." };
    }
    return { ok: true, pacienteId: consulta.pacienteId };
  }

  if (!pacienteId) return { ok: true, pacienteId: null };
  if (usuario.role === "MEDICO") {
    if (!(await pacienteVinculadoAoMedico(usuario.id, pacienteId))) {
      return {
        ok: false,
        status: 403,
        erro: "Você só pode enviar arquivos a pacientes com quem tem consulta.",
      };
    }
    return { ok: true, pacienteId };
  }
  const paciente = await db.user.findFirst({
    where: { id: pacienteId, role: "PACIENTE" },
    select: { id: true },
  });
  if (!paciente) return { ok: false, status: 400, erro: "Paciente não encontrado." };
  return { ok: true, pacienteId };
}
