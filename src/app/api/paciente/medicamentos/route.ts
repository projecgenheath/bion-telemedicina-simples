import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { descricaoAvisos, detalhesAuditoria, resumoMedicamento, validarAvisos, validarMedicamento } from "@/lib/saude-paciente";
import { importarMedicamentosLegado } from "@/lib/server/medicamentos-legado";
import { serializarMedicamento } from "./serializar";
import { serializarLembrete, type LembreteWire } from "./lembrete-wire";

/**
 * GET  /api/paciente/medicamentos — medicamentos em uso do próprio paciente
 *      (ativos primeiro; receita + os que ele adicionou). Na primeira leitura,
 *      importa o campo antigo PerfilPaciente.medicamentos (idempotente).
 * POST /api/paciente/medicamentos — paciente adiciona { nome, dose?, via?, frequencia?, usoContinuo? }
 *      (origem "paciente"; nunca controlado). Com { horarios, vezesAoDia?, diaSemana? },
 *      cria também um Lembrete por horário, na mesma transação, e devolve
 *      `lembretes` no wire. Sem `horarios`, o comportamento é o de sempre.
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const imp = await importarMedicamentosLegado(usuario.id);
    if (imp.importados > 0 || imp.descartados > 0) {
      // LGPD: só ação, ids e contagens; nunca os nomes.
      await aplicarSideEffects(usuario, undefined, {
        acao: "MEDICAMENTOS_PERFIL_IMPORTADOS",
        categoria: "prontuario",
        entidade: "perfilPaciente",
        entidadeId: usuario.id,
        detalhes: detalhesAuditoria({ pacienteId: usuario.id, importados: String(imp.importados), repetidos: String(imp.descartados) }),
      });
    }
    const lista = await db.medicamentoEmUso.findMany({
      where: { pacienteId: usuario.id },
      orderBy: [{ ativo: "desc" }, { inicio: "desc" }],
      take: 100,
      include: { lembretes: { select: { id: true } } },
    });
    return ok({ medicamentos: lista.map(serializarMedicamento), ...(imp.importados || imp.descartados ? { perfilImportado: true } : {}) });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const v = validarMedicamento(body);
    if (!v.ok) return Response.json({ erro: v.erro }, { status: 400 });
    const a = validarAvisos(body);
    if (!a.ok) return Response.json({ erro: a.erro }, { status: 400 });
    const avisos = a.avisos;

    // Com avisos, a posologia gravada é a estruturada (frequência gerada +
    // horários); sem avisos, vale a posologia legada de validarMedicamento.
    const posologia = avisos ? JSON.stringify(avisos.posologia) : v.dados.posologia;
    const { medicamento: m, lembretesCriados } = await db.$transaction(async (tx) => {
      const medicamento = await tx.medicamentoEmUso.create({
        data: { ...v.dados, posologia, pacienteId: usuario.id, origem: "paciente", controlado: false },
      });
      const criados: LembreteWire[] = [];
      if (avisos) {
        const resumo = resumoMedicamento({ dose: medicamento.dose, via: medicamento.via, posologia });
        const titulo = resumo ? `${medicamento.nome} (${resumo})`.slice(0, 160) : medicamento.nome;
        for (const horario of avisos.horarios) {
          criados.push(
            await tx.lembrete.create({
              data: {
                usuarioId: usuario.id,
                titulo,
                horario,
                tipo: "Medicação",
                frequencia: avisos.frequenciaLembrete,
                medicamento: medicamento.nome,
                origem: "paciente",
                medicamentoEmUsoId: medicamento.id,
                documentoId: null,
              },
            }),
          );
        }
      }
      return { medicamento, lembretesCriados: criados };
    });

    const efeitos = await aplicarSideEffects(
      usuario,
      avisos
        ? [
            {
              tipo: "lembrete",
              titulo: "Lembretes criados",
              texto: `${m.nome}: ${descricaoAvisos(avisos.posologia)}.`,
              usuarioId: usuario.id,
            },
          ]
        : undefined,
      {
        acao: "MEDICAMENTO_ADICIONADO",
        categoria: "prontuario",
        entidade: "medicamentoEmUso",
        entidadeId: m.id,
        detalhes: detalhesAuditoria({
          pacienteId: usuario.id,
          medicamentoEmUsoId: m.id,
          ...(lembretesCriados.length ? { lembretes: lembretesCriados.map((l) => l.id) } : {}),
        }),
      },
    );
    return ok({
      medicamento: serializarMedicamento({ ...m, lembretes: lembretesCriados.map((l) => ({ id: l.id })) }),
      ...(avisos ? { lembretes: lembretesCriados.map(serializarLembrete) } : {}),
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}
