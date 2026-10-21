import type { UsuarioSessao } from "@/lib/server/auth";

/**
 * Auditoria LGPD sem o nome real do paciente: o AuditLog guarda o usuarioId
 * (vínculo) e um rótulo neutro com o id no lugar do nome.
 */
export function usuarioSemNome(u: UsuarioSessao): UsuarioSessao {
  return { ...u, nome: `Paciente ${u.id}` };
}
