import { NextRequest } from "next/server";
import { instanteNoFuso, partesNoFuso } from "@/lib/server/fuso";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, exameWire } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";
import { registrarAudit } from "@/lib/server/auth";

/**
 * Exames laboratoriais do paciente (app imersivo — seção 3).
 *
 * GET    — lista do próprio paciente.
 * POST   — cadastro manual: { titulo, dataColeta, itens: [{nome, valor, unidade, refMin?, refMax?}] }.
 * DELETE — remove: { id }.
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const exames = await db.exameLaboratorial.findMany({
      where: { usuarioId: usuario.id },
      // B7: desc — com asc+take 200 o paciente com >200 exames nunca via os
      // mais recentes (justamente os relevantes).
      orderBy: { dataColeta: "desc" },
      take: 200,
    });
    return ok({
      exames: exames.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        dataColeta: e.dataColeta.toISOString(),
        itens: JSON.parse(e.itens || "[]"),
        arquivoNome: e.arquivoNome ?? undefined,
        origem: e.origem,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

type ItemExame = { nome: string; valor: number; unidade: string; refMin?: number; refMax?: number };

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    // B1: guarda de objeto/tipo antes de qualquer .trim()/.slice().
    const bruto = corpoObjeto(await lerCorpoJson(req));
    if (!bruto) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const body = {
      titulo: textoDoCorpo(bruto.titulo),
      dataColeta: textoDoCorpo(bruto.dataColeta),
      itens: Array.isArray(bruto.itens) ? (bruto.itens as ItemExame[]) : undefined,
    };

    const titulo = (body.titulo ?? "").trim();
    if (!titulo || !Array.isArray(body.itens) || !body.itens.length) {
      return Response.json({ erro: "Informe o título do exame e ao menos um resultado." }, { status: 400 });
    }
    const itensValidos = body.itens.filter(
      (i) => i?.nome && Number.isFinite(Number(i.valor)),
    );
    if (!itensValidos.length) {
      return Response.json({ erro: "Nenhum resultado válido informado." }, { status: 400 });
    }

    // Fuso: "AAAA-MM-DD" puro seria meia-noite UTC (= dia anterior em São
    // Paulo); data sem hora vira meio-dia no fuso da clínica.
    // B6: dataColeta inválida era gravada como "agora" e data futura era
    // aceita — agora ambas são 400. Ausente continua sendo "agora".
    const soData = typeof body.dataColeta === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.dataColeta) : null;
    const dataColeta = soData
      ? instanteNoFuso(+soData[1], +soData[2], +soData[3], 12, 0)
      : body.dataColeta
        ? new Date(body.dataColeta)
        : new Date();
    if (Number.isNaN(dataColeta.getTime())) {
      return Response.json({ erro: "Data de coleta inválida." }, { status: 400 });
    }
    // Data-only de HOJE (fuso da clínica) não é futura, embora o instante
    // gravado seja o meio-dia local; com hora, qualquer instante futuro é.
    const hojeSp = partesNoFuso(new Date());
    const ehHojeSoData =
      soData !== null && +soData[1] === hojeSp.ano && +soData[2] === hojeSp.mes && +soData[3] === hojeSp.dia;
    if (!ehHojeSoData && dataColeta.getTime() > Date.now()) {
      return Response.json({ erro: "Data de coleta não pode ser futura." }, { status: 400 });
    }

    const exame = await db.exameLaboratorial.create({
      data: {
        usuarioId: usuario.id,
        titulo: titulo.slice(0, 120),
        dataColeta,
        itens: JSON.stringify(
          itensValidos.slice(0, 40).map((i) => ({
            nome: String(i.nome).slice(0, 120),
            valor: Number(i.valor),
            unidade: String(i.unidade ?? "").slice(0, 30),
            ...(Number.isFinite(Number(i.refMin)) ? { refMin: Number(i.refMin) } : {}),
            ...(Number.isFinite(Number(i.refMax)) ? { refMax: Number(i.refMax) } : {}),
          })),
        ),
        origem: "manual",
      },
    });

    // Contrato delta (auditoria FASE 2): devolve APENAS o exame criado
    // + auditoria — sem recarregar o estado inteiro.
    const efeitos = await aplicarSideEffects(usuario, undefined, {
      acao: "EXAME_REGISTRADO",
      categoria: "prontuario",
      detalhes: `Exame "${titulo}" registrado manualmente (${itensValidos.length} resultados)`,
    });

    return ok({ exame: exameWire(exame), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    // B1: guarda de objeto/tipo.
    const brutoDel = corpoObjeto(await lerCorpoJson(req));
    const body = { id: brutoDel ? textoDoCorpo(brutoDel.id) : undefined };
    if (!body.id) {
      return Response.json({ erro: "Informe o exame a remover." }, { status: 400 });
    }
    // Exclusão escopada no próprio usuário (sem chance de remover de outro paciente)
    const removidos = await db.exameLaboratorial.deleteMany({
      where: { id: body.id, usuarioId: usuario.id },
    });
    // B6: nada apagado era 200 silencioso — agora é 404; e a exclusão é
    // auditada, como o POST da mesma rota já fazia (via aplicarSideEffects).
    if (removidos.count === 0) {
      return Response.json({ erro: "Exame não encontrado." }, { status: 404 });
    }
    await registrarAudit(usuario, {
      acao: "EXAME_REMOVIDO",
      categoria: "prontuario",
      entidade: "exame",
      entidadeId: body.id,
      detalhes: `Exame ${body.id} removido pelo paciente`,
    });
    // Contrato delta (auditoria FASE 2): devolve APENAS o id removido —
    // o cliente tira o exame do estado sem recarregar o app.
    return ok({ exameRemovido: body.id });
  } catch (erro) {
    return falha(erro);
  }
}
