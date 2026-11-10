/**
 * Contatos da tela Mensagens para o ADMIN (auditoria admin 09/11): só quem
 * pode receber mensagem. O POST /api/mensagens já recusa destinatário cujo
 * login não está "ativo" (404) — arquivado, suspenso, inativo ou
 * anonimizado (LGPD). A lista do admin, montada no cliente a partir do
 * bootstrap (que precisa trazer todos para as abas Arquivados/Inativos),
 * mostrava esses cadastros como "Comece a conversa". Aqui saem:
 *  - médico arquivado ou suspenso (pendente fica: o admin fala com quem
 *    está em validação);
 *  - paciente que não está "ativo" (inativo ou anonimizado).
 */
export type ContatoAdmin = { id: string; nome: string; detalhe: string; suporte: false };

export function contatosMensagensAdmin(
  medicos: { id: string; nome: string; especialidade?: string; status?: string }[],
  pacientes: { id: string; nome: string; status?: string }[],
  meuId: string | undefined,
): ContatoAdmin[] {
  const lista: ContatoAdmin[] = [];
  for (const m of medicos) {
    if (m.id === meuId || m.status === "arquivado" || m.status === "suspenso") continue;
    lista.push({ id: m.id, nome: m.nome, detalhe: m.especialidade ?? "", suporte: false });
  }
  for (const p of pacientes) {
    if (p.id === meuId || (p.status !== undefined && p.status !== "ativo")) continue;
    lista.push({ id: p.id, nome: p.nome, detalhe: "Paciente", suporte: false });
  }
  return lista;
}
