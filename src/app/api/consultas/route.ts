import { exigirAceiteTermosPaciente } from "@/lib/server/aceite-termos";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import {
  aplicarSideEffects,
  parseDataHora,
  MESES,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { criarCobranca, confirmarPagamento, modoGateway, paraWire } from "@/lib/server/pagamentos";
import { ok, falha } from "@/lib/server/http";
import { STATUS_LIBERAM_HORARIO, horarioReservado } from "@/lib/server/financeiro";
import { partesNoFuso } from "@/lib/server/fuso";
import {
  consultaEmHorarioVedado,
  criarSeDiaLivre,
  diaBloqueado,
  ERRO_DIA_BLOQUEADO,
  ERRO_HORARIO_VEDADO,
  OPCOES_TX_TRAVA,
} from "@/lib/server/bloqueio-agenda";
import { jaUsouRetornoGratis, lerPedidoVinculado, PRAZO_RETORNO_DIAS, retornoEhGratis } from "@/lib/atendimento-tipo";
import { estaAnonimizado } from "@/lib/server/lgpd";

/** Ano/mês/dia formam uma data real do calendário. */
function dataCalendarioValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1 || ano < 2000 || ano > 2200) return false;
  return dia <= new Date(ano, mes, 0).getDate();
}

/**
 * P2 — validação ESTRITA de data/hora de agendamento. Aceita exatamente os
 * formatos que o parseDataHora entende (ISO, DD/MM/AAAA, hoje/amanhã, "D Mes
 * [AAAA]"), mas REJEITA o que antes era engolido como "hoje 09:00". Devolve
 * mensagem de erro ou null.
 */
function validarDataHoraAgendamento(data: string, hora: string): string | null {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return "Hora inválida — use o formato HH:MM (00:00–23:59).";
  }
  const rotulo = data.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rotulo);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(rotulo);
  if (iso) {
    if (!dataCalendarioValida(+iso[1], +iso[2], +iso[3])) {
      return "Data inválida — confira dia, mês e ano.";
    }
  } else if (br) {
    if (!dataCalendarioValida(+br[3], +br[2], +br[1])) {
      return "Data inválida — confira dia, mês e ano.";
    }
  } else if (!/^(hoje|amanh[aã])$/i.test(rotulo)) {
    const partes = rotulo.split(/\s+/);
    const dia = /^\d{1,2}$/.test(partes[0] ?? "") ? parseInt(partes[0], 10) : NaN;
    const mesIdx = MESES.findIndex((m) => m.toLowerCase() === (partes[1] ?? "").toLowerCase());
    const anoOk = partes.length === 2 || (partes.length === 3 && /^\d{4}$/.test(partes[2]));
    if (!Number.isFinite(dia) || mesIdx < 0 || !anoOk || !dataCalendarioValida(partes[2] ? +partes[2] : partesNoFuso(new Date()).ano, mesIdx + 1, dia)) {
      return "Data inválida — use AAAA-MM-DD, DD/MM/AAAA, hoje, amanhã ou \"D Mes AAAA\".";
    }
  }
  return null;
}

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
    // Termos + privacidade vigentes: sem aceite, nada novo é agendado (403).
    const semAceite = await exigirAceiteTermosPaciente(usuario);
    if (semAceite) return semAceite;
    const body = (await req.json()) as {
      medicoId: string;
      data: string;
      hora: string;
      motivoConsulta?: string;
      metodo?: "pix" | "cartao";
      tipoAtendimento?: string;
      consultaOrigemId?: string;
      documentoOrigemId?: string;
    };

    // Retorno (Teleconsulta v2): vínculo com uma consulta CONCLUÍDA do próprio
    // paciente, com o MESMO médico. O cliente não escolhe o médico de outra
    // pessoa nem herda triagem alheia — tudo conferido aqui.
    const vinculo = lerPedidoVinculado(body);
    if (typeof vinculo === "string") {
      return Response.json({ erro: vinculo }, { status: 400 });
    }
    if (vinculo?.tipoAtendimento === "renovacao") {
      // Renovação sem horário: formato de armazenamento ainda em definição (Médicos).
      return Response.json({ erro: "A renovação de receita ainda não está disponível." }, { status: 400 });
    }
    let origemRetorno: { id: string; dataInicio: Date; anamnese: { coleta: string } | null } | null = null;
    if (vinculo) {
      const origem = await db.consulta.findFirst({
        where: { id: vinculo.consultaOrigemId, pacienteId: usuario.id },
        select: { id: true, medicoId: true, status: true, dataInicio: true, anamnese: { select: { coleta: true } } },
      });
      if (!origem || origem.status !== "concluida") {
        return Response.json({ erro: "Só é possível marcar retorno de uma consulta concluída." }, { status: 400 });
      }
      if (origem.medicoId !== body.medicoId) {
        return Response.json({ erro: "O retorno é com o mesmo médico da consulta de origem." }, { status: 400 });
      }
      if (Date.now() - origem.dataInicio.getTime() > PRAZO_RETORNO_DIAS * 86_400_000) {
        return Response.json({ erro: `O retorno pode ser marcado até ${PRAZO_RETORNO_DIAS} dias depois da consulta. Agende uma consulta nova.` }, { status: 400 });
      }
      origemRetorno = { id: origem.id, dataInicio: origem.dataInicio, anamnese: origem.anamnese };
    }

    const medico = await db.user.findFirst({
      where: { id: body.medicoId, role: "MEDICO" },
      include: { perfilMedico: true },
    });
    if (!medico || estaAnonimizado(medico)) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
    }

    // Robustez: data e hora são obrigatórios — sem eles, parseDataHora
    // silenciosamente criaria uma consulta "hoje às 09:00" (e o gateway
    // simulado a confirmaria). Rejeita ANTES de criar cobrança.
    if (!body.data?.trim() || !body.hora?.trim()) {
      return Response.json({ erro: "Data e hora são obrigatórios." }, { status: 400 });
    }

    // P2 — validação estrita de formato (data real do calendário, hora HH:MM).
    const erroFormato = validarDataHoraAgendamento(body.data.trim(), body.hora.trim());
    if (erroFormato) {
      return Response.json({ erro: erroFormato }, { status: 400 });
    }

    // Criação pelo paciente nasce aguardando pagamento — o pagamento é
    // o que CONFIRMA (abaixo, no gateway; ou no webhook real).
    const status = "em_espera";

    // HARDENING (V1): o PREÇO é imposto pelo servidor (tabela do médico).
    // O cliente não manda valor — um paciente malicioso podia agendar com
    // valor 0 e receber consulta confirmada grátis. O perfilMedico do médico
    // já veio carregado acima (valor padrão 150 no schema).
    const valorMedico = medico.perfilMedico?.valor ?? 150;

    const dataInicio = parseDataHora(body.data, body.hora);

    // P2 — proibido agendar no passado (tolerância de 1 min). Fuso: dataInicio
    // já é o instante real (parseDataHora interpreta em São Paulo), então
    // compara direto com o agora real; sem "agora de parede" falso.
    if (dataInicio.getTime() < Date.now() - 60_000) {
      return Response.json(
        { erro: "Não é possível agendar no passado — escolha uma data e hora futuras." },
        { status: 400 },
      );
    }

    // Sem teleconsulta entre 23:00 e 00:00 (São Paulo) — o repasse diário
    // fecha às 23:30. Resposta rápida; a transação travada confere de novo.
    if (consultaEmHorarioVedado(dataInicio)) {
      return Response.json({ erro: ERRO_HORARIO_VEDADO }, { status: 409 });
    }

    // Dia bloqueado: resposta rápida (a checagem que vale é a atômica, abaixo).
    if (await diaBloqueado(db, medico.id, dataInicio)) {
      return Response.json({ erro: ERRO_DIA_BLOQUEADO }, { status: 409 });
    }

    // P2 — conflito de horário: mesmo médico (ou mesmo paciente) já possui
    // consulta que ainda ocupa este exato horário (ver STATUS_LIBERAM_HORARIO).
    const choqueMedico = await db.consulta.findFirst({
      where: { medicoId: medico.id, dataInicio, status: { notIn: STATUS_LIBERAM_HORARIO } },
      select: { id: true },
    });
    if (choqueMedico || (await horarioReservado(medico.id, dataInicio))) {
      return Response.json(
        { erro: "Este médico já possui uma consulta neste horário. Escolha outro horário." },
        { status: 409 },
      );
    }
    const choquePaciente = await db.consulta.findFirst({
      where: { pacienteId: usuario.id, dataInicio, status: { notIn: STATUS_LIBERAM_HORARIO } },
      select: { id: true },
    });
    if (choquePaciente) {
      return Response.json(
        { erro: "Você já possui uma consulta neste horário. Escolha outro horário." },
        { status: 409 },
      );
    }

    // Dia inteiro bloqueado pelo médico (folga/férias): checagem + criação
    // ATÔMICAS, com a trava (médico, dia) que o bloqueio do dia também toma —
    // um agendamento que passou pela checagem não termina depois do bloqueio
    // e dos cancelamentos (ou entra antes e é visto por eles, ou espera e
    // recebe 409).
    const criada = await db.$transaction(
      (tx) =>
        criarSeDiaLivre(tx, medico.id, dataInicio, (t) =>
          (async () => {
            // Retorno grátis (até 30 dias da origem, um por origem): decidido
            // AQUI, dentro da transação e com trava pela consulta de origem,
            // para dois pedidos simultâneos não ganharem dois retornos grátis.
            let gratis = false;
            if (origemRetorno) {
              await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"retorno-gratis:" + origemRetorno.id}))`;
              const anteriores = await t.consulta.findMany({
                where: { consultaOrigemId: origemRetorno.id, tipoAtendimento: "retorno" },
                select: { status: true, valor: true },
              });
              gratis = retornoEhGratis(origemRetorno.dataInicio, dataInicio, jaUsouRetornoGratis(anteriores));
            }
            return t.consulta.create({
            data: {
              pacienteId: usuario.id,
              medicoId: medico.id,
              especialidade: medico.perfilMedico?.especialidade ?? "Clínica Geral",
              dataInicio,
              // Grátis: confirmada já na criação, como uma paga após o pagamento.
              status: gratis ? "confirmada" : status,
              valor: gratis ? 0 : valorMedico,
              pago: gratis, // paga: só o gateway/servidor confirma
              motivoConsulta: body.motivoConsulta?.trim().slice(0, 300) || "Consulta de rotina",
              ...(origemRetorno ? { tipoAtendimento: "retorno", consultaOrigemId: origemRetorno.id } : {}),
            },
          });
          })(),
        ),
      OPCOES_TX_TRAVA,
    );
    if (criada.bloqueado) {
      return Response.json({ erro: criada.erro }, { status: 409 });
    }
    const consulta = criada.valor;

    // Agendamento pela BION IA: cria a anamnese pendente que confirma a consulta
    const a = await db.anamnese.create({
      // Retorno: a triagem nasce com as respostas da consulta de origem; o
      // paciente só confirma ou edita.
      data: {
        consultaId: consulta.id,
        usuarioId: usuario.id,
        ...(origemRetorno?.anamnese?.coleta ? { coleta: origemRetorno.anamnese.coleta } : {}),
      },
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
    // Retorno grátis: não existe cobrança (nem PIX); a consulta já nasceu
    // confirmada e paga com valor 0 (o repasse ignora valor 0, #77).
    const retornoGratis = !!origemRetorno && consulta.valor === 0 && consulta.status === "confirmada";
    const metodo = body.metodo === "cartao" ? "cartao" : "pix";
    const cobranca = retornoGratis ? null : await criarCobranca(consulta.id, consulta.valor, metodo);
    let pagamento = cobranca ? paraWire(cobranca) : null;
    let pagoFinal = retornoGratis;
    const eventos: NotifPayload[] = [
      {
        tipo: "agenda",
        titulo: origemRetorno ? "Retorno agendado" : "Nova consulta agendada",
        texto: `${usuario.nome} agendou ${consulta.especialidade} em ${body.data} às ${body.hora}. Triagem pré-consulta (BION IA) disponível até 5 minutos antes do horário.`,
        usuarioId: medico.id,
      },
      {
        tipo: "agenda",
        titulo: "Consulta reservada",
        texto: `${consulta.especialidade} com ${medico.nome} — ${body.data} às ${body.hora}. Assim que o pagamento for confirmado, sua consulta entra no agenda e a triagem opcional com a BION IA fica disponível até 5 minutos antes do horário.`,
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

    let statusFinal: string = retornoGratis ? "confirmada" : status;

    if (retornoGratis) {
      eventos[1] = {
        tipo: "agenda",
        titulo: "Retorno confirmado",
        texto: `Retorno grátis de ${consulta.especialidade} com ${medico.nome} — ${body.data} às ${body.hora} está confirmado. Se quiser, faça a triagem opcional com a BION IA até 5 minutos antes do horário.`,
        usuarioId: usuario.id,
      };
      audit.acao = "CONSULTA_AGENDADA_RETORNO_GRATIS";
      audit.detalhes = `Retorno grátis (até 30 dias da consulta de origem ${origemRetorno!.id}) com ${medico.nome} — ${consulta.especialidade} em ${body.data} às ${body.hora} (valor 0, sem cobrança — confirmada)`;
    } else if (cobranca && modoGateway() === "simulado") {
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
            texto: `${consulta.especialidade} com ${medico.nome} — ${body.data} às ${body.hora} está confirmada. Se quiser, faça a triagem opcional com a BION IA até 5 minutos antes do horário.`,
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
        tipoAtendimento: consulta.tipoAtendimento,
        consultaOrigemId: consulta.consultaOrigemId,
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
