import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { dataIsoClinica } from "@/lib/server/fuso";
import { calcularReceita, intervaloReceita } from "@/components/bion/medico/receita-servidor";

/**
 * GET /api/medico/receita?de=AAAA-MM-DD&ate=AAAA-MM-DD — SOMENTE LEITURA.
 *
 * Receita LÍQUIDA do médico da sessão por dia (São Paulo): valor da consulta
 * − comissão de 10% − taxa do gateway (0 até o Pagamento guardar a taxa),
 * mais, separada, a parte do médico (50%) nas multas pagas pelo paciente.
 * Regras de inclusão em receita-servidor.ts (consultaEntraNaReceita).
 * Padrão: últimos 30 dias até hoje. Intervalo máximo: 366 dias.
 * Acesso: só MEDICO, só as próprias consultas. Nada é gravado.
 */
export async function GET(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const url = new URL(req.url);
    const hoje = dataIsoClinica();
    const ate = url.searchParams.get("ate") || hoje;
    const de = url.searchParams.get("de") || dataIsoClinica(new Date(Date.now() - 29 * 86_400_000));
    const intervalo = intervaloReceita(de, ate);
    if ("erro" in intervalo) return Response.json({ erro: intervalo.erro }, { status: 400 });
    const { inicio, fim, dias } = intervalo;
    const noIntervalo = { gte: inicio, lt: fim };

    const [consultas, eventosMulta, remarcacoes] = await Promise.all([
      db.consulta.findMany({
        where: { medicoId: medico.id, dataInicio: noIntervalo },
        select: {
          id: true,
          dataInicio: true,
          status: true,
          valor: true,
          pago: true,
          pagamento: { select: { status: true, reembolsos: { select: { status: true, valorCentavos: true, origem: true } } } },
          eventos: {
            where: { tipo: { in: ["falta_paciente", "falha_tecnica"] } },
            select: { tipo: true, dataAnterior: true, corrigidoEm: true },
          },
        },
      }),
      db.eventoConsulta.findMany({
        where: {
          consulta: { medicoId: medico.id },
          tipo: "cancelada",
          por: "paciente",
          multaCentavos: { gt: 0 },
          em: noIntervalo,
        },
        select: {
          em: true,
          multaCentavos: true,
          consulta: { select: { valor: true, pagamento: { select: { reembolsos: { select: { status: true, valorCentavos: true, origem: true } } } } } },
        },
      }),
      db.remarcacaoPendente.findMany({
        where: {
          consulta: { medicoId: medico.id },
          status: "aprovada",
          multaCentavos: { gt: 0 },
          OR: [{ aprovadoEm: noIntervalo }, { aprovadoEm: null, criadoEm: noIntervalo }],
        },
        select: { aprovadoEm: true, criadoEm: true, multaCentavos: true, reembolso: { select: { status: true, valorCentavos: true } } },
      }),
    ]);

    return ok(
      calcularReceita({
        de,
        ate,
        dias,
        consultas,
        multasCancelamento: eventosMulta.map((e) => ({
          em: e.em,
          multaCentavos: e.multaCentavos ?? 0,
          valorConsulta: e.consulta.valor,
          reembolsos: e.consulta.pagamento?.reembolsos ?? [],
        })),
        multasRemarcacao: remarcacoes.map((r) => ({
          quando: r.aprovadoEm ?? r.criadoEm,
          multaCentavos: r.multaCentavos,
          reembolso: r.reembolso,
        })),
      }),
    );
  } catch (erro) {
    return falha(erro);
  }
}
