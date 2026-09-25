import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { chatComFonte, type AnonNomes } from "@/lib/server/llm";
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
 * IA generativa em cadeia (llm.ts): credenciais próprias → endpoint público
 * sem chave (com NOMES anonimizados antes do envio — LGPD) → SDK do sandbox.
 * Quando nenhum canal responde, o motor local por intenções assume, usando
 * dados reais do banco e mantendo a segurança clínica (alarme → SAMU 192).
 * A resposta informa a `fonte` para o cliente exibir com transparência.
 */

const LIMITE_HISTORICO = 8;
/**
 * PRAZO TOTAL DA IA (medido em produção 2026-09-25): o Gemma responde bem em
 * 4-8s (com prefill); quando TRAVA (free tier), não adianta esperar 21s — o
 * paciente espera demais e ainda cai no motor local. 15s limita o pior caso
 * (Gemma travado → local) a ~14s, mantendo folga para respostas reais de 8-12s.
 */
const TIMEOUT_MS = 15_000;

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
const instrucoesBase = (nome: string, role: string) => `Você é a BION IA, assistente virtual da BION Telemedicina (plataforma brasileira de telemedicina).

Usuário atual: ${nome} (papel: ${role}).

ESTILO (obrigatório):
- Português do Brasil, acolhedor e DIRETO: a primeira linha já responde ao que foi pedido. No máximo 5 linhas.
- Markdown leve: **destaques** e listas com "•". Sem preâmbulo, sem repetir o pedido, sem perguntas desnecessárias.

POLÍTICA DE INTENÇÃO (obrigatória):
- Pedido administrativo (renovar/emissão de receita, agendar, reagendar, pagamento, laudos, agenda, plataforma): responda o caminho prático em 2-3 passos e ofereça o botão **Agendar consulta** quando fizer sentido.
- Renovação de receita: explique que a receita é emitida pelo médico em uma **teleconsulta de reavaliação** (rápida, serve para uso contínuo) e convide a agendar. Se a pessoa disser que NÃO tem sintomas, NÃO pergunte sintomas e NÃO monte anamnese — siga direto para o agendamento.
- A triagem guiada (anamnese) só acontece DENTRO do fluxo de agendamento, nunca por iniciativa sua neste chat.

LIMITES:
- Não prescreva, não ajuste doses, não feche diagnóstico; nesses casos recomende a teleconsulta.
- Sinais de alerta (dor no peito, falta de ar intensa, síncope, fala arrastada, sangramento forte, ideação suicida): oriente urgência presencial imediata — SAMU 192.
- Não invente CID-10. LGPD: não peça dados sensíveis além do necessário; as conversas são registradas de forma confidencial.
- Fora do escopo de saúde ou da plataforma, redirecione com gentileza para o suporte BION.`;

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

    // IA generativa em cadeia; nomes reais são removidos no canal público.
    const primeiroNome = usuario.nome.split(" ")[0] ?? "";
    const anon: AnonNomes = [
      { nome: usuario.nome, substituto: "(usuário BION)" },
      ...(primeiroNome.length >= 3 && primeiroNome !== usuario.nome
        ? [{ nome: primeiroNome, substituto: "(usuário BION)" }]
        : []),
    ];
    const { texto: respostaLlm, fonte, modelo } = await chatComFonte(mensagens, TIMEOUT_MS, anon);
    if (respostaLlm) {
      return ok({ resposta: respostaLlm, fonte, modelo });
    }
    const resposta = await respostaLocal(usuario, historico);
    return ok({ resposta, fonte: "local" });
  } catch (erro) {
    return falha(erro);
  }
}

export const maxDuration = 30;
