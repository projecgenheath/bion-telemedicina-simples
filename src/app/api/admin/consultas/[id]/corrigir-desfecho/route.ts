import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  corrigirDesfecho,
  DESFECHOS_ALVO,
  MOTIVO_CORRECAO_MAX,
  MOTIVO_CORRECAO_MIN,
  previaCorrecaoDesfecho,
  ROTULO_DESFECHO,
  type Desfecho,
  type DesfechoAtual,
  type PlanoCorrecao,
} from "@/lib/server/financeiro";

/**
 * Correção de desfecho pelo ADMIN (regras do Alisson, 06/10/2026: só o admin
 * corrige o que o sistema ou o médico marcou).
 *
 * GET  /api/admin/consultas/[id]/corrigir-desfecho
 *      Prévia: desfecho atual e, para cada desfecho possível (realizada,
 *      falta_paciente, falha_tecnica, falta_medico), o plano com o efeito no
 *      dinheiro, ou o motivo da recusa. Nada é gravado.
 *
 * POST /api/admin/consultas/[id]/corrigir-desfecho
 *      { novo, motivo (10 a 1000 caracteres), esperado? }
 *      Grava pela corrigirDesfecho (financeiro.ts): evento antigo marcado como
 *      corrigido, desfecho novo por "admin", reembolso pendente encerrado,
 *      notificação ao paciente (e ao médico se mudar o repasse), auditoria
 *      antes/depois, numa transação. Repetir o mesmo pedido devolve
 *      `jaAplicado: true`. `esperado` diferente do atual → 409.
 * Acesso: só ADMIN (403 para médico e paciente).
 */

const rotulo = (d: DesfechoAtual) => ROTULO_DESFECHO[d];

function planoWire(p: PlanoCorrecao) {
  return {
    atual: p.atual,
    novo: p.novo,
    statusAntes: p.statusAntes,
    statusDepois: p.statusDepois,
    efeitos: p.efeitos,
    reembolsosEncerrados: p.reembolsosEncerrados,
    notificarMedico: p.notificarMedico,
    dinheiro: p.dinheiro,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirPapel("ADMIN");
    const { id } = await params;
    const [previa, c] = await Promise.all([
      previaCorrecaoDesfecho(id),
      db.consulta.findUnique({
        where: { id },
        select: {
          id: true,
          especialidade: true,
          dataInicio: true,
          status: true,
          pago: true,
          valor: true,
          medico: { select: { nome: true } },
          paciente: { select: { nome: true } },
        },
      }),
    ]);
    if (!previa || !c) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    return ok({
      consulta: {
        id: c.id,
        especialidade: c.especialidade,
        dataInicio: c.dataInicio.toISOString(),
        status: c.status,
        pago: c.pago,
        valor: c.valor,
        medico: c.medico.nome,
        paciente: c.paciente.nome,
      },
      atual: previa.atual,
      rotuloAtual: rotulo(previa.atual),
      motivoMin: MOTIVO_CORRECAO_MIN,
      motivoMax: MOTIVO_CORRECAO_MAX,
      opcoes: previa.opcoes.map((o) =>
        o.ok
          ? { novo: o.novo, rotulo: rotulo(o.novo), ok: true, plano: planoWire(o.plano) }
          : { novo: o.novo, rotulo: rotulo(o.novo), ok: false, erro: o.erro },
      ),
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { novo?: unknown; motivo?: unknown; esperado?: unknown } | null;
    const novo = body?.novo as Desfecho | undefined;
    if (!novo || !DESFECHOS_ALVO.includes(novo)) {
      return Response.json({ erro: `Informe novo: ${DESFECHOS_ALVO.map((d) => `"${d}"`).join(", ")}.` }, { status: 400 });
    }
    const motivo = typeof body?.motivo === "string" ? body.motivo : "";
    if (motivo.trim().length < MOTIVO_CORRECAO_MIN) {
      return Response.json({ erro: `Explique o motivo da correção (mínimo de ${MOTIVO_CORRECAO_MIN} caracteres).` }, { status: 400 });
    }
    const esperado = typeof body?.esperado === "string" && body.esperado in ROTULO_DESFECHO ? (body.esperado as DesfechoAtual) : undefined;
    const r = await corrigirDesfecho({ consultaId: id, novo, motivo, esperado, admin: { id: admin.id, nome: admin.nome } });
    if (!r.ok) return Response.json({ erro: r.erro }, { status: r.status });
    return ok({
      jaAplicado: r.jaAplicado,
      desfecho: novo,
      rotulo: rotulo(novo),
      status: r.status,
      plano: r.plano ? planoWire(r.plano) : null,
    });
  } catch (erro) {
    return falha(erro);
  }
}
