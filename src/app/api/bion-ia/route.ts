import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { chatCompleto } from "@/lib/server/llm";
import { respostaLocal } from "@/lib/server/chat-local";

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
 * Quando o LLM não está acessível (produção/Vercel — o endpoint do SDK é
 * interno do sandbox), responde com o motor local por intenções, que usa
 * dados reais do banco e mantém a segurança clínica (alarme → SAMU 192).
 */

const LIMITE_HISTORICO = 12;
const TIMEOUT_MS = 25_000;

type MsgEntrada = { remetente: string; texto: string };

async function montarContexto(
  usuario: { id: string; nome: string; role: "PACIENTE" | "MEDICO" | "ADMIN" },
): Promise<string> {
  const linhas: string[] = [];

  if (usuario.role === "PACIENTE") {
    const perfil = await db.perfilPaciente.findUnique({ where: { userId: usuario.id } });
    if (perfil) {
      const medicamentos = JSON.parse(perfil.medicamentos || "[]") as string[];
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
          `${c.especialidade} com ${c.medico.nome} em ${c.dataInicio.toLocaleDateString("pt-BR")} às ${c.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
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

const instrucoesBase = (nome: string, role: string) => `Você é o assistente virtual da BION Telemedicina, uma plataforma brasileira de telemedicina. Atende pelo nome "BION IA".

Usuário atual: ${nome} (papel: ${role}).

Diretrizes obrigatórias:
- Responda SEMPRE em português do Brasil, com linguagem acolhedora e objetiva.
- Formate respostas em Markdown leve: **negrito** para destaques, listas com "•", no máximo 4 tópicos por bloco.
- Você NÃO prescreve, não altera doses e não faz diagnósticos fechados. Oriente conforme a prescrição recebida e, em caso de dúvida específica, recomende contato com o médico ou teleconsulta.
- Sinais de alerta (dor no peito, falta de ar intensa, síncope, fala arrastada, sangramento forte, ideação suicida): instrua a buscar atendimento de urgência presencial imediatamente (SAMU 192).
- Nunca invente códigos CID-10; se não tiver certeza, diga que pode consultar a lista de códigos comuns e sugira confirmar com o profissional.
- Respeite a LGPD: não peça dados sensíveis além do necessário e lembre que as conversas são registradas de forma confidencial.
- Se a pergunta for fora do escopo de saúde ou da plataforma, redirecione com gentileza para o suporte BION.`;

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { mensagens?: MsgEntrada[] };

    const historico = (body.mensagens ?? [])
      .filter((m) => (m?.texto ?? "").trim() && ["usuario", "ia"].includes(m.remetente))
      .slice(-LIMITE_HISTORICO);

    if (!historico.length) {
      return Response.json({ erro: "Nenhuma mensagem recebida." }, { status: 400 });
    }

    const contexto = await montarContexto(usuario);
    const mensagens = [
      {
        role: "assistant" as const,
        content: instrucoesBase(usuario.nome, usuario.role) + contexto,
      },
      ...historico.map((m) => ({
        role: m.remetente === "usuario" ? ("user" as const) : ("assistant" as const),
        content: m.texto.trim().slice(0, 4000),
      })),
    ];

    // LLM quando acessível; fallback local determinístico quando não.
    const respostaLlm = await chatCompleto(mensagens, TIMEOUT_MS);
    if (respostaLlm) {
      return ok({ resposta: respostaLlm });
    }
    const resposta = await respostaLocal(usuario, historico);
    return ok({ resposta, fonte: "local" });
  } catch (erro) {
    return falha(erro);
  }
}

export const maxDuration = 30;
