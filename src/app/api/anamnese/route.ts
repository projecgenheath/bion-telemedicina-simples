import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { chatCompleto } from "@/lib/server/llm";
import { turnoMotor, ETAPAS_MOTOR, type MotorCtx } from "@/lib/server/anamnese-motor";

/**
 * Anamnese guiada pela BION IA (storytelling clínico) — pós-pagamento.
 *
 * A consulta nasce "pendente_anamnese" após o pagamento e só é CONFIRMADA
 * quando a anamnese é concluída aqui.
 *
 * POST  { consultaId, mensagem? }  → um turno da conversa.
 *        Sem mensagem = abertura da etapa atual (ou retomada).
 * PATCH { consultaId, acao: "concluir" }            → conclui anamnese e confirma a consulta.
 * PATCH { consultaId, acao: "documento", documento } → registra documento anexado durante a anamnese.
 *
 * Duplo motor:
 *  1. LLM real (quando acessível — sandbox ou endpoint externo BION_LLM_*):
 *     conversa livre com o prompt clínico completo;
 *  2. Motor determinístico (src/lib/server/anamnese-motor.ts): conduz o
 *     mesmo rito de storytelling SEM depender de LLM — garante que a
 *     anamnese nunca fique bloqueada (o endpoint do SDK só existe na rede
 *     do sandbox; na Vercel não há LLM).
 *
 * Estilo obrigatório nos dois caminhos: conversa natural (acolher →
 * aprofundar → avançar), UMA pergunta por vez, NUNCA interrogatório,
 * sinais de alarme → SAMU 192.
 */

const TIMEOUT_LLM_MS = 25_000;

type MsgEntrada = { remetente: "usuario" | "ia"; texto: string };

type Coleta = Record<string, Record<string, unknown>>;

type DocumentoAnamnese = { nome: string; tipo: string; exameImportado: boolean; resumo?: string };

type RespostaLLM = {
  resposta?: string;
  etapa_concluida?: boolean;
  coleta?: Record<string, unknown>;
  perfil_atualizacoes?: {
    peso?: number | string;
    altura?: number | string;
    profissao?: string;
    estadoCivil?: string;
    telefone?: string;
  };
};

/** Ordem canônica das etapas da anamnese (roteiro clínico clássico). */
const ETAPAS = ETAPAS_MOTOR;

const ROTULO_ETAPA: Record<string, string> = {
  identificacao: "Identificação",
  queixa: "Queixa principal",
  historia: "História da doença atual",
  sistemas: "Revisão de sistemas",
  antecedentes: "Antecedentes pessoais",
  familia: "Antecedentes familiares",
  habitos: "Hábitos e estilo de vida",
  gineco: "História ginecológica/sexual",
  psicossocial: "Aspectos psicossociais",
  medicamentos: "Medicamentos",
  documentos: "Documentos e exames",
  fechamento: "Revisão e fechamento",
};

function extrairJson(texto: string): RespostaLLM | null {
  const limpo = texto.replace(/```json/gi, "```").split("```").find((b) => b.trim().startsWith("{"));
  const bruto = limpo ?? texto;
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(bruto.slice(inicio, fim + 1)) as RespostaLLM;
  } catch {
    return null;
  }
}

/** Mescla a coleta do LLM (campos soltos) na etapa atual. */
function mesclarColeta(atual: Coleta, etapa: string, novo: unknown): Coleta {
  if (!novo || typeof novo !== "object" || Array.isArray(novo)) return atual;
  return {
    ...atual,
    [etapa]: { ...(atual[etapa] ?? {}), ...(novo as Record<string, unknown>) },
  };
}

/** Mescla a coleta do motor (chaves = etapas, inclusive a semente da próxima). */
function mesclarColetaMotor(atual: Coleta, novo: Coleta): Coleta {
  const saida: Coleta = { ...atual };
  for (const [etapa, dados] of Object.entries(novo)) {
    saida[etapa] = { ...(saida[etapa] ?? {}), ...(dados as Record<string, unknown>) };
  }
  return saida;
}

/** Próxima etapa canônica; pula "gineco" quando não pertinente ao gênero. */
function proximaEtapa(etapaAtual: string, genero: string): string {
  const idx = ETAPAS.indexOf(etapaAtual as (typeof ETAPAS)[number]) + 1;
  let proxima = ETAPAS[Math.min(idx, ETAPAS.length - 1)];
  if (proxima === "gineco" && !String(genero).toLowerCase().startsWith("f")) {
    proxima = "psicossocial";
  }
  return proxima;
}

const promptSistema = (ctx: {
  nomePaciente: string;
  especialidade: string;
  medico: string;
  quando: string;
  etapa: string;
  coleta: Coleta;
  perfil: string;
}) => `Você é a BION IA, assistente clínica da plataforma de telemedicina BION. Neste momento você conduz a ANAMNESE PRÉ-CONSULTA de ${ctx.nomePaciente}, que pagou por uma consulta de ${ctx.especialidade} com ${ctx.medico}, marcada para ${ctx.quando}. A anamnese vai para o médico ANTES do atendimento — ela é o seu dossiê de abertura.

ETAPA ATUAL: ${ROTULO_ETAPA[ctx.etapa] ?? ctx.etapa} (índice interno: ${ctx.etapa})

ROTEIRO COMPLETO (para você saber de onde veio e para onde vai — siga APENAS a etapa atual):
1. identificacao — nome, idade, sexo, profissão, estado civil, naturalidade, alergias, comorbidades, peso, altura (apresente os dados do perfil e peça que confirme ou corrija).
2. queixa — o motivo da consulta, NAS PALAVRAS DO PACIENTE.
3. historia — História da Doença Atual: cronologia (quando começou, súbito ou gradual), local e irradiação, característica (pontada, pressão, queimação), intensidade (0–10), contínuo ou intermitente, o que piora/melhora, sintomas associados, episódios prévios, medicação tentada e resultado. Para dor, use a lógica OPQRST espalhada ao longo da conversa.
4. sistemas — revisão breve por aparelhos (geral, cardiovascular, respiratório, gastrointestinal, geniturinário, neurológico, musculoesquelético, dermatológico, endócrino) — apenas sintomas relevantes à queixa.
5. antecedentes — doenças anteriores, cirurgias, internações, traumas, alergias, transfusões, vacinação, doenças crônicas.
6. familia — hipertensão, diabetes, cardiopatias, câncer, doenças hereditárias/psiquiátricas na família próxima.
7. habitos — tabagismo, álcool, outras substâncias, alimentação, atividade física, sono, trabalho/exposição, moradia.
8. gineco — só se PERTINENTE (sexo/gênero/queixa): menarca/menopausa, ciclo, gestações, partos, contracepção, atividade sexual, ISTs — sempre com respeito. Se não pertinente, encerre a etapa imediatamente.
9. psicossocial — humor, estresse, ansiedade, rede de apoio, impacto da queixa na rotina.
10. medicamentos — nome, dose, frequência e há quanto tempo usa (prescritos, automedicação, fitoterápicos, suplementos).
11. documentos — pergunte se ele tem algum EXAME OU DOCUMENTO que queira mostrar ao médico (a interface abre a caixa de upload; você só acolhe a resposta e encerra a etapa).
12. fechamento — faça um RESUMO organizado e humanizado de tudo o que coletou (identificação, queixa, evolução, fatores associados e contexto) e pergunte: "Tem mais alguma coisa que você acha importante me contar? Está tudo correto?".

REGRAS DE ESTILO — STORYTELLING, NUNCA INTERROGATÓRIO:
- Acolha primeiro: reconheça em 1–2 frases o que o paciente acabou de contar (empatia real, sem clichês robóticos).
- UMA pergunta por mensagem (no máximo duas, quando naturalmente conectadas).
- Converse como uma boa médica ouve: use as palavras do paciente, construa a linha temporal JUNTO dele.
- Se o paciente já respondeu algo espontaneamente, NÃO pergunte de novo — registre e siga.
- Repita o que entendeu quando a informação for densa ("Então foi na terça, depois do almoço...").
- Respostas curtas: 2 a 5 frases, português do Brasil, Markdown leve (**negrito** apenas para destaques essenciais).
- Sinais de alarme (dor no peito intensa, falta de ar, síncope, déficit neurológico, sangramentos, ideação suicida): interrompa o roteiro e oriente urgência presencial (SAMU 192).
- Você não prescreve e não fecha diagnóstico.

DADOS DO PERFIL DO PACIENTE (base da etapa de identificação):
${ctx.perfil}

DADOS JÁ COLETADOS ATÉ AGORA (JSON parcial):
${JSON.stringify(ctx.coleta)}

FORMATO DE SAÍDA — responda EXCLUSIVAMENTE com um JSON válido, sem texto fora dele:
{
  "resposta": "<sua mensagem em linguagem natural para o paciente>",
  "etapa_concluida": <true quando a etapa atual tiver informação suficiente para avançar — a pergunta final da etapa já foi respondida; false quando você ainda está explorando/aguardando resposta>,
  "coleta": { "<campos extraídos desta etapa na resposta do paciente>" },
  "perfil_atualizacoes": { "peso": <número>, "altura": <número>, "profissao": "<texto>", "estadoCivil": "<texto>", "telefone": "<texto>" }
}
- "perfil_atualizacoes" só na etapa de identificação, e só com dados que o paciente EXPLICITAMENTE corrigiu (campo ausente ou igual ao perfil = omita).
- Nunca invente valores para a coleta: só registre o que o paciente disse.
- "etapa_concluida": só true quando você já tiver o essencial da etapa atual E a conversa da etapa estiver fechada; o sistema então levará a conversa para a próxima etapa na sua próxima resposta.`;

type PerfilDados = {
  idade: number | null;
  genero: string;
  profissao: string;
  estadoCivil: string;
  telefone: string;
  alergias: string[];
  comorbidades: string[];
  medicamentos: string[];
  peso: string;
  altura: string;
  tipoSanguineo: string;
  convenio: string;
};

async function montarPerfilDados(usuarioId: string): Promise<PerfilDados | null> {
  const p = await db.perfilPaciente.findUnique({
    where: { userId: usuarioId },
    include: { user: { select: { nome: true } } },
  });
  if (!p) return null;
  const lista = (v: string) => {
    try {
      return (JSON.parse(v || "[]") as string[]) ?? [];
    } catch {
      return [];
    }
  };
  return {
    idade: p.idade ?? null,
    genero: p.genero || "",
    profissao: p.profissao || "",
    estadoCivil: p.estadoCivil || "",
    telefone: p.telefone || "",
    alergias: lista(p.alergias),
    comorbidades: lista(p.comorbidades),
    medicamentos: lista(p.medicamentos),
    peso: p.peso || "",
    altura: p.altura || "",
    tipoSanguineo: p.tipoSanguineo || "",
    convenio: p.convenio || "",
  };
}

function perfilParaPrompt(d: PerfilDados | null, nome: string): string {
  if (!d) return "Perfil não preenchido — comece a identificação perguntando o básico.";
  const lista = (v: string[]) => (v.length ? v.join(", ") : "—");
  return [
    `Nome: ${nome}`,
    `Idade: ${d.idade || "não informada"}`,
    `Sexo: ${d.genero || "não informado"}`,
    `Profissão: ${d.profissao || "não informada"}`,
    `Estado civil: ${d.estadoCivil || "não informado"}`,
    `Telefone: ${d.telefone || "não informado"}`,
    `Alergias/intolerâncias: ${lista(d.alergias)}`,
    `Comorbidades: ${lista(d.comorbidades)}`,
    `Medicamentos em uso: ${lista(d.medicamentos)}`,
    `Peso: ${d.peso ? `${d.peso} kg` : "não informado"}`,
    `Altura: ${d.altura ? `${d.altura} cm` : "não informada"}`,
    `Tipo sanguíneo: ${d.tipoSanguineo || "não informado"}`,
    `Convênio: ${d.convenio || "Particular"}`,
  ].join("\n");
}

/** Aplica correções de perfil ditas pelo paciente na identificação (com plausibilidade). */
async function aplicarPerfilAtualizacoes(
  usuarioId: string,
  up: RespostaLLM["perfil_atualizacoes"],
): Promise<string[]> {
  if (!up || typeof up !== "object") return [];
  const aplicados: string[] = [];
  const dadosPerfil: Record<string, string> = {};

  if (typeof up.telefone === "string" && up.telefone.trim()) {
    dadosPerfil.telefone = up.telefone.trim().slice(0, 40);
    aplicados.push("telefone");
  }
  if (typeof up.profissao === "string" && up.profissao.trim()) {
    dadosPerfil.profissao = up.profissao.trim().slice(0, 80);
    aplicados.push("profissão");
  }
  if (typeof up.estadoCivil === "string" && up.estadoCivil.trim()) {
    dadosPerfil.estadoCivil = up.estadoCivil.trim().slice(0, 40);
    aplicados.push("estado civil");
  }

  const peso = Number(up.peso);
  if (Number.isFinite(peso) && peso >= 20 && peso <= 400) {
    const ultimo = await db.medicao.findFirst({ where: { usuarioId, tipo: "peso" }, orderBy: { criadoEm: "desc" } });
    if (!ultimo || ultimo.valor1 !== peso) {
      await db.medicao.create({ data: { usuarioId, tipo: "peso", valor1: peso } });
    }
    dadosPerfil.peso = String(peso);
    aplicados.push(`peso ${peso} kg`);
  }
  const altura = Number(up.altura);
  if (Number.isFinite(altura) && altura >= 50 && altura <= 250) {
    const ultimo = await db.medicao.findFirst({ where: { usuarioId, tipo: "altura" }, orderBy: { criadoEm: "desc" } });
    if (!ultimo || ultimo.valor1 !== altura) {
      await db.medicao.create({ data: { usuarioId, tipo: "altura", valor1: altura } });
    }
    dadosPerfil.altura = String(altura);
    aplicados.push(`altura ${altura} cm`);
  }

  if (Object.keys(dadosPerfil).length) {
    await db.perfilPaciente.updateMany({ where: { userId: usuarioId }, data: dadosPerfil });
  }
  return aplicados;
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as { consultaId?: string; mensagem?: string; historico?: MsgEntrada[] };

    if (!body.consultaId) {
      return Response.json({ erro: "Consulta não informada." }, { status: 400 });
    }

    const consulta = await db.consulta.findFirst({
      where: { id: body.consultaId, pacienteId: usuario.id },
      include: { medico: { select: { nome: true } }, anamnese: true },
    });
    if (!consulta) {
      return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    }
    if (["cancelada", "concluida"].includes(consulta.status)) {
      return Response.json({ erro: "Esta consulta não aceita mais anamnese." }, { status: 409 });
    }

    // Garante o registro da anamnese (idempotente)
    let anamnese = consulta.anamnese;
    if (!anamnese) {
      anamnese = await db.anamnese.create({
        data: { consultaId: consulta.id, usuarioId: usuario.id },
      });
    }
    if (anamnese.status === "concluida") {
      return ok({
        texto: "Esta anamnese já foi concluída e enviada para o seu médico. Se precisar acrescentar algo, use as mensagens da consulta ou o card de documentos.",
        etapa: anamnese.etapa,
        coleta: JSON.parse(anamnese.coleta || "{}"),
        etapa_concluida: true,
        concluida: true,
      });
    }

    const coletaAtual = JSON.parse(anamnese.coleta || "{}") as Coleta;
    const etapaAtual = ETAPAS.includes(anamnese.etapa as (typeof ETAPAS)[number])
      ? anamnese.etapa
      : "identificacao";

    const mensagem = (body.mensagem ?? "").trim().slice(0, 4000);
    const historico = (body.historico ?? [])
      .filter((m) => m?.texto?.trim() && ["usuario", "ia"].includes(m.remetente))
      .slice(-14);

    const perfilDados = await montarPerfilDados(usuario.id);

    const quando = consulta.dataInicio.toLocaleDateString("pt-BR", { day: "numeric", month: "long" }) +
      " às " + consulta.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    /* -------- caminho 1: LLM real (quando o ambiente tiver acesso) -------- */
    let parsed: RespostaLLM | null = null;
    let viaMotor = false;

    // BION_MOTOR_LOCAL=1 força o motor determinístico (teste do comportamento
    // de produção, onde não há LLM acessível).
    const usarLlm = process.env.BION_MOTOR_LOCAL !== "1";

    if (usarLlm && (historico.length > 0 || Boolean(mensagem))) {
      const instrucaoAbertura = mensagem
        ? ""
        : coletaAtual && Object.keys(coletaAtual).length
          ? "ABERTURA (retomada): o paciente voltou para continuar a anamnese. Acolha o retorno brevemente e retome EXATAMENTE a etapa atual com uma pergunta natural (não repita o que já foi coletado)."
          : "";
      if (mensagem || instrucaoAbertura) {
        const mensagens = [
          {
            role: "assistant" as const,
            content:
              promptSistema({
                nomePaciente: usuario.nome,
                especialidade: consulta.especialidade,
                medico: consulta.medico.nome,
                quando,
                etapa: etapaAtual,
                coleta: coletaAtual,
                perfil: perfilParaPrompt(perfilDados, usuario.nome),
              }) + (instrucaoAbertura ? `\n\n${instrucaoAbertura}` : ""),
          },
          ...historico.map((m) => ({
            role: m.remetente === "usuario" ? ("user" as const) : ("assistant" as const),
            content: m.texto.slice(0, 4000),
          })),
          { role: "user" as const, content: mensagem || "(retomar etapa)" },
        ];
        const llmTexto = await chatCompleto(mensagens, TIMEOUT_LLM_MS);
        parsed = llmTexto ? extrairJson(llmTexto) : null;
      }
    }

    /* ------- caminho 2: motor determinístico (funciona em qualquer lugar) ------- */
    if (!parsed) {
      viaMotor = true;
      const ctxMotor: MotorCtx = {
        nomePaciente: usuario.nome,
        primeiroNome: usuario.nome.split(" ")[0] ?? usuario.nome,
        especialidade: consulta.especialidade,
        medico: consulta.medico.nome,
        quando,
        genero: perfilDados?.genero ?? "",
        perfil: {
          idade: perfilDados?.idade ?? null,
          profissao: perfilDados?.profissao || null,
          estadoCivil: perfilDados?.estadoCivil || null,
          telefone: perfilDados?.telefone || null,
          alergias: perfilDados?.alergias ?? [],
          comorbidades: perfilDados?.comorbidades ?? [],
          medicamentos: perfilDados?.medicamentos ?? [],
          peso: perfilDados?.peso ?? null,
          altura: perfilDados?.altura ?? null,
          tipoSanguineo: perfilDados?.tipoSanguineo || null,
        },
      };
      parsed = turnoMotor({ mensagem, etapa: etapaAtual, coleta: coletaAtual, ctx: ctxMotor }) as RespostaLLM;
    }

    const dados = await carregarDados(usuario);

    const texto = parsed.resposta?.trim() || "Deixa eu organizar as ideias e a gente segue — pode repetir a última mensagem?";

    // Consolida coleta + avanço de etapa
    const coletaNova = viaMotor
      ? mesclarColetaMotor(coletaAtual, (parsed.coleta ?? {}) as Coleta)
      : mesclarColeta(coletaAtual, etapaAtual, parsed.coleta);
    let etapaNova = etapaAtual;
    if (parsed.etapa_concluida && etapaAtual !== "fechamento") {
      etapaNova = proximaEtapa(etapaAtual, perfilDados?.genero ?? "");
    }

    await db.anamnese.update({
      where: { id: anamnese.id },
      data: { coleta: JSON.stringify(coletaNova), etapa: etapaNova },
    });

    let perfilAtualizado: string[] = [];
    if (parsed.perfil_atualizacoes && etapaAtual === "identificacao") {
      perfilAtualizado = await aplicarPerfilAtualizacoes(usuario.id, parsed.perfil_atualizacoes);
    }

    return ok({
      texto,
      etapa: etapaNova,
      etapaAnterior: etapaAtual,
      etapa_concluida: Boolean(parsed.etapa_concluida),
      coleta: coletaNova,
      perfilAtualizado,
      concluida: false,
      dados,
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      consultaId?: string;
      acao?: "concluir" | "documento";
      documento?: { nome?: string; tipo?: string; exameImportado?: boolean; resumo?: string };
    };
    if (!body.consultaId) {
      return Response.json({ erro: "Consulta não informada." }, { status: 400 });
    }

    const consulta = await db.consulta.findFirst({
      where: { id: body.consultaId, pacienteId: usuario.id },
      include: { medico: { select: { id: true, nome: true } }, anamnese: true },
    });
    if (!consulta || !consulta.anamnese) {
      return Response.json({ erro: "Anamnese não encontrada." }, { status: 404 });
    }
    const anamnese = consulta.anamnese;

    if (body.acao === "documento") {
      const doc = body.documento;
      if (!doc?.nome) {
        return Response.json({ erro: "Documento sem nome." }, { status: 400 });
      }
      const lista = JSON.parse(anamnese.documentos || "[]") as DocumentoAnamnese[];
      lista.push({
        nome: doc.nome.slice(0, 160),
        tipo: (doc.tipo || "arquivo").slice(0, 60),
        exameImportado: Boolean(doc.exameImportado),
        resumo: doc.resumo?.slice(0, 500),
      });
      await db.anamnese.update({ where: { id: anamnese.id }, data: { documentos: JSON.stringify(lista) } });
      const dados = await carregarDados(usuario);
      return ok(dados);
    }

    // acao: concluir — anamnese pronta → consulta confirmada
    if (anamnese.status === "concluida") {
      const dados = await carregarDados(usuario);
      return ok(dados);
    }

    const quando = consulta.dataInicio.toLocaleDateString("pt-BR") +
      " às " + consulta.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    await db.$transaction([
      db.anamnese.update({ where: { id: anamnese.id }, data: { status: "concluida", etapa: "fechamento" } }),
      db.consulta.update({ where: { id: consulta.id }, data: { status: "confirmada" } }),
    ]);

    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "agenda",
          titulo: "Anamnese concluída",
          texto: `Sua consulta de ${consulta.especialidade} com ${consulta.medico.nome} (${quando}) está confirmada. Bom atendimento!`,
          para: "paciente",
        },
        {
          tipo: "agenda",
          titulo: "Anamnese disponível",
          texto: `${usuario.nome} concluiu a anamnese da consulta de ${quando}. Acesse a aba Anamnese na sala da consulta.`,
          para: "medico",
          usuarioId: consulta.medico.id,
        },
      ],
      {
        acao: "ANAMNESE_CONCLUIDA",
        categoria: "prontuario",
        detalhes: `Anamnese da consulta ${consulta.id} (${consulta.especialidade} com ${consulta.medico.nome}) concluída — consulta confirmada`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
