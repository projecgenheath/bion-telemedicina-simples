/**
 * Tentativas já atendidas em segundo plano por quem está na sala da mesma
 * consulta (ChamadaRecebida). Garante UM POST por usuário+consulta+tentativa,
 * inclusive com o efeito duplo do StrictMode.
 *
 * Chave `usuarioId:consultaId:tentativa`. O registro é do usuário da sessão:
 * troca de usuário (ou logout, usuário null) limpa tudo.
 */
const MAX = 200;
let dono: string | null = null;
const atendidas = new Set<string>();

/** Usuário da sessão mudou (login de outra conta) ou saiu (null): limpa. */
export function sincronizarUsuarioAtendidasNaSala(usuarioId: string | null | undefined): void {
  const novo = usuarioId || null;
  if (novo === dono) return;
  atendidas.clear();
  dono = novo;
}

/**
 * Marca a tentativa. true = primeira vez (pode fazer o POST); false = já
 * feita, ou sem usuário (não dispara).
 */
export function marcarAtendidaNaSala(usuarioId: string | null | undefined, consultaId: string, tentativa: number): boolean {
  if (!usuarioId) return false;
  sincronizarUsuarioAtendidasNaSala(usuarioId);
  const chave = `${usuarioId}:${consultaId}:${tentativa}`;
  if (atendidas.has(chave)) return false;
  atendidas.add(chave);
  if (atendidas.size > MAX) {
    const primeira = atendidas.values().next().value;
    if (primeira !== undefined) atendidas.delete(primeira);
  }
  return true;
}

/** Só para testes. */
export function _atendidasNaSala(): { dono: string | null; chaves: string[] } {
  return { dono, chaves: [...atendidas] };
}
