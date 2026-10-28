import { NextRequest } from "next/server";
import { quandoClinica } from "@/lib/server/fuso";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { chatComFonte, chatStreamComFonte, iaPausada, motivoFalhaIa, novoRequestId, respostaIaPausada } from "@/lib/server/llm";
import { anonimizarMensagensIa, type IdentificadoresPaciente } from "@/lib/server/anonimizar-ia";
import { exigirConsentimentoIa } from "@/lib/server/consentimento-ia";
import { anonimizarMensagensTexto } from "@/lib/server/anonimizar-texto";
import { dataNascimentoParaIso } from "@/lib/idade";
import { nomesMedicamentosEmUso } from "@/lib/server/medicamentos-legado";

/**
 * BION IA — assistente clínico (backend apenas).
 *
 * POST { mensagens: { remetente: "usuario" | "ia"; texto: string }[] }
 * → { resposta: string }
 *
 * O histórico vem do cliente (últimas ~12 mensagens). O enriquecimento de
 * contexto (papel, medicamentos, alergias, próximas consultas) é montado
 * AQUI no servidor a partir do banco — nunca confiar em dados do cliente.
 *
 * IA generativa: NVIDIA (nemotron, OpenAI-compatível) → Gemini/Gemma →
 * erro amigável. Motor local NÃO é usado neste chat — só na triagem
 * (/api/anamnese).
 *
 * Formato da resposta:
 * - padrão (sem `stream`): JSON { resposta, raciocinio, fonte, modelo, requestId } —
 *   inalterado para quem não usa stream (ex.: Copilot do médico — a
 *   Evolução não chama a IA).
 * - `stream: true`: NDJSON (application/x-ndjson), uma linha por evento:
 *   {"tipo":"inicio","requestId"} · {"tipo":"delta","texto"} · {"tipo":"raciocinio","texto"} ·
 *   {"tipo":"fim","fonte","modelo","requestId"} · {"tipo":"erro","erro","requestId"}.
 * O raciocínio do modelo (reasoning_content / <think>) vai em canal próprio
 * (`raciocinio`), nunca dentro de `resposta`/`delta`, e nunca para monitor/log.
 */

const LIMITE_HISTORICO = 4;
/**
 * PRAZO TOTAL DA IA (medido em produção 2026-09-25): o Gemma responde bem em
 * 4-8s (com prefill); quando TRAVA (free tier), não adianta esperar 21s — o
 * paciente espera demais e ainda cai no motor local. 15s limita o pior caso
 * (Gemma travado → local) a ~14s, mantendo folga para respostas reais de 8-12s.
 */
const TIMEOUT_MS = 25_000;
/** Sem 1º token do NVIDIA nesse prazo → cai no Gemini (stream). */
const PRIMEIRO_TOKEN_MS = 12_000;

type MsgEntrada = { remetente: string; texto: string };

async function montarContexto(
  usuario: { id: string; nome: string; role: "PACIENTE" | "MEDICO" | "ADMIN" },
): Promise<string> {
  const linhas: string[] = [];

  if (usuario.role === "PACIENTE") {
    const perfil = await db.perfilPaciente.findUnique({ where: { userId: usuario.id } });
    if (perfil) {
      const medicamentos = await nomesMedicamentosEmUso(usuario.id, perfil.medicamentos);
      const alergias = JSON.parse(perfil.alergias || "[]") as string[];
      if (medicamentos.length) linhas.push(`Medicamentos em uso: ${medicamentos.join(", ")}.`);
      if (alergias.length) linhas.push(`Alergias relatadas: ${alergias.join(", ")}.`);
      if (perfil.convenio) linhas.push(`Convênio: ${perfil.convenio}.`);
    }
    const proximas = await db.consulta.findMany({
      where: { pacienteId: usuario.id, status: "confirmada", dataInicio: { gte: new Date() } },
      include: { medico: { select: { nome: true } } },
      orderBy: { dataInicio: "asc" },
      take: 3,
    });
    if (proximas.length) {
      const rotulos = proximas.map(
        (c) =>
          `${c.especialidade} com ${c.medico.nome} em ${quandoClinica(c.dataInicio)}`,
      );
      linhas.push(`Próximas consultas confirmadas: ${rotulos.join("; ")}.`);
    }
  }

  if (usuario.role === "MEDICO") {
    const perfil = await db.perfilMedico.findUnique({ where: { userId: usuario.id } });
    if (perfil) linhas.push(`Especialidade: ${perfil.especialidade} (${perfil.crm}).`);
    const pendentes = await db.consulta.count({
      where: { medicoId: usuario.id, status: "em_espera" },
    });
    if (pendentes) linhas.push(`Consultas aguardando confirmação: ${pendentes}.`);
  }

  return linhas.length ? `\n\nContexto atual do usuário na plataforma:\n${linhas.join("\n")}` : "";
}

/**
 * Prompt do sistema — CURTO e DIRETIVO (prompt longo = mais pré-processamento
 * e mais divagação do modelo; curto = resposta mais rápida e no assunto).
 *
 * POLÍTICA DE INTENÇÃO (bug real 2026-09, reclamado 2x pelo dono): a paciente
 * pediu só "renovar receita, sem sintomas" e o assistente abria uma anamnese
 * sem sentido. Regra: pedido administrativo recebe o CAMINHO prático — nunca
 * interrogatório de sintomas. A triagem guiada só existe no fluxo de
 * agendamento (rota /api/anamnese), fora deste chat.
 */
// M6: o nome do usuário NÃO vai mais no prompt (identificador direto).
const instrucoesBase = (role: string) =>
  `Você é a BION IA. Fale com o usuário (${role}) em PT-BR, tratando-o por "você", 1 a 4 frases, direto. Não prescreva. Urgência: SAMU 192. Triagem não é neste chat.`;

/**
 * M6: identificadores diretos do usuário (nome, e-mail e, para paciente, CPF,
 * telefone e data de nascimento) para remover do texto enviado à IA externa.
 */
async function identificadoresDoUsuario(usuario: {
  id: string;
  nome: string;
  email: string;
  role: string;
}): Promise<IdentificadoresPaciente> {
  const ids: IdentificadoresPaciente = {
    nome: usuario.nome,
    email: usuario.email,
    substitutoNome: usuario.role === "PACIENTE" ? "o paciente" : "o usuário",
  };
  if (usuario.role !== "PACIENTE") return ids;
  const p = await db.perfilPaciente.findUnique({
    where: { userId: usuario.id },
    select: { cpf: true, telefone: true, dataNascimento: true },
  });
  return p ? { ...ids, cpf: p.cpf, telefone: p.telefone, dataNascimento: dataNascimentoParaIso(p.dataNascimento) } : ids;
}

/**
 * LGPD (Copilot do médico): nomes dos pacientes que têm consulta com este
 * médico, buscados AQUI no servidor (nunca do cliente), para trocar por
 * "o paciente" no texto que o médico digita antes de ir para o Google.
 */
async function nomesPacientesDoMedico(medicoId: string): Promise<string[]> {
  const consultas = await db.consulta.findMany({
    where: { medicoId },
    select: { paciente: { select: { nome: true } } },
    distinct: ["pacienteId"],
    take: 2000,
  });
  return consultas.map((c) => c.paciente.nome).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    // Pausa da BION IA (opt-in, BION_IA_PAUSADA=true): nada vai à IA.
    if (iaPausada()) return respostaIaPausada();
    // Portão jurídico: paciente sem o aceite da versão atual (NVIDIA) → 409.
    const pendente = await exigirConsentimentoIa(usuario);
    if (pendente) return pendente;
    const body = (await req.json()) as { mensagens?: MsgEntrada[]; stream?: boolean };
    const requestId = novoRequestId();

    const historico = (body.mensagens ?? [])
      .filter((m) => (m?.texto ?? "").trim() && ["usuario", "ia"].includes(m.remetente))
      .filter((m) => m.texto.length < 500)
      .slice(-LIMITE_HISTORICO);

    if (!historico.length) {
      return Response.json({ erro: "Nenhuma mensagem recebida." }, { status: 400 });
    }

    const ultima = (body.mensagens ?? []).at(-1)?.texto?.trim() ?? "";
    const saudacao = /^(oi|ol[áa]|boa\s+(noite|tarde|dia)|e a[ií]|hey)[\s!.?]*$/i.test(ultima);
    const contexto = saudacao ? "" : await montarContexto(usuario);
    // M6: identificadores diretos saem de TODO o texto (prompt + histórico
    // digitado) antes de qualquer canal de IA — em todos os canais.
    const mensagens = anonimizarMensagensIa(
      [
        {
          role: "assistant" as const,
          content: instrucoesBase(usuario.role) + contexto,
        },
        ...historico.map((m) => ({
          role: m.remetente === "usuario" ? ("user" as const) : ("assistant" as const),
          content: m.texto.trim().slice(0, 4000),
        })),
      ],
      await identificadoresDoUsuario(usuario),
    );
    // LGPD: no Copilot do médico, tira também os dados de PACIENTES que ele
    // digitar (nomes conhecidos, CPF, telefone, e-mail, CEP, datas e endereço).
    const mensagensFinais =
      usuario.role === "MEDICO"
        ? anonimizarMensagensTexto(mensagens, { nomesPacientes: await nomesPacientesDoMedico(usuario.id) })
        : mensagens;

    // IA generativa em cadeia (identificadores já removidos acima).
    if (body.stream === true) {
      const enc = new TextEncoder();
      const linha = (o: unknown) => enc.encode(`${JSON.stringify(o)}\n`);
      const gerador = chatStreamComFonte(mensagensFinais, TIMEOUT_MS, { requestId, primeiroTokenMs: PRIMEIRO_TOKEN_MS });
      const corpo = new ReadableStream<Uint8Array>({
        async start(ctrl) {
          ctrl.enqueue(linha({ tipo: "inicio", requestId }));
          try {
            for await (const ev of gerador) {
              if (ev.tipo === "delta") ctrl.enqueue(linha({ tipo: "delta", texto: ev.texto }));
              else if (ev.tipo === "raciocinio") ctrl.enqueue(linha({ tipo: "raciocinio", texto: ev.texto }));
              else if (ev.tipo === "fim") ctrl.enqueue(linha({ tipo: "fim", fonte: ev.fonte, modelo: ev.modelo, requestId }));
              else
                ctrl.enqueue(
                  linha({
                    tipo: "erro",
                    erro: `${motivoFalhaIa(ev.registros)} Tente de novo em alguns segundos — este chat não usa resposta local.`,
                    requestId,
                  }),
                );
            }
          } catch {
            ctrl.enqueue(linha({ tipo: "erro", erro: "A BION IA falhou no meio da resposta. Tente de novo.", requestId }));
          }
          ctrl.close();
        },
        async cancel() {
          await gerador.return(undefined);
        },
      });
      return new Response(corpo, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Request-Id": requestId,
        },
      });
    }

    // JSON (sem stream): mesmo formato de antes + requestId.
    const r = await chatComFonte(mensagensFinais, TIMEOUT_MS, undefined, {
      somenteGemini: true,
      retries: 0,
      requestId,
    });
    if (r.texto) {
      // `raciocinio` separado de `resposta` (a cópia/inserção usa só `resposta`).
      return ok({ resposta: r.texto, raciocinio: r.raciocinio ?? null, fonte: r.fonte, modelo: r.modelo, requestId });
    }
    return Response.json(
      {
        erro: `${motivoFalhaIa(r.registros)} Tente de novo em alguns segundos — este chat não usa resposta local.`,
        fonte: null,
        requestId,
      },
      { status: 503 },
    );
  } catch (erro) {
    return falha(erro);
  }
}

export const maxDuration = 60;
