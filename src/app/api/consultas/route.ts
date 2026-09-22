import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import {
  aplicarSideEffects,
  parseDataHora,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { criarCobranca, confirmarPagamento, modoGateway, paraWire } from "@/lib/server/pagamentos";
import { ok, falha } from "@/lib/server/http";

/**
 * Agendamento de nova consulta (apenas pacientes).
 *
 * Regras impostas PELO SERVIDOR (o cliente não decide):
 *  - status: o PAGAMENTO é o que confirma a consulta. Nasce "em_espera"
 *    (aguardando pagamento) e vira "confirmada" no ato do pagamento
 *    (simulado confirma aqui; webhook, em /api/pagamentos/webhook).
 *  - triagem (anamnese): obrigatória, disponível LOGO APÓS a confirmação
 *    ATÉ 5 MINUTOS ANTES do horário — rota /api/anamnese. Não altera status.
 *  - pagamento: cliente não envia `pago`. O servidor cria a cobrança
 *    (Pagamento) e a confirma via gateway — simulado (demo) ou webhook
 *    assinado quando BION_PAGAMENTO_WEBHOOK_SECRET está configurado.
 *  - notificações e auditoria: compostas no servidor a partir do evento real.
 *
 * Contrato delta: devolve APENAS a consulta criada (+ anamnese, pagamento e
 * efeitos colaterais gerados).
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      medicoId: string;
      data: string;
      hora: string;
      motivoConsulta?: string;
      metodo?: "pix" | "cartao";
    };

    const medico = await db.user.findFirst({
      where: { id: body.medicoId, role: "MEDICO" },
      include: { perfilMedico: true },
    });
    if (!medico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
    }

    // Criação pelo paciente nasce aguardando pagamento — o pagamento é
    // o que CONFIRMA (abaixo, no gateway; ou no webhook real).
    const status = "em_espera";

    // HARDENING (V1): o PREÇO é imposto pelo servidor (tabela do médico).
    // O cliente não manda valor — um paciente malicioso podia agendar com
    // valor 0 e receber consulta confirmada grátis. O perfilMedico do médico
    // já veio carregado acima (valor padrão 150 no schema).
    const valorConsulta = medico.perfilMedico?.valor ?? 150;

    const dataInicio = parseDataHora(body.data, body.hora);
    const consulta = await db.consulta.create({
      data: {
        pacienteId: usuario.id,
        medicoId: medico.id,
        especialidade: medico.perfilMedico?.especialidade ?? "Clínica Geral",
        dataInicio,
        status,
        valor: valorConsulta,
        pago: false, // só o gateway/servidor confirma
        motivoConsulta: body.motivoConsulta?.trim().slice(0, 300) || "Consulta de rotina",
      },
    });

    // Agendamento pela BION IA: cria a anamnese pendente que confirma a consulta
    const a = await db.anamnese.create({
      data: { consultaId: consulta.id, usuarioId: usuario.id },
    });
    const anamnese = {
      id: a.id,
      consultaId: a.consultaId,
      medico: medico.nome,
      especialidade: consulta.especialidade,
      etapa: a.etapa,
      status: a.status,
      coleta: JSON.parse(a.coleta || "{}") as Record<string, Record<string, unknown>>,
      documentos: JSON.parse(a.documentos || "[]") as {
        nome: string;
        tipo: string;
        exameImportado: boolean;
        resumo?: string;
      }[],
      updatedAt: a.updatedAt.toISOString(),
    };

    // Cobrança: o servidor decide a confirmação (gateway simulado ou webhook).
    const metodo = body.metodo === "cartao" ? "cartao" : "pix";
    const cobranca = await criarCobranca(consulta.id, consulta.valor, metodo);
    let pagamento = paraWire(cobranca);
    let pagoFinal = false;
    const eventos: NotifPayload[] = [
      {
        tipo: "agenda",
        titulo: "Nova consulta agendada",
        texto: `${usuario.nome} agendou ${consulta.especialidade} em ${body.data} às ${body.hora}. Triagem pré-consulta (BION IA) disponível até 5 minutos antes do horário.`,
        usuarioId: medico.id,
      },
      {
        tipo: "agenda",
        titulo: "Consulta reservada",
        texto: `${consulta.especialidade} com ${medico.nome} — ${body.data} às ${body.hora}. Assim que o pagamento for confirmado, sua consulta entra no agenda e a triagem com a BION IA fica disponível até 5 minutos antes do horário.`,
        usuarioId: usuario.id,
      },
    ];
    const audit: AuditPayload = {
      acao: "CONSULTA_AGENDADA",
      categoria: "consulta",
      entidade: "consulta",
      entidadeId: consulta.id,
      detalhes: `Agendamento com ${medico.nome} — ${consulta.especialidade} em ${body.data} às ${body.hora} (em_espera — aguardando pagamento)`,
    };

    let statusFinal = status;

    if (modoGateway() === "simulado") {
      // Demonstração: gateway simulado confirma no servidor — e o pagamento
      // CONFIRMA a consulta (regra imposta aqui, não pelo navegador).
      const confirmado = await confirmarPagamento(cobranca.id, "simulado");
      if (confirmado) {
        pagoFinal = true;
        pagamento = paraWire(confirmado);
        statusFinal = "confirmada";
        eventos.push(
          {
            tipo: "pagamento",
            titulo: "Pagamento confirmado",
            texto: `Pagamento de R$ ${pagamento.valor.toFixed(2).replace(".", ",")} (${pagamento.metodo === "pix" ? "Pix" : "Cartão"}) aprovado.`,
            usuarioId: usuario.id,
          },
          {
            tipo: "agenda",
            titulo: "Consulta confirmada",
            texto: `${consulta.especialidade} com ${medico.nome} — ${body.data} às ${body.hora} está confirmada. Faça sua triagem com a BION IA até 5 minutos antes do horário.`,
            usuarioId: usuario.id,
          },
        );
        audit.acao = "CONSULTA_AGENDADA_PAGA";
        audit.detalhes = `Agendamento com ${medico.nome} — ${consulta.especialidade} em ${body.data} às ${body.hora} (pago via gateway simulado — confirmada; triagem até 5 min antes)`;
      }
    }

    const efeitos = await aplicarSideEffects(usuario, eventos, audit);

    return ok({
      consulta: {
        id: consulta.id,
        medicoId: consulta.medicoId,
        medico: medico.nome,
        pacienteId: consulta.pacienteId,
        paciente: usuario.nome,
        especialidade: consulta.especialidade,
        dataInicio: dataInicio.toISOString(),
        status: statusFinal,
        motivoConsulta: consulta.motivoConsulta ?? undefined,
        motivoCancelamento: consulta.motivoCancelamento ?? undefined,
        valor: consulta.valor,
        pago: pagoFinal,
      },
      anamnese,
      pagamento,
      consultaCriada: consulta.id,
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}
