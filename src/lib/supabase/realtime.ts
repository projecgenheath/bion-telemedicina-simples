/**
 * Canais Realtime BION (convenção de nomes).
 * O front assina com createSupabaseBrowserClient().channel(...).
 */
export const canalMensagensUsuario = (userId: string) => `mensagens:user:${userId}`;
export const canalSalaConsulta = (consultaId: string) => `sala:consulta:${consultaId}`;
export const canalNotificacoes = (userId: string) => `notificacoes:user:${userId}`;
