import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { ROTULO_TIPO, lerTiposPedido } from "@/lib/saude-paciente";

/**
 * GET /api/medico/resultados — inbox "Resultados para revisar" do médico
 * (item 13 da auditoria de melhorias).
 *
 * Lista por RECÊNCIA, sem migração nem campo de "visto" novo:
 *  - pedidos de medição ATENDIDOS deste médico (com os valores respondidos);
 *  - exames laboratoriais postados pelos pacientes COM VÍNCULO (consulta
 *    deste médico, qualquer status — o mesmo universo de PacientesPainel).
 * "Visto" = leitura da Notificacao: a rota devolve os ids das notificações
 * dirigidas não lidas do tipo "exame" (a gaveta de resultados) e o cliente
 * as marca como lidas ao exibir o painel (PATCH /api/notificacoes { id }).
 */

type ItemResultado = {
  id: string;
  tipo: "medicao" | "exame";
  pacienteId: string;
  pacienteNome: string;
  titulo: string;
  detalhe: string;
  ts: number;
  foraDaReferencia: number;
};

const ROTULO_MEDICAO: Record<string, { rotulo: string; unidade: string }> = {
  peso: { rotulo: "Peso", unidade: "kg" },
  altura: { rotulo: "Altura", unidade: "cm" },
  pressao: { rotulo: "Pressão", unidade: "mmHg" },
  pa: { rotulo: "Pressão", unidade: "mmHg" },
};

function formatarMedicao(m: { tipo: string; valor1: number; valor2: number | null }): string {
  const r = ROTULO_MEDICAO[m.tipo];
  const base = m.valor2 != null ? `${m.valor1}/${m.valor2}` : `${m.valor1}`;
  return `${r?.rotulo ?? m.tipo} ${r?.unidade ? `${base} ${r.unidade}` : base}`;
}

type ItemExame = { nome: string; valor: number; unidade?: string; refMin?: number; refMax?: number };

function itensDoExame(json: string): ItemExame[] {
  try {
    const v = JSON.parse(json || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (i): i is ItemExame =>
        !!i && typeof i === "object" && typeof (i as ItemExame).nome === "string" && Number.isFinite(Number((i as ItemExame).valor)),
    );
  } catch {
    return [];
  }
}

function foraDaFaixa(it: ItemExame): boolean {
  if (typeof it.refMin === "number" && it.valor < it.refMin) return true;
  if (typeof it.refMax === "number" && it.valor > it.refMax) return true;
  return false;
}

export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");

    const vinculos = await db.consulta.findMany({
      where: { medicoId: medico.id },
      select: { pacienteId: true },
      distinct: ["pacienteId"],
    });
    const pacienteIds = vinculos.map((v) => v.pacienteId);

    const [pedidos, exames, naoLidas] = await Promise.all([
      db.pedidoMedicao.findMany({
        where: { medicoId: medico.id, status: "atendido" },
        orderBy: { atendidoEm: "desc" },
        take: 25,
        select: {
          id: true,
          pacienteId: true,
          tipos: true,
          atendidoEm: true,
          paciente: { select: { nome: true } },
          medicoes: { select: { tipo: true, valor1: true, valor2: true }, orderBy: { criadoEm: "asc" } },
        },
      }),
      pacienteIds.length
        ? db.exameLaboratorial.findMany({
            where: { usuarioId: { in: pacienteIds } },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: {
              id: true,
              usuarioId: true,
              titulo: true,
              dataColeta: true,
              itens: true,
              createdAt: true,
              usuario: { select: { nome: true } },
            },
          })
        : Promise.resolve([]),
      db.notificacao.findMany({
        where: { usuarioId: medico.id, tipo: "exame", lida: false },
        select: { id: true },
        take: 100,
      }),
    ]);

    const itens: ItemResultado[] = [];
    for (const p of pedidos) {
      const detalhe = p.medicoes.length
        ? p.medicoes.map(formatarMedicao).join(" · ")
        : lerTiposPedido(p.tipos)
            .map((t) => ROTULO_TIPO[t])
            .join(", ");
      itens.push({
        id: `medicao:${p.id}`,
        tipo: "medicao",
        pacienteId: p.pacienteId,
        pacienteNome: p.paciente.nome,
        titulo: "Medição respondida",
        detalhe,
        ts: (p.atendidoEm ?? new Date(0)).getTime(),
        foraDaReferencia: 0,
      });
    }
    for (const e of exames) {
      const lista = itensDoExame(e.itens);
      itens.push({
        id: `exame:${e.id}`,
        tipo: "exame",
        pacienteId: e.usuarioId,
        pacienteNome: e.usuario.nome,
        titulo: e.titulo,
        detalhe: `${lista.length} ${lista.length === 1 ? "item" : "itens"} · coleta em ${e.dataColeta.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        ts: e.createdAt.getTime(),
        foraDaReferencia: lista.filter(foraDaFaixa).length,
      });
    }
    itens.sort((a, b) => b.ts - a.ts);

    return ok({ itens: itens.slice(0, 40), naoLidasIds: naoLidas.map((n) => n.id) });
  } catch (erro) {
    return falha(erro);
  }
}
