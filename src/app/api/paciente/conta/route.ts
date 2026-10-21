import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { destruirSessao, exigirPapel, registrarAudit, verificarSenha } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { anonimizarPacienteCompleto } from "@/lib/server/lgpd";
import {
  JANELA_FALHAS_MS,
  MAX_FALHAS_SENHA,
  limitarAsync,
  obterIp,
  resetarAsync,
  resposta429,
  consultarAsync,
} from "@/lib/server/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/env";
import {
  STATUS_CONSULTA_ENCERRADA,
  STATUS_REEMBOLSO_ABERTO,
  STATUS_REMARCACAO_ABERTA,
  confirmacaoExclusaoValida,
  motivosBloqueioExclusao,
  type PendenciasExclusao,
} from "@/lib/exclusao-conta-logica";

/**
 * Exclusão da conta pelo PRÓPRIO paciente (LGPD art. 18, VI).
 *
 * - O id vem SÓ da sessão (nunca do corpo).
 * - Exige a palavra EXCLUIR e a senha atual (bcrypt legado ou Supabase Auth,
 *   igual a /api/auth/senha), com o mesmo limite de falhas.
 * - Recusa (409) com consulta ativa (futura ou em andamento), reembolso em
 *   aberto ou remarcação com multa pendente.
 * - Reusa SEM MUDANÇA a anonimização da administração
 *   (anonimizarPacienteCompleto): dados pessoais anonimizados, prontuário
 *   guardado sem nome (Lei 13.787/2018). Depois apaga as inscrições de push,
 *   registra na auditoria (só id/pseudônimo) e encerra a sessão.
 *
 * GET devolve as pendências, para a tela avisar antes de pedir a senha.
 */

async function pendenciasDe(pacienteId: string): Promise<PendenciasExclusao> {
  const [consultasAtivas, reembolsosAbertos, remarcacoesAbertas] = await Promise.all([
    db.consulta.count({
      where: { pacienteId, status: { notIn: [...STATUS_CONSULTA_ENCERRADA] } },
    }),
    db.reembolso.count({
      where: {
        status: { in: [...STATUS_REEMBOLSO_ABERTO] },
        OR: [
          { pagamento: { consulta: { pacienteId } } },
          { pagamento: { pedidoRenovacao: { pacienteId } } },
          { remarcacao: { consulta: { pacienteId } } },
        ],
      },
    }),
    db.remarcacaoPendente.count({
      where: { status: { in: [...STATUS_REMARCACAO_ABERTA] }, consulta: { pacienteId } },
    }),
  ]);
  return { consultasAtivas, reembolsosAbertos, remarcacoesAbertas };
}

export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const pendencias = await pendenciasDe(usuario.id);
    return ok({ pendencias, motivos: motivosBloqueioExclusao(pendencias) });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json().catch(() => ({}))) as { confirmacao?: unknown; senha?: unknown };

    if (!confirmacaoExclusaoValida(body.confirmacao)) {
      return Response.json({ erro: "Digite EXCLUIR para confirmar." }, { status: 400 });
    }
    const senha = typeof body.senha === "string" ? body.senha : "";
    if (!senha) {
      return Response.json({ erro: "Informe sua senha para confirmar." }, { status: 400 });
    }

    const chaveFalhas = `exclusao:falha:${usuario.id}:${obterIp(req)}`;
    if ((await consultarAsync(chaveFalhas, JANELA_FALHAS_MS)) >= MAX_FALHAS_SENHA) {
      return resposta429(JANELA_FALHAS_MS / 1000, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    }

    const user = await db.user.findUnique({ where: { id: usuario.id }, select: { email: true, senhaHash: true } });
    if (!user) return Response.json({ erro: "Usuário não encontrado." }, { status: 404 });
    let senhaOk = await verificarSenha(senha, user.senhaHash);
    if (!senhaOk && supabaseConfigurado() && user.email) {
      try {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
        senhaOk = !error;
      } catch {
        senhaOk = false;
      }
    }
    if (!senhaOk) {
      await limitarAsync(chaveFalhas, MAX_FALHAS_SENHA, JANELA_FALHAS_MS);
      return Response.json({ erro: "A senha está incorreta." }, { status: 401 });
    }
    await resetarAsync(chaveFalhas);

    const pendencias = await pendenciasDe(usuario.id);
    const motivos = motivosBloqueioExclusao(pendencias);
    if (motivos.length) {
      await registrarAudit(usuario, {
        acao: "PACIENTE_AUTOEXCLUSAO_BLOQUEADA",
        categoria: "usuario",
        severidade: "warning",
        entidade: "paciente",
        entidadeId: usuario.id,
        detalhes: `Pedido de exclusão recusado por pendências: ${JSON.stringify(pendencias)}`,
      });
      return Response.json({ erro: "Resolva as pendências antes de excluir a conta.", motivos, pendencias }, { status: 409 });
    }

    const r = await anonimizarPacienteCompleto(usuario.id);
    const push = await db.pushInscricao.deleteMany({ where: { usuarioId: usuario.id } });

    // Auditoria sem o nome real: usa o pseudônimo gerado na anonimização.
    await registrarAudit(
      { ...usuario, nome: r.apelido },
      {
        acao: "PACIENTE_AUTOEXCLUSAO_ANONIMIZADO",
        categoria: "usuario",
        severidade: "critical",
        entidade: "paciente",
        entidadeId: usuario.id,
        detalhes:
          `Exclusão pedida pelo próprio paciente id ${usuario.id} convertida em anonimização LGPD: ` +
          `login Supabase ${r.loginSupabaseRemovido ? "removido" : "inexistente"}; ` +
          `${r.arquivosPessoaisRemovidos} arquivo(s) pessoal(is) removido(s), ` +
          `${r.arquivosClinicosPreservados} clínico(s) preservado(s); ` +
          `${push.count} inscrição(ões) de push apagada(s); prontuário preservado (Lei 13.787/2018)`,
      },
    );

    await destruirSessao();
    return ok({ ok: true, redirecionar: "/entrar" });
  } catch (erro) {
    return falha(erro);
  }
}
