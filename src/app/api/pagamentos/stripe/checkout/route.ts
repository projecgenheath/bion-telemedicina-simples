import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { aceiteVigentePendente } from "@/lib/server/aceite-termos";
import { falha } from "@/lib/server/http";
import { criarCobranca } from "@/lib/server/pagamentos";
import { comissaoPlataformaConnect, gatewayCheckout } from "@/lib/server/gateway-pagamento";
import { modoCobrancaStripe, stripeConnectAtivo } from "@/lib/server/stripe";
import {
  avaliarElegibilidade,
  bloqueioChaveLive,
  chaveIdempotencia,
  metodosCheckout,
  moedaCheckout,
  type DadosConnect,
  sessaoReaproveitavel,
  stripeAtivo,
} from "@/lib/stripe-checkout-logica";

/**
 * Checkout do paciente (Stripe), atrás da flag BION_PAGAMENTO_STRIPE=true.
 *
 * POST { consultaId } → { url } da sessão de Checkout (reaproveita a aberta).
 *   O valor vem SEMPRE do banco. Esta rota NUNCA marca nada como pago: só o
 *   webhook /api/pagamentos/stripe/webhook confirma.
 * GET ?consultaId= → { ativo, status, pago } para as telas de sucesso/cancelado
 *   (o paciente dono acompanha a confirmação do webhook).
 */

const ERRO_ACEITE = "Para pedir uma nova consulta ou renovação, aceite os termos atualizados.";

const selecaoConsulta = {
  id: true,
  pacienteId: true,
  status: true,
  pago: true,
  valor: true,
  tipoAtendimento: true,
  especialidade: true,
  medicoId: true,
  medico: { select: { nome: true } },
  pagamento: { select: { id: true, status: true, gatewayRef: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const ativo = stripeAtivo();
    const consultaId = req.nextUrl.searchParams.get("consultaId");
    if (!consultaId) return Response.json({ ativo });
    const usuario = await exigirSessao();
    const c = await db.consulta.findUnique({ where: { id: consultaId }, select: { pacienteId: true, status: true, pago: true } });
    if (!c || c.pacienteId !== usuario.id) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    return Response.json({ ativo, status: c.status, pago: c.pago });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!stripeAtivo()) {
      return Response.json({ erro: "Pagamento online indisponível neste ambiente.", ativo: false }, { status: 404 });
    }
    const usuario = await exigirSessao();
    if (usuario.role !== "PACIENTE") {
      return Response.json({ erro: "Só o paciente da consulta pode pagar." }, { status: 403 });
    }
    let pendente = true;
    try {
      pendente = await aceiteVigentePendente(usuario.id, "PACIENTE");
    } catch {
      pendente = true; // falha fechada
    }
    if (pendente) return Response.json({ erro: ERRO_ACEITE, codigo: "ACEITE_TERMOS_PENDENTE" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { consultaId?: unknown };
    const consultaId = typeof body.consultaId === "string" ? body.consultaId : "";
    const c = await db.consulta.findUnique({ where: { id: consultaId }, select: selecaoConsulta });
    const eleg = avaliarElegibilidade(c, usuario.id);
    if (!eleg.ok) return Response.json({ erro: eleg.erro }, { status: eleg.status });
    const consulta = c!;

    // Cobrança "pendente" (idempotente por consulta), com o valor do banco.
    const cobranca = await criarCobranca(consulta.id, consulta.valor, "cartao");
    const atual = await db.pagamento.findUnique({
      where: { id: cobranca.id },
      select: { id: true, status: true, stripeCheckoutSessionId: true },
    });
    const sessaoAnterior = atual?.stripeCheckoutSessionId ?? null;

    // Modo de cobrança (plataforma por padrão; Connect só com STRIPE_CONNECT=true).
    const modo = stripeConnectAtivo() ? modoCobrancaStripe() : "plataforma";
    if (bloqueioChaveLive(modo)) {
      await registrarAudit(usuario, {
        acao: "CHECKOUT_STRIPE_BLOQUEADO_CHAVE_LIVE",
        categoria: "pagamento",
        severidade: "critical",
        entidade: "consulta",
        entidadeId: consulta.id,
        detalhes: "Modo plataforma com chave live: cobrança recusada (exigência jurídica; use o modo direta)",
      });
      console.error("[checkout-stripe] modo plataforma com chave live recusado");
      return Response.json({ erro: "Pagamento online indisponível no momento.", codigo: "pagamento_indisponivel" }, { status: 503 });
    }
    let connect: DadosConnect | null = null;
    if (modo !== "plataforma") {
      const medico = await db.perfilMedico.findUnique({ where: { userId: consulta.medicoId }, select: { stripeAccountId: true } });
      if (!medico?.stripeAccountId) {
        return Response.json({ erro: "Pagamento online indisponível para este médico." }, { status: 409 });
      }
      try {
        connect = { contaMedico: medico.stripeAccountId, taxaPlataformaCentavos: comissaoPlataformaConnect(eleg.valorCentavos) };
      } catch {
        return Response.json({ erro: "Pagamento online indisponível neste ambiente." }, { status: 503 });
      }
    }

    const gateway = gatewayCheckout();
    const contaDireta = modo === "direta" ? connect?.contaMedico : null;
    if (sessaoAnterior) {
      const s = await gateway.lerSessao(sessaoAnterior, contaDireta);
      if (s && sessaoReaproveitavel(s, eleg.valorCentavos)) return Response.json({ url: s.url, reaproveitada: true });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
    const sessao = await gateway.criarSessao(
      {
        consultaId: consulta.id,
        pacienteId: usuario.id,
        pagamentoId: cobranca.id,
        valorCentavos: eleg.valorCentavos,
        moeda: moedaCheckout(),
        metodos: metodosCheckout(),
        descricao: `Teleconsulta BION — ${consulta.especialidade} com ${consulta.medico.nome}`,
        baseUrl: base,
        email: usuario.email,
        modo,
        connect,
      },
      chaveIdempotencia(consulta.id, eleg.valorCentavos, sessaoAnterior),
    );
    await db.pagamento.update({
      where: { id: cobranca.id },
      // Tentativa nova depois de falha (ex.: Pix expirado) volta a "pendente".
      data: { stripeCheckoutSessionId: sessao.id, ...(atual?.status === "falhou" ? { status: "pendente" } : {}) },
    });
    await registrarAudit(usuario, {
      acao: "CHECKOUT_STRIPE_CRIADO",
      categoria: "pagamento",
      entidade: "consulta",
      entidadeId: consulta.id,
      detalhes: `Sessão de checkout aberta (${eleg.valorCentavos} centavos)`,
    });
    return Response.json({ url: sessao.url });
  } catch (erro) {
    return falha(erro);
  }
}

