import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  consultaWire,
  includeFaltaWire,
  includePagamentoReembolsoWire,
  includeReservaVigente,
} from "@/lib/server/dados";
import { consultaJaRepassada } from "@/lib/server/repasse";
import {
  desfechoExistente,
  gravarDesfecho,
  lerPresencas,
  selectAvaliada,
  STATUS_AVALIAVEIS,
  type ConsultaAvaliada,
} from "@/lib/server/presenca-consulta";
import { pacienteEsteveNaSala, podeMarcarFalta, prazoDesfecho } from "@/components/bion/medico/metricas";

/**
 * Desfecho marcado pelo MÉDICO dono da consulta (regras do Alisson, 06/10/2026).
 *
 * GET  /api/medico/consultas/[id]/desfecho
 *      Estado para a sala/agenda: o paciente esteve na sala depois do horário?
 *      Já pode marcar falta (e quando libera)? Prazo (23:30 do dia). Desfecho
 *      que já existe. Nada é gravado.
 *
 * POST /api/medico/consultas/[id]/desfecho   { tipo: "falta_paciente" | "falha_tecnica" }
 *  - falta_paciente: só depois de o médico esperar na sala até o horário +
 *    15 min, sem presença do paciente depois do horário (podeMarcarFalta em
 *    medico/metricas.ts). Status não muda; o médico recebe; o paciente pode
 *    pedir reembolso em 7 dias (fluxo que já existe).
 *  - falha_tecnica: a partir do horário marcado. Mesmo fluxo de
 *    aplicarFalhaTecnica: paga → aguardando_reagendamento (o paciente escolhe
 *    remarcar grátis ou reembolso integral); não paga → cancelada; o médico
 *    não recebe.
 *  - Até 23:30 (São Paulo) do dia da consulta; recusa consulta concluída,
 *    cancelada, aguardando reagendamento, já repassada ou com desfecho (de
 *    quem for: o médico não corrige o que o sistema registrou).
 *  - Idempotente: repetir o MESMO pedido (clique duplo) devolve 200 com
 *    `jaRegistrado: true` e não grava outro evento.
 *  - Grava pela mesma função da verificação automática (gravarDesfecho):
 *    evento por = "medico", aviso ao paciente e auditoria na mesma transação.
 * Acesso: só o MÉDICO dono (403 para outro médico, paciente e admin).
 */

type TipoPedido = "falta_paciente" | "falha_tecnica";
const TIPOS: TipoPedido[] = ["falta_paciente", "falha_tecnica"];

const ROTULO: Record<string, string> = {
  falta_paciente: "falta do paciente",
  falha_tecnica: "falha técnica",
  falta_medico: "falta do médico",
};

const recusa = (erro: string, extra: Record<string, unknown> = {}) => Response.json({ erro, ...extra }, { status: 409 });

async function consultaDoMedico(id: string, medicoId: string) {
  const c = await db.consulta.findUnique({ where: { id }, select: selectAvaliada });
  if (!c) return { erro: Response.json({ erro: "Consulta não encontrada." }, { status: 404 }) } as const;
  if (c.medicoId !== medicoId) return { erro: Response.json({ erro: "Acesso negado." }, { status: 403 }) } as const;
  return { c } as const;
}

async function wire(id: string) {
  const c = await db.consulta.findUnique({
    where: { id },
    include: {
      medico: { select: { nome: true } },
      paciente: { select: { nome: true } },
      remarcacoes: includeReservaVigente(),
      eventos: includeFaltaWire,
      pagamento: includePagamentoReembolsoWire,
    },
  });
  return c ? consultaWire(c) : null;
}

function rotuloDesfecho(ev: { tipo: string; motivo: string }) {
  return ev.tipo === "falha_tecnica" && ev.motivo === "falta_medico" ? ROTULO.falta_medico : ROTULO[ev.tipo] ?? ev.tipo;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const r = await consultaDoMedico(id, medico.id);
    if ("erro" in r) return r.erro;
    const { c } = r;
    const agora = Date.now();
    const inicio = c.dataInicio.getTime();
    const [presencas, ev] = await Promise.all([lerPresencas(c), desfechoExistente(c.id)]);
    const falta = podeMarcarFalta({ dataInicio: inicio, agora, ...presencas });
    return ok({
      consultaId: c.id,
      status: c.status,
      dataInicio: c.dataInicio.toISOString(),
      prazo: new Date(prazoDesfecho(inicio)).toISOString(),
      agora: new Date(agora).toISOString(),
      pacienteEsteve: pacienteEsteveNaSala(inicio, presencas.paciente),
      medicoEntrouEm: presencas.medico?.entrouEm ? new Date(presencas.medico.entrouEm).toISOString() : null,
      falta: {
        pode: falta.pode,
        liberaEm: falta.liberaEm === null ? null : new Date(falta.liberaEm).toISOString(),
        mensagem: falta.pode ? null : falta.mensagem,
      },
      desfecho: ev ? { tipo: ev.tipo, motivo: ev.motivo, por: ev.por } : null,
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { tipo?: string } | null;
    const tipo = body?.tipo as TipoPedido | undefined;
    if (!tipo || !TIPOS.includes(tipo)) {
      return Response.json({ erro: 'Informe tipo: "falta_paciente" ou "falha_tecnica".' }, { status: 400 });
    }
    const r = await consultaDoMedico(id, medico.id);
    if ("erro" in r) return r.erro;
    const c: ConsultaAvaliada = r.c;

    /** O mesmo médico já gravou ESTE desfecho (clique duplo / repetição): 200 sem gravar de novo. */
    const repeticao = async () => {
      const ev = await desfechoExistente(c.id);
      if (ev && ev.por === "medico" && ev.atorId === medico.id && ev.tipo === tipo && (tipo !== "falha_tecnica" || ev.motivo === "falha_tecnica")) {
        return ok({ consulta: await wire(c.id), desfecho: tipo, jaRegistrado: true });
      }
      if (ev) return recusa(`Esta consulta já tem desfecho registrado (${rotuloDesfecho(ev)}).`, { desfecho: ev.tipo });
      return null;
    };

    const jaTem = await repeticao();
    if (jaTem) return jaTem;

    const agora = Date.now();
    const inicio = c.dataInicio.getTime();
    if (agora > prazoDesfecho(inicio)) {
      return recusa("O prazo para marcar terminou às 23:30 do dia da consulta.");
    }
    if (!STATUS_AVALIAVEIS.includes(c.status)) {
      return recusa(
        c.status === "concluida"
          ? "Esta consulta já foi concluída."
          : c.status === "cancelada"
            ? "Esta consulta foi cancelada."
            : "Esta consulta já está aguardando reagendamento.",
      );
    }
    if (agora < inicio) return recusa("A consulta ainda não começou.");
    if (await consultaJaRepassada(c.id)) return recusa("A consulta já entrou num repasse.");

    let motivo: string;
    if (tipo === "falta_paciente") {
      const presencas = await lerPresencas(c);
      const regra = podeMarcarFalta({ dataInicio: inicio, agora, ...presencas });
      if (!regra.pode) {
        return recusa(regra.mensagem, {
          motivo: regra.motivo,
          liberaEm: regra.liberaEm === null ? null : new Date(regra.liberaEm).toISOString(),
        });
      }
      motivo = `O médico esperou ${Math.round(regra.esperouMs / 60_000)} min na sala e o paciente não entrou.`;
    } else {
      motivo = "O médico registrou falha técnica pela sala/agenda.";
    }

    const gravado = await gravarDesfecho(c, tipo, motivo, { por: "medico", id: medico.id, nome: medico.nome });
    if (!gravado) {
      // Outra requisição mexeu na consulta no meio (ex.: o 2º clique): repete a leitura.
      const depois = await repeticao();
      if (depois) return depois;
      return recusa("A consulta mudou enquanto o pedido era processado. Atualize a tela e tente de novo.");
    }
    return ok({ consulta: await wire(c.id), desfecho: tipo, status: gravado.status });
  } catch (erro) {
    return falha(erro);
  }
}
