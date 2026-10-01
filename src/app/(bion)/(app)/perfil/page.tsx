import { redirect } from "next/navigation";

/**
 * M7 (auditoria do perfil do paciente): a tela antiga de perfil
 * (PacientePerfilView) era inalcançável — o layout manda o paciente para
 * /paciente e os outros papéis para /painel — e tinha dados fixos/falsos
 * ("Verificado", "Aceito em 2025", "100% Atualizado", peso/altura padrão,
 * e-mail editável que o servidor ignorava). Foi removida; o perfil em uso é
 * o PerfilPainel do app /paciente. A URL continua existindo só como
 * redirecionamento (links antigos e scripts de smoke que visitam /perfil).
 */
export default function PaginaPerfil() {
  redirect("/paciente");
}
