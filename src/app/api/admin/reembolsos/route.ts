import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { reembolsoManualWire } from "@/lib/server/financeiro";

const STATUS_FILTRO = ["em_analise", "aprovado", "negado", "processado", "falhou"];
const LIMITE = 100;

/**
 * GET ?status=em_analise (padrão) | aprovado | negado | processado | falhou | todos
 * Pedidos MANUAIS de reembolso (faltas), mais antigos primeiro na análise.
 * Só ADMIN.
 */
export async function GET(req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const pedido = req.nextUrl.searchParams.get("status") ?? "em_analise";
    const status = pedido === "todos" ? undefined : STATUS_FILTRO.includes(pedido) ? pedido : "em_analise";

    const [total, rows] = await Promise.all([
      db.reembolso.count({ where: { origem: "manual", ...(status ? { status } : {}) } }),
      db.reembolso.findMany({
        where: { origem: "manual", ...(status ? { status } : {}) },
        orderBy: { criadoEm: status === "em_analise" ? "asc" : "desc" },
        take: LIMITE,
        include: {
          pagamento: {
            select: {
              consulta: {
                select: {
                  id: true,
                  especialidade: true,
                  dataInicio: true,
                  valor: true,
                  medico: { select: { id: true, nome: true } },
                  paciente: { select: { id: true, nome: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return ok({
      total,
      reembolsos: rows.map((r) => {
        const c = r.pagamento?.consulta;
        return {
          ...reembolsoManualWire(r),
          decididoPor: r.decididoPor,
          consulta: c
            ? {
                id: c.id,
                especialidade: c.especialidade,
                dataInicio: c.dataInicio.toISOString(),
                valor: c.valor,
                medicoId: c.medico.id,
                medico: c.medico.nome,
                pacienteId: c.paciente.id,
                paciente: c.paciente.nome,
              }
            : null,
        };
      }),
    });
  } catch (erro) {
    return falha(erro);
  }
}
