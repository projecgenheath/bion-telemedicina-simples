/**
 * Regras do POST /api/tickets (abertura de chamado), puras e testáveis
 * (auditoria admin 09/11):
 *  - perfil vem do PAPEL da sessão: MEDICO → "medico", ADMIN → "admin",
 *    PACIENTE → "paciente" (antes, chamado aberto por admin era gravado
 *    como "paciente" e a Torre oferecia "Abrir ficha do paciente");
 *  - categoria só da lista da tela (CATEGORIAS_CHAMADO); ausente → "outro";
 *  - assunto e mensagem obrigatórios e com teto (a tela não tinha maxLength).
 */
import { CATEGORIAS_CHAMADO, RESPOSTA_MAX } from "@/components/bion/admin/suporte/chamados";

export const ASSUNTO_MAX = 150;
export const MENSAGEM_MAX = RESPOSTA_MAX; // 4000, o mesmo teto da resposta do suporte

export type PerfilChamado = "paciente" | "medico" | "admin";

export function perfilDoChamado(role: string): PerfilChamado {
  if (role === "MEDICO") return "medico";
  if (role === "ADMIN") return "admin";
  return "paciente";
}

export type ChamadoValidado =
  | { ok: true; assunto: string; mensagem: string; categoria: string }
  | { ok: false; erro: string; campo: "assunto" | "mensagem" | "categoria" };

export function validarNovoChamado(c: { assunto?: string; mensagem?: string; categoria?: string }): ChamadoValidado {
  const assunto = (c.assunto ?? "").trim();
  const mensagem = (c.mensagem ?? "").trim();
  if (!assunto || !mensagem) {
    return { ok: false, erro: "Informe assunto e mensagem do chamado.", campo: !assunto ? "assunto" : "mensagem" };
  }
  if (assunto.length > ASSUNTO_MAX) {
    return { ok: false, erro: `O assunto pode ter no máximo ${ASSUNTO_MAX} caracteres.`, campo: "assunto" };
  }
  if (mensagem.length > MENSAGEM_MAX) {
    return { ok: false, erro: `A mensagem pode ter no máximo ${MENSAGEM_MAX} caracteres.`, campo: "mensagem" };
  }
  const categoria = c.categoria === undefined || c.categoria === "" ? "outro" : c.categoria;
  if (!CATEGORIAS_CHAMADO.some((x) => x.id === categoria)) {
    return { ok: false, erro: "Categoria inválida.", campo: "categoria" };
  }
  return { ok: true, assunto, mensagem, categoria };
}
