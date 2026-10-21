import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { destruirSessao, exigirPapel, registrarAudit, verificarSenha } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import { anonimizarPacienteCompleto } from "@/lib/server/lgpd";
import {
  JANELA_FALHAS_MS,
  MAX_FALHAS_SENHA,
  limitarAsync,
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
  STATUS_RENOVACAO_ABERTA,
  STATUS_PAGAMENTO_PENDENTE,
  MENSAGEM_PEDIDO_REGISTRADO,
  PRAZO_CONCLUSAO_PEDIDO_DIAS,
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
 * - Com pendência (consulta ativa, reembolso em aberto ou falho, remarcação
 *   com multa, renovação em aberto, pagamento pendente) responde 409, mas o
 *   PEDIDO fica registrado na auditoria (EXCLUSAO_CONTA_SOLICITADA_PENDENTE,
 *   só id) para a BION concluir em até 15 dias (LGPD art. 19).
 * - Falha no meio da anonimização → EXCLUSAO_CONTA_FALHOU (só id) e erro claro.
 * - Reusa SEM MUDANÇA a anonimização da administração
 *   (anonimizarPacienteCompleto): dados pessoais anonimizados, prontuário
 *   guardado sem nome (Lei 13.787/2018). Depois apaga as inscrições de push,
 *   registra na auditoria (só id/pseudônimo) e encerra a sessão.
 *
 * GET devolve as pendências, para a tela avisar antes de pedir a senha.
 */

async function pendenciasDe(pacienteId: string): Promise<PendenciasExclusao> {
  const [consultasAtivas, reembolsosAbertos, remarcacoesAbertas, renovacoesAbertas, pagamentosPendentesSemConsulta] = await Promise.all([
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
    db.pedidoRenovacao.count({
      where: { pacienteId, status: { in: [...STATUS_RENOVACAO_ABERTA] } },
    }),
    // Pagamento pendente sem consulta = renovação por mensagem (vínculo por PedidoRenovacao.pagamento).
    db.pagamento.count({
      where: { consultaId: null, status: { in: [...STATUS_PAGAMENTO_PENDENTE] }, pedidoRenovacao: { pacienteId } },
    }),
  ]);
  return { consultasAtivas, reembolsosAbertos, remarcacoesAbertas, renovacoesAbertas, pagamentosPendentesSemConsulta };
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

    // Chave só pelo id (trocar de IP não dá tentativas novas).
    const chaveFalhas = `exclusao:falha:${usuario.id}`;
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
      // LGPD art. 19: o pedido fica registrado (só id) e a BION conclui em até
      // 15 dias depois que as pendências forem resolvidas (pelo painel do admin).
      await registrarAudit(usuarioSemNome(usuario), {
        acao: "EXCLUSAO_CONTA_SOLICITADA_PENDENTE",
        categoria: "usuario",
        severidade: "warning",
        entidade: "paciente",
        entidadeId: usuario.id,
        detalhes:
          `Paciente id ${usuario.id} pediu a exclusão da conta com pendências ${JSON.stringify(pendencias)}. ` +
          `Concluir pelo painel LGPD em até ${PRAZO_CONCLUSAO_PEDIDO_DIAS} dias após resolvidas (LGPD art. 19).`,
      });
      return Response.json(
        { erro: MENSAGEM_PEDIDO_REGISTRADO, pedidoRegistrado: true, motivos, pendencias },
        { status: 409 },
      );
    }

    // Push antes da anonimização: se falhar aqui, nada foi alterado ainda.
    const push = await db.pushInscricao.deleteMany({ where: { usuarioId: usuario.id } });

    // anonimizarPacienteCompleto remove o login do Supabase ANTES da transação
    // do banco. Se algo falhar, o paciente pode ter perdido o login sem os
    // dados anonimizados: registra (só id) para o admin concluir pelo painel.
    let r: Awaited<ReturnType<typeof anonimizarPacienteCompleto>>;
    try {
      r = await anonimizarPacienteCompleto(usuario.id);
    } catch (e) {
      console.error("[exclusao-conta] anonimização falhou", (e as Error)?.message);
      await registrarAudit(usuarioSemNome(usuario), {
        acao: "EXCLUSAO_CONTA_FALHOU",
        categoria: "usuario",
        severidade: "critical",
        entidade: "paciente",
        entidadeId: usuario.id,
        detalhes: `Exclusão pedida pelo paciente id ${usuario.id} falhou no meio. Concluir pela anonimização do painel LGPD.`,
      });
      await destruirSessao().catch(() => {});
      return Response.json(
        {
          erro:
            `Não consegui concluir a exclusão agora, mas o seu pedido ficou registrado. ` +
            `A equipe da BION vai concluir em até ${PRAZO_CONCLUSAO_PEDIDO_DIAS} dias. Se precisar, fale com o suporte.`,
          pedidoRegistrado: true,
        },
        { status: 500 },
      );
    }

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
