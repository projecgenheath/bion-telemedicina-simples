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
  avaliarMulta,
  sessaoDaMulta,
  PREFIXO_SESSAO_MULTA,
  avaliarPagamentoAvulso,
  expiracaoReservaSeg,
  type TipoCobranca,
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
 * POST { consultaId } | { pagamentoId } | { remarcacaoId } → { url } da sessão
 *   de Checkout (reaproveita a aberta). Só cartão, nunca Pix:
 *   - consultaId: a consulta (ou, se for a consulta nova da espera do médico,
 *     a diferença da remarcação);
 *   - pagamentoId: renovação de receita (Pagamento sem consulta,
 *     "renovacao:<pedido>") ou diferença da espera ("espera:<espera>");
 *   - remarcacaoId: multa da remarcação com ≤24 h (sem Pagamento).
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

    const body = (await req.json().catch(() => ({}))) as { consultaId?: unknown; pagamentoId?: unknown; remarcacaoId?: unknown };
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
    if (typeof body.remarcacaoId === "string" && body.remarcacaoId) {
      return await checkoutMulta(usuario, body.remarcacaoId, base);
    }
    if (typeof body.pagamentoId === "string" && body.pagamentoId) {
      return await checkoutAvulso(usuario, body.pagamentoId, base);
    }
    const consultaId = typeof body.consultaId === "string" ? body.consultaId : "";
    const c = await db.consulta.findUnique({ where: { id: consultaId }, select: selecaoConsulta });
    // Consulta nova da espera do médico: paga a diferença pelo Pagamento dela.
    if (c?.pagamento?.gatewayRef?.startsWith("espera:")) return await checkoutAvulso(usuario, c.pagamento.id, base);
    const eleg = avaliarElegibilidade(c, usuario.id);
    if (!eleg.ok) return Response.json({ erro: eleg.erro }, { status: eleg.status });
    const consulta = c!;

    // Cobrança "pendente" (idempotente por consulta), com o valor do banco.
    const cobranca = await criarCobranca(consulta.id, consulta.valor, "cartao");
    return await abrirSessao(usuario, {
      tipo: "consulta",
      consultaId: consulta.id,
      pagamentoId: cobranca.id,
      remarcacaoId: null,
      medicoId: consulta.medicoId,
      valorCentavos: eleg.valorCentavos,
      descricao: `Teleconsulta BION — ${consulta.especialidade} com ${consulta.medico.nome}`,
      entidade: { tipo: "consulta", id: consulta.id },
      base,
    });
  } catch (erro) {
    return falha(erro);
  }
}

type Usuario = Awaited<ReturnType<typeof exigirSessao>>;

type Alvo = {
  tipo: TipoCobranca;
  consultaId: string | null;
  pagamentoId: string | null;
  remarcacaoId: string | null;
  medicoId: string;
  valorCentavos: number;
  descricao: string;
  entidade: { tipo: string; id: string };
  base: string;
  expiraEmSeg?: number | null;
  /** Só na multa: sessão já aberta (RemarcacaoPendente.gatewayRef "stripe_cs:<id>"). */
  sessaoMulta?: string | null;
};

/**
 * Renovação de receita (Pagamento sem consulta, "renovacao:<pedido>") ou
 * diferença da remarcação da espera do médico ("espera:<espera>"), por cartão.
 */
async function checkoutAvulso(usuario: Usuario, pagamentoId: string, base: string) {
  const p = await db.pagamento.findUnique({
    where: { id: pagamentoId },
    select: {
      id: true,
      status: true,
      valor: true,
      gatewayRef: true,
      pedidoRenovacao: { select: { pacienteId: true, status: true, medicoId: true } },
      consulta: { select: { id: true, pacienteId: true, status: true, medicoId: true, especialidade: true, medico: { select: { nome: true } } } },
    },
  });
  const esperaId = p?.gatewayRef?.startsWith("espera:") ? p.gatewayRef.slice("espera:".length) : null;
  const espera = esperaId
    ? await db.esperaMedico.findUnique({ where: { id: esperaId }, select: { status: true, reservaExpiraEm: true, consultaNovaId: true } })
    : null;
  const eleg = avaliarPagamentoAvulso(
    p
      ? {
          id: p.id,
          status: p.status,
          valor: p.valor,
          gatewayRef: p.gatewayRef,
          pedidoRenovacao: p.pedidoRenovacao,
          consulta: p.consulta,
          // A espera só vale se a consulta nova dela for a deste pagamento.
          espera: espera && espera.consultaNovaId === p.consulta?.id
            ? { status: espera.status, reservaExpiraEmMs: espera.reservaExpiraEm?.getTime() ?? null }
            : null,
        }
      : null,
    usuario.id,
  );
  if (!eleg.ok) return Response.json({ erro: eleg.erro }, { status: eleg.status });
  const pg = p!;
  if (eleg.tipo === "renovacao") {
    return abrirSessao(usuario, {
      tipo: "renovacao",
      consultaId: null,
      pagamentoId: pg.id,
      remarcacaoId: null,
      medicoId: pg.pedidoRenovacao!.medicoId,
      valorCentavos: eleg.valorCentavos,
      descricao: "Renovação de receita BION",
      entidade: { tipo: "pedido_renovacao", id: pg.gatewayRef!.slice("renovacao:".length) },
      base,
    });
  }
  const c = pg.consulta!;
  return abrirSessao(usuario, {
    tipo: "espera",
    consultaId: c.id,
    pagamentoId: pg.id,
    remarcacaoId: null,
    medicoId: c.medicoId,
    valorCentavos: eleg.valorCentavos,
    descricao: `Diferença da remarcação BION — ${c.especialidade} com ${c.medico.nome}`,
    entidade: { tipo: "consulta", id: c.id },
    base,
    expiraEmSeg: expiracaoReservaSeg(),
  });
}

/** Multa da remarcação com ≤24 h (RemarcacaoPendente, sem Pagamento), por cartão. */
async function checkoutMulta(usuario: Usuario, remarcacaoId: string, base: string) {
  const r = await db.remarcacaoPendente.findUnique({
    where: { id: remarcacaoId },
    select: {
      id: true,
      status: true,
      multaCentavos: true,
      expiraEm: true,
      gatewayRef: true,
      consulta: { select: { id: true, pacienteId: true, medicoId: true, especialidade: true, medico: { select: { nome: true } } } },
    },
  });
  const eleg = avaliarMulta(r ? { id: r.id, status: r.status, multaCentavos: r.multaCentavos, expiraEmMs: r.expiraEm.getTime(), consulta: r.consulta } : null, usuario.id);
  if (!eleg.ok) return Response.json({ erro: eleg.erro }, { status: eleg.status });
  const rem = r!;
  return abrirSessao(usuario, {
    tipo: "multa",
    consultaId: null,
    pagamentoId: null,
    remarcacaoId: rem.id,
    medicoId: rem.consulta.medicoId,
    valorCentavos: eleg.valorCentavos,
    descricao: `Taxa de remarcação BION — ${rem.consulta.especialidade} com ${rem.consulta.medico.nome}`,
    entidade: { tipo: "consulta", id: rem.consulta.id },
    base,
    expiraEmSeg: expiracaoReservaSeg(),
    // 2º clique: reaproveita a sessão aberta (a chave de idempotência é a mesma,
    // mas expires_at mudaria e o Stripe recusaria com 400).
    sessaoMulta: sessaoDaMulta(rem.gatewayRef),
  });
}

/** Abre (ou reaproveita) a sessão de Checkout de qualquer cobrança do paciente. */
async function abrirSessao(usuario: Usuario, a: Alvo) {
  // Sessão anterior: só quem tem Pagamento guarda (a multa usa a chave por remarcação).
  const atual = a.pagamentoId
    ? await db.pagamento.findUnique({ where: { id: a.pagamentoId }, select: { id: true, status: true, stripeCheckoutSessionId: true } })
    : null;
  const sessaoAnterior = a.tipo === "multa" ? a.sessaoMulta ?? null : atual?.stripeCheckoutSessionId ?? null;

  // Modo de cobrança (plataforma por padrão; Connect só com STRIPE_CONNECT=true).
  const modo = stripeConnectAtivo() ? modoCobrancaStripe() : "plataforma";
  if (bloqueioChaveLive(modo)) {
    await registrarAudit(usuario, {
      acao: "CHECKOUT_STRIPE_BLOQUEADO_CHAVE_LIVE",
      categoria: "pagamento",
      severidade: "critical",
      entidade: a.entidade.tipo,
      entidadeId: a.entidade.id,
      detalhes: "Modo plataforma com chave live: cobrança recusada (exigência jurídica; use o modo direta)",
    });
    console.error("[checkout-stripe] modo plataforma com chave live recusado");
    return Response.json({ erro: "Pagamento online indisponível no momento.", codigo: "pagamento_indisponivel" }, { status: 503 });
  }
  let connect: DadosConnect | null = null;
  if (modo !== "plataforma") {
    const medico = await db.perfilMedico.findUnique({ where: { userId: a.medicoId }, select: { stripeAccountId: true } });
    if (!medico?.stripeAccountId) {
      return Response.json({ erro: "Pagamento online indisponível para este médico." }, { status: 409 });
    }
    try {
      connect = { contaMedico: medico.stripeAccountId, taxaPlataformaCentavos: comissaoPlataformaConnect(a.valorCentavos) };
    } catch {
      return Response.json({ erro: "Pagamento online indisponível neste ambiente." }, { status: 503 });
    }
  }

  const gateway = gatewayCheckout();
  const contaDireta = modo === "direta" ? connect?.contaMedico : null;
  if (sessaoAnterior) {
    const s = await gateway.lerSessao(sessaoAnterior, contaDireta);
    if (s && sessaoReaproveitavel(s, a.valorCentavos)) return Response.json({ url: s.url, reaproveitada: true });
  }

  const sessao = await gateway.criarSessao(
    {
      consultaId: a.consultaId,
      pacienteId: usuario.id,
      pagamentoId: a.pagamentoId,
      tipo: a.tipo,
      remarcacaoId: a.remarcacaoId,
      expiraEmSeg: a.expiraEmSeg ?? null,
      valorCentavos: a.valorCentavos,
      moeda: moedaCheckout(),
      metodos: metodosCheckout(),
      descricao: a.descricao,
      baseUrl: a.base,
      email: usuario.email,
      modo,
      connect,
    },
    chaveIdempotencia(a.tipo === "multa" ? `multa-${a.remarcacaoId}` : a.consultaId ?? `pagamento-${a.pagamentoId}`, a.valorCentavos, sessaoAnterior),
  );
  if (a.pagamentoId) {
    await db.pagamento.update({
      where: { id: a.pagamentoId },
      // Tentativa nova depois de falha volta a "pendente" (na espera, a falha
      // libera a reserva e o checkout já recusou antes de chegar aqui).
      data: { stripeCheckoutSessionId: sessao.id, ...(atual?.status === "falhou" ? { status: "pendente" } : {}) },
    });
  }
  if (a.tipo === "multa" && a.remarcacaoId) {
    // Guarda a sessão aberta (só enquanto pendente; o webhook troca por stripe_pi:).
    await db.remarcacaoPendente.updateMany({
      where: { id: a.remarcacaoId, status: "pendente" },
      data: { gatewayRef: `${PREFIXO_SESSAO_MULTA}${sessao.id}` },
    });
  }
  await registrarAudit(usuario, {
    acao: "CHECKOUT_STRIPE_CRIADO",
    categoria: "pagamento",
    entidade: a.entidade.tipo,
    entidadeId: a.entidade.id,
    detalhes: `Sessão de checkout aberta (${a.tipo}, ${a.valorCentavos} centavos)`,
  });
  return Response.json({ url: sessao.url });
}
