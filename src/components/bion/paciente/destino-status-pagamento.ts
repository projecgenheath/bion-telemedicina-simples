/**
 * Destino do botão "Ver minhas consultas" da tela de status do pagamento
 * (StatusPagamentoStripe). Vai direto para a lista de consultas do app do
 * paciente; /consultas é rota do layout compartilhado e manda o paciente para
 * o Início. O deep link "consultas" é tratado no PacienteApp.
 */
export const TELA_CONSULTAS_PACIENTE = "consultas";
export const DESTINO_VER_CONSULTAS_PAGAMENTO = `/paciente?tela=${TELA_CONSULTAS_PACIENTE}`;
