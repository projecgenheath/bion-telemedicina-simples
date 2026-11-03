import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";
import { detalhesAuditoria, FREQUENCIAS_LEMBRETE, HORA } from "@/lib/saude-paciente";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";

/** Criação de lembretes de saúde (apenas pacientes).
 *  Notificações e auditoria geradas PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    // M9 (auditoria): teto por usuário — 100/h cobre com folga a configuração
    // inicial de vários medicamentos/horários e barra a inflação da tabela
    // por loop a partir de uma conta autenticada.
    const teto = await limitarAsync(`lembretes:${usuario.id}`, 100, 3_600_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
    // B1: guarda de objeto/tipo antes de .trim().
    const bruto = corpoObjeto(await lerCorpoJson(req));
    if (!bruto) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const body = {
      titulo: textoDoCorpo(bruto.titulo),
      horario: textoDoCorpo(bruto.horario),
      tipo: textoDoCorpo(bruto.tipo),
      frequencia: textoDoCorpo(bruto.frequencia),
      medicamento: textoDoCorpo(bruto.medicamento),
    };

    if (!body.titulo?.trim()) {
      return Response.json({ erro: "Informe o título do lembrete." }, { status: 400 });
    }

    // B16 (servidor): horário e frequência validados com as MESMAS regras da
    // rota irmã paciente/medicamentos/[id]/lembrete (HORA estrita HH:MM
    // 00:00–23:59 e FREQUENCIAS_LEMBRETE) — antes "99:99" era gravado cru e
    // nunca disparava. Frequência fora da lista cai no padrão, como lá.
    const horario = body.horario?.trim() || "08:00";
    if (!HORA.test(horario)) {
      return Response.json({ erro: "Informe o horário no formato HH:MM." }, { status: 400 });
    }
    const frequencia = (FREQUENCIAS_LEMBRETE as readonly string[]).includes(body.frequencia ?? "")
      ? (body.frequencia as string)
      : "Todos os dias";

    const lembrete = await db.lembrete.create({
      data: {
        usuarioId: usuario.id,
        titulo: body.titulo.trim().slice(0, 160),
        horario,
        tipo: (body.tipo?.trim() || "Medicação").slice(0, 60),
        frequencia,
        medicamento: body.medicamento?.trim().slice(0, 160) || null,
      },
    });

    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "lembrete",
          titulo: "Lembrete criado",
          texto: `${lembrete.titulo} programado para ${lembrete.horario} (${lembrete.frequencia}).`,
          usuarioId: usuario.id,
        },
      ],
      {
        acao: "LEMBRETE_CRIADO",
        categoria: "sistema",
        entidade: "lembrete",
        entidadeId: lembrete.id,
        detalhes: detalhesAuditoria({ pacienteId: usuario.id, lembreteId: lembrete.id }),
      },
    );

    // Contrato delta: devolve APENAS o lembrete criado (+ efeitos colaterais).
    return ok({
      lembrete: {
        id: lembrete.id,
        titulo: lembrete.titulo,
        horario: lembrete.horario,
        tipo: lembrete.tipo,
        frequencia: lembrete.frequencia,
        feito: lembrete.feito,
        medicamento: lembrete.medicamento,
      },
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}
