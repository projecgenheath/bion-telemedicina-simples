import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { chatComFonte, type AnonNomes, type FonteLlm } from "@/lib/server/llm";
import { turnoMotor, ETAPAS_MOTOR, type MotorCtx } from "@/lib/server/anamnese-motor";

/**
 * Triagem pré-consulta guiada pela BION IA (storytelling clínico).
 *
 * FLUXO DO PRODUTO: o pagamento CONFIRMA a consulta (rota /api/consultas e
 * webhook do gateway). A triagem é OBRIGATÓRIA e fica disponível LOGO APÓS
 * a confirmação ATÉ 5 MINUTOS ANTES do horário da consulta — o servidor
 * impõe a janela; concluir a triagem NÃO altera o status da consulta
 * (exceto legado "pendente_anamnese", que é confirmado aqui para migrar
 * registros antigos).
 *
 * POST  { consultaId, mensagem? }  → um turno da conversa.
 *        Sem mensagem = abertura da etapa atual (ou retomada).
 * PATCH { consultaId, acao: "concluir" }            → conclui a triagem e avisa o médico.
 * PATCH { consultaId, acao: "documento", documento } → registra documento anexado durante a triagem.
 *
 * Duplo motor:
 *  1. IA generativa em cadeia (llm.ts): credenciais próprias → endpoint
 *     público sem chave (nomes do paciente e do médico ANONIMIZADOS antes
 *     do envio — LGPD) → SDK do sandbox — conversa livre com o prompt
 *     clínico completo;
 *  2. Motor determinístico (src/lib/server/anamnese-motor.ts): conduz o
 *     mesmo rito de storytelling SEM depender de LLM — garante que a
 *     triagem nunca fique bloqueada.
 *
 * Estilo obrigatório nos dois caminhos: conversa natural e CURTA (acolher
 * em uma frase → UMA pergunta objetiva), SEMPRE terminar em pergunta,
 * NUNCA interrogatório nem monólogo, sinais de alarme → SAMU 192.
 */

const TIMEOUT_LLM_MS = 32_000;

/** Janela da triagem: fecha 5 minutos antes do início da consulta. */
const JANELA_TRIAGEM_MS = 5 * 60_000;

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
}) => `Você é a BION IA, assistente clínica da plataforma de telemedicina BION. Você conduz a TRIAGEM PRÉ-CONSULTA de ${ctx.nomePaciente} — uma consulta de ${ctx.especialidade} com ${ctx.medico}, marcada para ${ctx.quando}. A consulta JÁ está confirmada e paga; seu papel é ouvir e organizar a história do paciente para o médico receber um dossiê pronto antes do atendimento.

ETAPA ATUAL: ${ROTULO_ETAPA[ctx.etapa] ?? ctx.etapa} (índice interno: ${ctx.etapa})

ROTEIRO COMPLETO (para você saber de onde veio e para onde vai — siga APENAS a etapa atual):
1. identificacao — apresente os dados do perfil em 1 frase e peça que confirme ou corrija (não desligue nomes de campos).
2. queixa — o motivo da consulta, NAS PALAVRAS DO PACIENTE.
3. historia — História da Doença Atual: cronologia (quando começou, súbito ou gradual), local e irradiação, característica (pontada, pressão, queimação), intensidade (0–10), o que piora/melhora, sintomas associados, medicação tentada. Para dor, use a lógica OPQRST espalhada em perguntas CURTAS e separadas.
4. sistemas — uma pergunta só: "mais algum sintoma pelo corpo — febre, enjoo, tontura, intestino, urina?".
5. antecedentes — doenças anteriores, cirurgias, internações, alergias importantes.
6. familia — hipertensão, diabetes, cardiopatias, câncer na família próxima.
7. habitos — tabagismo, álcool, atividade física, sono.
8. gineco — só se PERTINENTE (sexo/gênero/queixa): ciclo, gestações, contracepção — sempre com respeito. Se não pertinente, encerre a etapa imediatamente.
9. psicossocial — humor, estresse, impacto da queixa na rotina.
10. medicamentos — nome, dose, frequência (incluindo vitaminas e chás).
11. documentos — pergunte se ele tem EXAME OU DOCUMENTO para mostrar ao médico (a interface abre a caixa de upload; você só acolhe a resposta e encerra a etapa).
12. fechamento — faça um RESUMO organizado em no máximo 8 linhas e pergunte: "Tem mais alguma coisa importante? Está tudo correto?".

REGRAS DE ESTILO — CONVERSA CURTA DE PESSOA REAL, NUNCA FORMULÁRIO:
- Máximo de 3 frases curtas por mensagem (o resumo do fechamento é a única exceção).
- Toda mensagem TERMINA com UMA pergunta clara, terminada em "?". NUNCA termine apenas afirmando ou concordando — se não tem pergunta, é porque deve avançar de etapa.
- UMA pergunta por vez. Jamais empilhe dois interrogativos diferentes na mesma frase ("e como você classificaria X, e o que faz piorar?" é PROIBIDO).
- Eco curto: reconheça o que o paciente disse com as PRÓPRIAS palavras dele em até meia frase ("Dor no lado direito há três dias, entendi...") e vá direto à próxima pergunta. NUNCA repita o relato inteiro de forma clínica e robótica.
- Fale como gente: frases de 8 a 18 palavras, zero jargão, zero tom de laudo.
- Se o paciente já respondeu algo espontaneamente, NÃO pergunte de novo — registre e siga.
- Avance rápido: conclua a etapa assim que o essencial for dito (a maioria fecha em 1–2 turnos; só "historia" pode ir até 4). Não exija precisão que o paciente claramente não tem.
- Se o paciente disse "não sei" ou pediu para pular: aceite na hora, registre "não informado" e siga para o próximo ponto.
- Sinais de alarme (dor no peito intensa, falta de ar, síncope, déficit neurológico, sangramentos, ideação suicida): interrompa o roteiro e oriente urgência presencial (SAMU 192).
- Você não prescreve e não fecha diagnóstico.

DADOS DO PERFIL DO PACIENTE (base da etapa de identificação):
${ctx.perfil}

DADOS JÁ COLETADOS ATÉ AGORA (JSON parcial):
${JSON.stringify(ctx.coleta)}

FORMATO DE SAÍDA — responda EXCLUSIVAMENTE com um JSON válido, sem texto fora dele:
{
  "resposta": "<sua mensagem em linguagem natural para o paciente — CURTA e terminando em pergunta>",
  "etapa_concluida": <true quando o essencial da etapa já foi dito — seja generoso, não estique; false quando a pergunta que você acabou de fazer ainda está aguardando resposta>,
  "coleta": { "<campos extraídos desta etapa na resposta do paciente>" },
  "perfil_atualizacoes": { "peso": <número>, "altura": <número>, "profissao": "<texto>", "estadoCivil": "<texto>", "telefone": "<texto>" }
}
- "perfil_atualizacoes" só na etapa de identificação, e só com dados que o paciente EXPLICITAMENTE corrigiu (campo ausente ou igual ao perfil = omita).
- Nunca invente valores para a coleta: só registre o que o paciente disse.`;

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

/** Nomes que saem da conversa no canal público (LGPD) e seus substitutos neutros. */
function anonNomes(
  usuario: { nome: string },
  medicoNome: string,
  genero: string,
): AnonNomes {
  const tratoPaciente = genero.toLowerCase().startsWith("m") ? "o paciente" : "a paciente";
  const lista: AnonNomes = [{ nome: usuario.nome, substituto: tratoPaciente }];
  const primeiro = usuario.nome.split(" ")[0] ?? "";
  if (primeiro.length >= 3 && primeiro !== usuario.nome) {
    lista.push({ nome: primeiro, substituto: tratoPaciente });
  }
  if (medicoNome && medicoNome.length >= 3) {
    lista.push({ nome: medicoNome, substituto: "o médico" });
    const sobrenomeMedico = medicoNome.split(" ").slice(-1)[0] ?? "";
    if (sobrenomeMedico.length >= 3 && sobrenomeMedico !== medicoNome) {
      lista.push({ nome: sobrenomeMedico, substituto: "o médico" });
    }
  }
  return lista;
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
    if (consulta.status === "cancelada" || consulta.status === "concluida") {
      return Response.json({ erro: "Esta consulta não aceita mais triagem." }, { status: 409 });
    }

    // Janela da triagem IMPOSTA PELO SERVIDOR:
    //  1. disponível logo após a CONFIRMAÇÃO (= pagamento aprovado);
    //  2. fecha 5 minutos antes do horário da consulta.
    if (!consulta.pago) {
      return Response.json(
        { erro: "O pagamento precisa estar confirmado para liberar sua triagem." },
        { status: 402 },
      );
    }
    const limiteTriagem = consulta.dataInicio.getTime() - JANELA_TRIAGEM_MS;
    if (Date.now() >= limiteTriagem) {
      return Response.json(
        { erro: "A triagem fica disponível até 5 minutos antes da consulta — esta janela já foi encerrada." },
        { status: 409 },
      );
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
        texto: "Esta triagem já foi concluída e enviada para o seu médico. Se precisar acrescentar algo, use as mensagens da consulta ou o card de documentos.",
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

    /* -------- caminho 1: IA generativa em cadeia (env → público → SDK) -------- */
    let parsed: RespostaLLM | null = null;
    let viaMotor = false;
    let llmFonte: FonteLlm | null = null;

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
        const llmRes = await chatComFonte(mensagens, TIMEOUT_LLM_MS, anonNomes(usuario, consulta.medico.nome, perfilDados?.genero ?? ""));
        llmFonte = llmRes.fonte;
        parsed = llmRes.texto ? extrairJson(llmRes.texto) : null;
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
      // Janela de disponibilidade da triagem (para a UI exibir o prazo)
      disponivelAte: new Date(limiteTriagem).toISOString(),
      fonte: viaMotor ? "local" : llmFonte,
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

    // acao: concluir — triagem pronta → avisa médico e paciente.
    // NÃO altera o status da consulta (o pagamento já a confirmou);
    // apenas o LEGADO "pendente_anamnese" é confirmado aqui, para
    // migrar registros antigos do fluxo anterior.
    if (anamnese.status === "concluida") {
      const dados = await carregarDados(usuario);
      return ok(dados);
    }

    const quando = consulta.dataInicio.toLocaleDateString("pt-BR") +
      " às " + consulta.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    await db.$transaction([
      db.anamnese.update({ where: { id: anamnese.id }, data: { status: "concluida", etapa: "fechamento" } }),
      ...(consulta.status === "pendente_anamnese"
        ? [db.consulta.update({ where: { id: consulta.id }, data: { status: "confirmada" } })]
        : []),
    ]);

    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "agenda",
          titulo: "Triagem concluída",
          texto: `Sua triagem da consulta de ${consulta.especialidade} com ${consulta.medico.nome} (${quando}) foi enviada. Tudo pronto para o atendimento!`,
          para: "paciente",
        },
        {
          tipo: "agenda",
          titulo: "Triagem disponível",
          texto: `${usuario.nome} concluiu a triagem (anamnese) da consulta de ${quando}. Acesse a aba Anamnese na sala da consulta.`,
          para: "medico",
          usuarioId: consulta.medico.id,
        },
      ],
      {
        acao: "ANAMNESE_CONCLUIDA",
        categoria: "prontuario",
        detalhes: `Triagem (anamnese) da consulta ${consulta.id} (${consulta.especialidade} com ${consulta.medico.nome}) concluída e enviada ao médico`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}
