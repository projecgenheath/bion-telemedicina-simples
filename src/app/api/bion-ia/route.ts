import { NextRequest } from "next/server";
import { quandoClinica } from "@/lib/server/fuso";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { chatComFonte, registrosGemini, type AnonNomes } from "@/lib/server/llm";
import { anonimizarMensagensIa, type IdentificadoresPaciente } from "@/lib/server/anonimizar-ia";
import { dataNascimentoParaIso } from "@/lib/idade";

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
 * IA generativa SOMENTE via Gemma 4 26B (Google API). Motor local NÃO é
 * usado neste chat — só na triagem (/api/anamnese). Se o modelo falhar,
 * devolvemos erro amigável para o paciente tentar de novo.
 */

const LIMITE_HISTORICO = 4;
/**
 * PRAZO TOTAL DA IA (medido em produção 2026-09-25): o Gemma responde bem em
 * 4-8s (com prefill); quando TRAVA (free tier), não adianta esperar 21s — o
 * paciente espera demais e ainda cai no motor local. 15s limita o pior caso
 * (Gemma travado → local) a ~14s, mantendo folga para respostas reais de 8-12s.
 */
const TIMEOUT_MS = 20_000;

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

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { mensagens?: MsgEntrada[] };

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
    // digitado) antes de qualquer canal de IA — não só no canal público.
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

    // IA generativa em cadeia; nomes reais são removidos no canal público.
    const primeiroNome = usuario.nome.split(" ")[0] ?? "";
    const anon: AnonNomes = [
      { nome: usuario.nome, substituto: "(usuário BION)" },
      ...(primeiroNome.length >= 3 && primeiroNome !== usuario.nome
        ? [{ nome: primeiroNome, substituto: "(usuário BION)" }]
        : []),
    ];
    // somenteGemini: não gasta tempo em público/SDK; sem fallback local.
    const { texto: respostaLlm, fonte, modelo } = await chatComFonte(mensagens, TIMEOUT_MS, anon, {
      somenteGemini: true,
      retries: 0,
    });
    if (respostaLlm) {
      return ok({ resposta: respostaLlm, fonte, modelo });
    }
    const ultimo = registrosGemini().at(-1);
    const motivo =
      ultimo?.erro === "timeout"
        ? "O modelo demorou demais para responder."
        : ultimo?.status === 429
          ? "A cota da API do Gemma esgotou neste minuto."
          : ultimo?.status === 403 || ultimo?.status === 401
            ? "A chave da API do Gemma foi recusada."
            : ultimo?.status && ultimo.status >= 400
              ? `O Gemma devolveu HTTP ${ultimo.status}.`
              : "O Gemma não devolveu texto utilizável.";
    return Response.json(
      {
        erro: `${motivo} Tente de novo em alguns segundos — este chat não usa resposta local.`,
        fonte: null,
      },
      { status: 503 },
    );
  } catch (erro) {
    return falha(erro);
  }
}

export const maxDuration = 60;
