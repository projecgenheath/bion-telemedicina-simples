/**
 * Motor determinístico da anamnese (storytelling clínico) — BION IA.
 *
 * Objetivo: garantir que a anamnese SEMPRE funcione, mesmo sem LLM acessível
 * (o endpoint do SDK só existe na rede do sandbox; na Vercel não há LLM).
 * O motor reproduz o rito pedido pelo produto:
 *   identificação → queixa → HDA (OPQRST) → sistemas → antecedentes →
 *   família → hábitos → gineco (só quando pertinente) → psicossocial →
 *   medicamentos → documentos → fechamento com resumo confirmado.
 *
 * Princípios de estilo (iguais ao prompt do LLM): acolher → aprofundar →
 * avançar; UMA pergunta por vez; eco das palavras do paciente; nunca
 * interrogatório; se o paciente já contou tudo, não insistir; sinais de
 * alarme → urgência presencial (SAMU 192).
 *
 * Contrato: `turnoMotor()` recebe a mensagem atual ("" = abrir/retomar etapa)
 * e devolve SEMPRE resposta + dados extraídos no mesmo formato do LLM. Os
 * contadores internos (_n) ficam na coleta, persistidos pela rota. Ao fechar
 * uma etapa o motor já semeia a próxima (_n=1) e inclui a pergunta dela na
 * mesma mensagem — a conversa flui sem exigir "ok" do paciente.
 */

export type MotorCtx = {
  nomePaciente: string;
  primeiroNome: string;
  especialidade: string;
  medico: string;
  quando: string;
  genero: string;
  perfil: {
    idade?: number | null;
    profissao?: string | null;
    estadoCivil?: string | null;
    telefone?: string | null;
    alergias: string[];
    comorbidades: string[];
    medicamentos: string[];
    peso?: string | null;
    altura?: string | null;
    tipoSanguineo?: string | null;
  };
};

export type MotorEntrada = {
  mensagem: string;
  etapa: string;
  coleta: Record<string, Record<string, unknown>>;
  ctx: MotorCtx;
};

export type MotorSaida = {
  resposta: string;
  etapa_concluida: boolean;
  /** Coleta por CHAVE DE ETAPA (a rota mescla todas as chaves). */
  coleta: Record<string, Record<string, unknown>>;
  perfil_atualizacoes?: {
    peso?: number;
    altura?: number;
    profissao?: string;
    estadoCivil?: string;
    telefone?: string;
  };
};

export const ETAPAS_MOTOR = [
  "identificacao",
  "queixa",
  "historia",
  "sistemas",
  "antecedentes",
  "familia",
  "habitos",
  "gineco",
  "psicossocial",
  "medicamentos",
  "documentos",
  "fechamento",
] as const;

/* ----------------------------- utilidades ------------------------------ */

const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(arr: T[], semente: string): T => arr[hash(semente) % arr.length];

const ACOLHIDAS = [
  "Entendi.",
  "Obrigada por contar.",
  "Isso ajuda muito.",
  "Anotado aqui.",
  "Compreendo, obrigada.",
];

const eco = (texto: string, max = 90) => {
  const t = texto.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const frase = t.split(/(?<=[.!?])\s/)[0] ?? t;
  return frase.length > max ? `${frase.slice(0, max).trim()}…` : frase;
};

const contador = (coleta: Record<string, Record<string, unknown>>, etapa: string) =>
  Number(coleta[etapa]?._n ?? 0);

const naoSei = (t: string) => /(nao sei|não sei|nao lembro|não lembro|nao tenho certeza)/.test(t);
const pular = (t: string) => /(pode pular|pula essa|pula esta|passar essa|passar esta|proximo assunto|próximo assunto|deixa pra la|deixa para la)/.test(t);
const corrigir = (t: string) => /(corrigir|voltar um pouco|me enganei|errei|mudei)/.test(t);

/* --------------------------- sinais de alarme -------------------------- */

function sinalDeAlarme(t: string): string | null {
  const n = normalizar(t);
  if (/(dor (no|na) peito|aperto no peito).{0,60}(forte|intensa|apertando|perspir|suor|bra[çc]o|mand[íi]bula)/.test(n)) return "dor no peito intensa";
  if (/(falta de ar|falto de ar|nao consigo respirar|sufocando|engasgando)/.test(n)) return "falta de ar";
  if (/(desmai|s[íi]ncope|perdi a consciencia|convuls)/.test(n)) return "desmaio/convulsão";
  if (/(fala embolada|rosto torto|boca torta|perdeu for[çc]a|perdi for[çc]a|entort)/.test(n)) return "déficit neurológico";
  if (/(sangramento|sangrando|perdendo sangue|vomitar sangue|sangue nas fezes)/.test(n)) return "sangramento";
  if (/(quero morrer|me matar|suicid|tirar minha vida)/.test(n)) return "ideação suicida";
  return null;
}

const MSG_ALARME = (sinal: string) =>
  `Antes de seguirmos: o que você descreveu (**${sinal}**) pode ser sinal de urgência. **Não espere a consulta** — ligue agora para o **SAMU 192** ou vá ao pronto-socorro mais próximo.\n\nAssim que estiver seguro, me avisa: se foi um susto que já passou, seguimos a anamnese com calma.`;

/* --------------------------- extratores básicos ------------------------ */

function extrairPeso(t: string): number | null {
  const m =
    t.match(/(?:peso|quilos?|balan[çc]a|emagreci|engordei)[^\d]{0,15}(\d{2,3}(?:[.,]\d)?)/) ||
    t.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:kg|quilos?)/);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return v >= 20 && v <= 400 ? Math.round(v * 10) / 10 : null;
}

function extrairAltura(t: string): number | null {
  const m = t.match(/1[.,](\d{2})\s*(?:m|metros?|cm|cent[íi]metros)?/) || t.match(/(\d{3})\s*(?:cm|cent[íi]metros)/);
  if (!m) return null;
  const v = m[0].match(/1[.,]/) ? Number(`1${m[1]}`) : Number(m[1]);
  return v >= 50 && v <= 250 ? v : null;
}

function extrairTelefone(t: string): string | null {
  const m = t.match(/(\(?\d{2}\)?\s?9?\s?\d{4}[-\s]?\d{4})/);
  return m ? m[1].trim() : null;
}

function extrairIntensidade(t: string): number | null {
  const m = t.match(/(?:0 a 10|intensidade|dor)[^\d]{0,12}(\d{1,2})/) || t.match(/\b(\d{1,2})\s*(?:de 10|\/10)\b/);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 0 && v <= 10 ? v : null;
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, sessenta: 60,
};

function extrairTempo(t: string): string | null {
  if (/\bhoje\b/.test(t)) return "começou hoje";
  if (/\bontem\b/.test(t)) return "começou ontem";
  const m = t.match(/(?:ha|fazem?|faz)\s*(\d+)\s*(dia|dias|semana|semanas|mes|meses|m[eê]s|m[eê]ses|ano|anos)/);
  if (m) return `há ${m[1]} ${m[2]}`;
  const me = t.match(/(?:ha|fazem?|faz)\s*(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s*(dia|dias|semana|semanas|mes|meses|m[eê]s|m[eê]ses|ano|anos)/);
  if (me) return `há ${NUMEROS_POR_EXTENSO[me[1]]} ${me[2]}`;
  const h = t.match(/(?:ha|fazem?|faz)\s*(\d+)\s*(minutos?|horas?)/);
  if (h) return `há ${h[1]} ${h[2]}`;
  if (/\b(minutos?|horas?)\b/.test(t)) return "há poucas horas";
  return null;
}

const MODO_INICIO = [
  { re: /(de repente|de uma vez|subito|do nada|acordei com)/, rotulo: "de forma súbita" },
  { re: /(aos poucos|gradual|piorando|espalhando|veio aumentando|crescendo)/, rotulo: "de forma gradual" },
];

const CARACTERISTICAS = ["pontada", "pressao", "queimacao", "aperto", "peso", "colica", "formigamento", "dormencia", "latejante", "fisgada"];

/* --------------------------- rótulos do resumo ------------------------- */

const ROTULOS: Record<string, string> = {
  identificacao: "Identificação e confirmações",
  queixa: "Queixa principal",
  historia: "História da doença atual",
  sistemas: "Sintomas associados (revisão de sistemas)",
  antecedentes: "Antecedentes pessoais",
  familia: "Antecedentes familiares",
  habitos: "Hábitos e estilo de vida",
  gineco: "História ginecológica/obstétrica",
  psicossocial: "Contexto psicossocial",
  medicamentos: "Medicamentos em uso",
  documentos: "Documentos anexados",
  alarme: "Sinal de alerta relatado",
};

const ROTULOS_CAMPO: Record<string, string> = {
  relato: "Relato",
  inicio: "Início",
  evolucao: "Evolução",
  local: "Local",
  caracteristica: "Característica",
  irradiacao: "Irradiação",
  intensidade: "Intensidade",
  piora: "Piora com",
  melhora: "Melhora com",
  fatores: "Fatores",
  associados: "Sintomas associados",
  medicacaoTentada: "Medicação tentada",
  detalhes: "Detalhes",
  registro: "Registro",
  anexado: "Documento anexado",
  naoAplicavel: "Não aplicável",
  complemento: "Complemento",
  confirmado: "Confirmado",
  sinal: "Sinal",
};

function linhaResumo(etapa: string, dados: Record<string, unknown>): string | null {
  if (etapa === "fechamento") return null;
  const pares = Object.entries(dados)
    .filter(([k, v]) => k !== "_n" && k !== "_corr" && v !== null && v !== undefined && String(v).trim() && String(v) !== "não informado")
    .map(([k, v]) => `${ROTULOS_CAMPO[k] ?? k}: ${typeof v === "boolean" ? (v ? "sim" : "não") : String(v)}`);
  if (!pares.length) return null;
  return `**${ROTULOS[etapa] ?? etapa}** — ${pares.join(" · ")}`;
}

function construirResumo(coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): string {
  const partes = Object.entries(coleta)
    .map(([etapa, dados]) => linhaResumo(etapa, dados))
    .filter(Boolean) as string[];
  const corpo = partes.length ? partes.join("\n\n") : "_Ainda sem dados registrados._";
  return `Fechamos a parte principal da nossa conversa, ${ctx.primeiroNome}. Deixa eu confirmar o que anotei para ${ctx.medico}:\n\n${corpo}\n\n**Tem mais alguma coisa que você acha importante me contar? Está tudo correto?** Se faltar qualquer detalhe, é só me dizer — e, quando estiver tudo certo, toque em **“Concluir triagem e enviar ao médico”** ali embaixo.`;
}

/* --------------------------- perguntas por etapa ----------------------- */

function perguntaIdentificacao(ctx: MotorCtx): string {
  const p = ctx.perfil;
  const dados: string[] = [];
  if (p.idade) dados.push(`${p.idade} anos`);
  if (ctx.genero) dados.push(ctx.genero.toLowerCase());
  if (p.profissao) dados.push(`profissão: ${p.profissao}`);
  if (p.estadoCivil) dados.push(`estado civil: ${p.estadoCivil}`);
  if (p.peso) dados.push(`${p.peso} kg`);
  if (p.altura) dados.push(`${p.altura} cm`);
  if (p.alergias.length) dados.push(`alergias: ${p.alergias.join(", ")}`);
  if (p.comorbidades.length) dados.push(`comorbidades: ${p.comorbidades.join(", ")}`);
  const lista = dados.length ? `\n\n${dados.map((d) => `• ${d}`).join("\n")}` : "";
  return `Para começar, ${ctx.primeiroNome}, eu já puxei os dados do seu perfil BION:${lista}\n\n**Está tudo certo?** Se sim, me diga “está certo”. Se quiser mudar qualquer coisa — peso, altura, profissão, telefone — me corrige que **eu já atualizo no seu perfil**.`;
}

function perguntaQueixa(ctx: MotorCtx): string {
  return `Agora me conta, **com suas palavras**: o que está te trazendo a esta consulta de ${ctx.especialidade}? Pode ser espontâneo — o que você sente, e há quanto tempo, do jeito que você explicar.`;
}

function perguntaHistoria(indice: number): string {
  switch (indice) {
    case 0:
      return `Quero montar essa história junto com você. **Quando isso começou** — e como? Veio de repente ou foi piorando aos poucos?`;
    case 1:
      return `E **onde** você sente mais forte? Me descreve a sensação — é uma **pontada**, uma **pressão**, uma **queimação**? Chega a **irradiar** para outro lugar (braço, costas, perna)?`;
    case 2:
      return `De **0 a 10**, qual a intensidade hoje? E você já percebeu algo que **piora** ou que **melhora** — posição, movimento, alimentação, horário do dia?`;
    default:
      return `Última parte desta história: apareceu **algum outro sintoma junto** (febre, enjoo, tontura, suor…)? E você já tentou **algum medicamento** — fez efeito?`;
  }
}

function perguntaSistemas(ctx: MotorCtx): string {
  return `Anotado. Um panorama rápido, ${ctx.primeiroNome}: nos últimos dias, você notou algo fora do seu normal — **febre, peso no peito, falta de ar, tontura, enjoo, mudança no intestino ou na urina**? Qualquer detalhe é bem-vindo; se estiver tudo normal, é só dizer.`;
}

function perguntaAntecedentes(): string {
  return `Sobre a sua **história de saúde**: você já teve alguma doença, cirurgia, internação, trauma ou alergia importante que eu deva registrar? Medicamentos de uso contínuo ficam para daqui a pouco.`;
}

function perguntaFamilia(): string {
  return `E na sua **família próxima** — pais, irmãos? Algum caso de **hipertensão, diabetes, doença do coração, câncer** ou doença hereditária?`;
}

function perguntaHabitos(): string {
  return `Sobre o seu **dia a dia**: você fuma? Consome álcool? Como estão a **alimentação**, a **atividade física** e o **sono**? Sem julgamento nenhum — quanto mais real, melhor para o médico.`;
}

function perguntaGineco(): string {
  return `Agora um tema **pessoal** — responda só o que se sentir confortável: como está seu **ciclo menstrual** (regular? quando foi a última vez)? Já teve **gestações** ou partos? Usa algum **contraceptivo**?`;
}

function perguntaPsicossocial(ctx: MotorCtx): string {
  return `E como você está **por dentro**? Humor, estresse, ansiedade… Essa queixa tem atrapalhado seu **trabalho, sono ou rotina**? Você tem tido apoio de gente querida?`;
}

function perguntaMedicamentos(ctx: MotorCtx): string {
  const doPerfil = ctx.perfil.medicamentos.length
    ? ` Pelo perfil você usa: ${ctx.perfil.medicamentos.join(", ")}.`
    : "";
  return `Sobre **medicamentos**: além do que consta no seu perfil,${doPerfil} usa mais alguma coisa hoje? Vale citar **vitaminas, suplementos e chás** — com nome, dose e frequência, se souber.`;
}

function perguntaDocumentos(): string {
  return `Você tem algum **exame ou documento** — laudo, resultado, receita — que queira mostrar ao médico? Pode anexar **aqui mesmo** (PDF ou foto): eu leio, confiro seu nome e junto à anamnese. Se não tiver, é só dizer.`;
}

function perguntaFechamento(ctx: MotorCtx): string {
  return `Nossa conversa está quase pronta para ${ctx.medico}. Tem **mais alguma coisa** que você acha importante contar — ou posso considerar fechada?`;
}

/* --------------------------- transição de etapa ------------------------ */

/** Fecha a etapa atual, semeia a próxima e devolve acolhida + pergunta dela. */
function fecharComPonte(
  etapaAtual: string,
  ack: string,
  coletaCompleta: Record<string, Record<string, unknown>>,
  ctx: MotorCtx,
): MotorSaida {
  let proxima = (ETAPAS_MOTOR[Math.min(ETAPAS_MOTOR.indexOf(etapaAtual as (typeof ETAPAS_MOTOR)[number]) + 1, ETAPAS_MOTOR.length - 1)] as string);
  const seed: Record<string, Record<string, unknown>> = {
    ...coletaCompleta,
    [etapaAtual]: { ...(coletaCompleta[etapaAtual] ?? {}), _n: contador(coletaCompleta, etapaAtual) + 1 },
  };

  // Gineco só é pertinente para pacientes do sexo feminino — pular com respeito.
  if (proxima === "gineco" && !ctx.genero.toLowerCase().startsWith("f")) {
    seed.gineco = { ...(coletaCompleta.gineco ?? {}), _n: 1, naoAplicavel: true };
    proxima = "psicossocial";
  }

  seed[proxima] = { ...(coletaCompleta[proxima] ?? {}), _n: 1 };

  const textoPergunta =
    proxima === "fechamento"
      ? construirResumo(seed, ctx)
      : proxima === "queixa"
        ? perguntaQueixa(ctx)
        : proxima === "historia"
          ? perguntaHistoria(0)
          : proxima === "sistemas"
            ? perguntaSistemas(ctx)
            : proxima === "antecedentes"
              ? perguntaAntecedentes()
              : proxima === "familia"
                ? perguntaFamilia()
                : proxima === "habitos"
                  ? perguntaHabitos()
                  : proxima === "gineco"
                    ? perguntaGineco()
                    : proxima === "psicossocial"
                      ? perguntaPsicossocial(ctx)
                      : proxima === "medicamentos"
                        ? perguntaMedicamentos(ctx)
                        : proxima === "documentos"
                          ? perguntaDocumentos()
                          : perguntaFechamento(ctx);

  return {
    resposta: `${ack} ${textoPergunta}`,
    etapa_concluida: true,
    coleta: seed,
  };
}

/* --------------------------------- etapas ------------------------------ */

function etapaIdentificacao(mensagem: string, coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): MotorSaida {
  const n = contador(coleta, "identificacao");
  const atual = { ...(coleta.identificacao ?? {}) };

  if (n === 0) {
    return {
      resposta: perguntaIdentificacao(ctx),
      etapa_concluida: false,
      coleta: { ...coleta, identificacao: { ...atual, _n: 1 } },
    };
  }

  const t = normalizar(mensagem);
  const atualizacoes: NonNullable<MotorSaida["perfil_atualizacoes"]> = {};
  const mudancas: string[] = [];

  const peso = extrairPeso(t);
  if (peso !== null) {
    atualizacoes.peso = peso;
    atual.peso = `${peso} kg`;
    mudancas.push(`peso ${peso} kg`);
  }
  const altura = extrairAltura(t);
  if (altura !== null) {
    atualizacoes.altura = altura;
    atual.altura = `${altura} cm`;
    mudancas.push(`altura ${altura} cm`);
  }
  const tel = extrairTelefone(mensagem);
  if (tel) {
    atualizacoes.telefone = tel;
    atual.telefone = tel;
    mudancas.push("telefone");
  }
  const mProf = mensagem.match(/(?:trabalho como|agora sou|profiss[ãa]o (?:é|e))\s+([a-záéíóúâêôãõç][^.,;!?]{2,60})/i);
  if (mProf) {
    atualizacoes.profissao = mProf[1].trim().slice(0, 80);
    atual.profissao = atualizacoes.profissao;
    mudancas.push("profissão");
  }
  const mCivil = t.match(/(solteir[oa]|casad[oa]|divorciad[oa]|vi[úu]v[oa]|uni[ãa]o est[áa]vel)/);
  if (mCivil) {
    const terminacao = ctx.genero.toLowerCase().startsWith("f") ? "a" : "o";
    atualizacoes.estadoCivil = mCivil[0].slice(0, -1) + terminacao;
    atual.estadoCivil = mCivil[0].slice(0, 1).toUpperCase() + atualizacoes.estadoCivil.slice(1);
    mudancas.push("estado civil");
  }

  const confirmou = /(esta certo|tudo certo|correto|confirmo|isso mesmo|certinho|esta tudo|ta certo|pode seguir|tudo ok)/.test(t);

  if (mudancas.length && !confirmou) {
    return {
      resposta: `**Perfil atualizado:** ${mudancas.join(", ")}. Mais alguma coisa para corrigir, ou podemos seguir?`,
      etapa_concluida: false,
      coleta: { ...coleta, identificacao: { ...atual, _n: n + 1 } },
      perfil_atualizacoes: atualizacoes,
    };
  }

  if (confirmou || (!corrigir(t) && n >= 2)) {
    const ack = mudancas.length
      ? `Perfeito, tudo atualizado (${mudancas.join(", ")}).`
      : pick(["Ótimo, dados confirmados.", "Anotado — obrigada por confirmar."], mensagem || ctx.primeiroNome);
    const saida = fecharComPonte("identificacao", ack, { ...coleta, identificacao: atual }, ctx);
    return { ...saida, perfil_atualizacoes: mudancas.length ? atualizacoes : undefined };
  }

  return {
    resposta: `Se estiver tudo certo, me diz **“está certo”** — ou me conta o que mudou (peso, altura, profissão, telefone) que eu atualizo na hora.`,
    etapa_concluida: false,
    coleta: { ...coleta, identificacao: { ...atual, _n: n + 1 } },
  };
}

function etapaQueixa(mensagem: string, coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): MotorSaida {
  const n = contador(coleta, "queixa");
  const atual = { ...(coleta.queixa ?? {}) };

  if (n === 0) {
    return { resposta: perguntaQueixa(ctx), etapa_concluida: false, coleta: { ...coleta, queixa: { ...atual, _n: 1 } } };
  }

  const t = normalizar(mensagem);
  if (naoSei(t) || pular(t)) {
    atual.relato = "não informado";
    return fecharComPonte("queixa", "Sem problemas — podemos voltar nisso depois.", { ...coleta, queixa: atual }, ctx);
  }

  const rica = mensagem.trim().length >= 15;
  if (!rica && n < 3) {
    return {
      resposta: `Pode me dar um pouquinho mais de detalhe? O que você sente, e **há quanto tempo**?`,
      etapa_concluida: false,
      coleta: { ...coleta, queixa: { ...atual, _n: n + 1 } },
    };
  }

  atual.relato = mensagem.trim().slice(0, 600);
  const ack = `**${eco(mensagem, 70)}** — entendi, é isso que vou registrar como motivo da consulta.`;
  return fecharComPonte("queixa", ack, { ...coleta, queixa: atual }, ctx);
}

function etapaHistoria(mensagem: string, coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): MotorSaida {
  const n = contador(coleta, "historia");
  const atual = { ...(coleta.historia ?? {}) };

  if (n === 0) {
    return { resposta: perguntaHistoria(0), etapa_concluida: false, coleta: { ...coleta, historia: { ...atual, _n: 1 } } };
  }

  const t = normalizar(mensagem);
  const vazio = naoSei(t) || pular(t);

  // Paciente contou tudo numa narrativa só → registrar e seguir (anti-interrogatório)
  const palavras = mensagem.trim().split(/\s+/).length;
  if (!vazio && palavras >= 30 && n >= 1) {
    atual.detalhes = mensagem.trim().slice(0, 1200);
    const tempo = extrairTempo(t);
    if (tempo) atual.inicio = tempo;
    const intens = extrairIntensidade(t);
    if (intens !== null) atual.intensidade = `${intens}/10`;
    const modo = MODO_INICIO.find((m) => m.re.test(t));
    if (modo) atual.evolucao = modo.rotulo;
    return fecharComPonte(
      "historia",
      `Que relato completo — **muito obrigada**. Isso vai poupar um tempo precioso na consulta.`,
      { ...coleta, historia: atual },
      ctx,
    );
  }

  if (n === 1) {
    if (vazio) atual.inicio = "não informado";
    else {
      const tempo = extrairTempo(t);
      if (tempo) atual.inicio = tempo;
      const modo = MODO_INICIO.find((m) => m.re.test(t));
      if (modo) atual.evolucao = modo.rotulo;
      if (!tempo && !modo) atual.inicio = eco(mensagem, 120);
    }
    return {
      resposta: `${pick(ACOLHIDAS, mensagem)} ${perguntaHistoria(1)}`,
      etapa_concluida: false,
      coleta: { ...coleta, historia: { ...atual, _n: 2 } },
    };
  }

  if (n === 2) {
    if (vazio) atual.local = "não informado";
    else {
      const caracteristica = CARACTERISTICAS.find((c) => t.includes(c));
      if (caracteristica) atual.caracteristica = caracteristica === "pressao" ? "pressão" : caracteristica;
      if (/(irradi|desce|sobe|vai para|espalha)/.test(t)) atual.irradiacao = eco(mensagem, 100);
      if (!atual.local) atual.local = eco(mensagem, 100);
    }
    return {
      resposta: `${pick(ACOLHIDAS, mensagem)} ${perguntaHistoria(2)}`,
      etapa_concluida: false,
      coleta: { ...coleta, historia: { ...atual, _n: 3 } },
    };
  }

  if (n === 3) {
    if (vazio) atual.intensidade = "não informado";
    else {
      const intens = extrairIntensidade(t);
      if (intens !== null) atual.intensidade = `${intens}/10`;
      const mPiora = mensagem.match(/(?:piora|piorou|agrav)[^.,;!?]{0,90}/i);
      const mMelhora = mensagem.match(/(?:melhora|melhorou|al[íi]vi)[^.,;!?]{0,90}/i);
      if (mPiora) atual.piora = mPiora[0].trim().slice(0, 120);
      if (mMelhora) atual.melhora = mMelhora[0].trim().slice(0, 120);
      if (intens === null && !mPiora && !mMelhora) atual.fatores = eco(mensagem, 120);
    }
    return {
      resposta: `${pick(ACOLHIDAS, mensagem)} ${perguntaHistoria(3)}`,
      etapa_concluida: false,
      coleta: { ...coleta, historia: { ...atual, _n: 4 } },
    };
  }

  // n >= 4 — última questão da HDA respondida
  if (vazio) {
    atual.associados = "não informado";
    atual.medicacaoTentada = "não informado";
  } else {
    if (/(febre|enjoo|tontura|suor|v[óo]mito|diarreia|coriza|tosse|falta de ar)/.test(t)) atual.associados = eco(mensagem, 140);
    if (/(dipirona|paracetamol|ibuprofeno|losartana|omeprazol|rem[ée]dio|medicamento|comprimido|tom(ei|o))/.test(t))
      atual.medicacaoTentada = eco(mensagem, 140);
    if (!atual.associados && !atual.medicacaoTentada) atual.associados = eco(mensagem, 140);
  }
  return fecharComPonte(
    "historia",
    `Fechamos a história do começo ao fim — está muito bem contada.`,
    { ...coleta, historia: atual },
    ctx,
  );
}

function etapaSimples(
  etapa: string,
  mensagem: string,
  coleta: Record<string, Record<string, unknown>>,
  ctx: MotorCtx,
  campo: string,
  pergunta: (c: MotorCtx) => string,
): MotorSaida {
  const n = contador(coleta, etapa);
  const atual = { ...(coleta[etapa] ?? {}) };
  if (n === 0) {
    return { resposta: pergunta(ctx), etapa_concluida: false, coleta: { ...coleta, [etapa]: { ...atual, _n: 1 } } };
  }
  const t = normalizar(mensagem);
  if (naoSei(t) || pular(t)) {
    atual[campo] = "não informado";
    return fecharComPonte(etapa, "Tudo bem, seguimos.", { ...coleta, [etapa]: atual }, ctx);
  }
  if (/^(nao|n|nada|nenhum|nenhuma)\b/.test(t) && mensagem.trim().length < 40) {
    atual[campo] = "nada a registrar";
    return fecharComPonte(etapa, "Ótimo, anotado.", { ...coleta, [etapa]: atual }, ctx);
  }
  atual[campo] = mensagem.trim().slice(0, 900);
  return fecharComPonte(etapa, `${pick(ACOLHIDAS, mensagem)}`, { ...coleta, [etapa]: atual }, ctx);
}

function etapaGineco(mensagem: string, coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): MotorSaida {
  const feminino = ctx.genero.toLowerCase().startsWith("f");
  const n = contador(coleta, "gineco");
  const atual = { ...(coleta.gineco ?? {}) };

  if (!feminino) {
    return {
      resposta: `Nesta parte da anamnese não há nada específico para você — vou **pular direto para o próximo assunto**.`,
      etapa_concluida: true,
      coleta: {
        ...coleta,
        gineco: { ...atual, _n: Math.max(1, n), naoAplicavel: true },
        psicossocial: { ...(coleta.psicossocial ?? {}), _n: 1 },
      },
    };
  }

  if (n === 0) {
    return { resposta: perguntaGineco(), etapa_concluida: false, coleta: { ...coleta, gineco: { ...atual, _n: 1 } } };
  }

  const t = normalizar(mensagem);
  if (/(nao quero|prefiro nao|pular|nada a dizer)/.test(t) || naoSei(t)) {
    atual.registro = "não informado";
    return fecharComPonte("gineco", "Perfeitamente compreensível — seguimos com respeito.", { ...coleta, gineco: atual }, ctx);
  }
  atual.registro = mensagem.trim().slice(0, 600);
  return fecharComPonte("gineco", "Obrigada pela confiança.", { ...coleta, gineco: atual }, ctx);
}

function etapaDocumentos(mensagem: string, coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): MotorSaida {
  const n = contador(coleta, "documentos");
  const atual = { ...(coleta.documentos ?? {}) };

  if (n === 0) {
    return { resposta: perguntaDocumentos(), etapa_concluida: false, coleta: { ...coleta, documentos: { ...atual, _n: 1 } } };
  }

  const t = normalizar(mensagem);
  if (/(pronto|enviei|anexei|mandei|enviado)/.test(t)) {
    atual.anexado = true;
    return fecharComPonte("documentos", "Recebi e registrei na anamnese — o médico terá acesso.", { ...coleta, documentos: atual }, ctx);
  }
  if (/(nao tenho|nenhum|nada)|^(nao|n)$/.test(t)) {
    atual.anexado = false;
    return fecharComPonte("documentos", "Combinado, sem documentos então.", { ...coleta, documentos: atual }, ctx);
  }
  if (/^(sim|tenho|quero enviar|posso enviar)/.test(t)) {
    return {
      resposta: `Ótimo! O botão **“Anexar documento”** está aqui embaixo — PDF ou foto. Assim que enviar, eu leio, confiro o nome e registro.`,
      etapa_concluida: false,
      coleta: { ...coleta, documentos: { ...atual, _n: n + 1 } },
    };
  }
  return {
    resposta: `Se tiver, toque em **“Anexar documento”**; se não tiver, me diz **“não tenho”** que seguimos.`,
    etapa_concluida: false,
    coleta: { ...coleta, documentos: { ...atual, _n: n + 1 } },
  };
}

function etapaFechamento(mensagem: string, coleta: Record<string, Record<string, unknown>>, ctx: MotorCtx): MotorSaida {
  const n = contador(coleta, "fechamento");
  const atual = { ...(coleta.fechamento ?? {}) };

  if (n === 0) {
    return {
      resposta: construirResumo(coleta, ctx),
      etapa_concluida: false,
      coleta: { ...coleta, fechamento: { ...atual, _n: 1 } },
    };
  }

  const t = normalizar(mensagem);
  if (mensagem.trim().length < 60 && /^(nao|n|nada|tudo certo|tudo ok|esta tudo|pronto|pode fechar|nao tenho nada)\b/.test(t)) {
    return {
      resposta: `Então está tudo completo. Toque em **“Concluir triagem e enviar ao médico”** ali embaixo — ${ctx.medico} já recebe seu dossiê antes do atendimento.`,
      etapa_concluida: false,
      coleta: { ...coleta, fechamento: { ...atual, _n: n + 1, confirmado: true } },
    };
  }
  // Paciente acrescentou algo (ou pediu correção pontual)
  atual.complemento = `${atual.complemento ? `${atual.complemento} ` : ""}${mensagem.trim().slice(0, 500)}`.slice(0, 900);
  return {
    resposta: `**Muito importante que você tenha contado isso** — registrei no fechamento.\n\nSe não falta mais nada, toque em **“Concluir triagem e enviar ao médico”** ali embaixo.`,
    etapa_concluida: false,
    coleta: { ...coleta, fechamento: { ...atual, _n: n + 1 } },
  };
}

/* ------------------------------ ponto de entrada ----------------------- */

const REABRIR_PERGUNTA: Record<string, (c: MotorCtx) => string> = {
  identificacao: perguntaIdentificacao,
  queixa: perguntaQueixa,
  sistemas: perguntaSistemas,
  antecedentes: perguntaAntecedentes,
  familia: perguntaFamilia,
  habitos: perguntaHabitos,
  gineco: perguntaGineco,
  psicossocial: perguntaPsicossocial,
  medicamentos: perguntaMedicamentos,
  documentos: perguntaDocumentos,
};

/**
 * Um turno do motor. `mensagem === ""` abre (ou retoma) a etapa atual.
 * Sinais de alarme têm prioridade absoluta sobre o roteiro.
 */
export function turnoMotor({ mensagem, etapa, coleta, ctx }: MotorEntrada): MotorSaida {
  const t = mensagem.trim();
  const etapaValida = (ETAPAS_MOTOR as readonly string[]).includes(etapa) ? etapa : "identificacao";

  // Retomada: paciente voltou ao chat sem digitar nada (botão "Continuar triagem")
  if (!t) {
    const n = contador(coleta, etapaValida);
    const seed = Math.max(1, n);
    if (n > 0) {
      // "historia" tem perguntas sequenciais (OPQRST): retoma pela que ficou
      // em aberto conforme o contador. Demais etapas têm pergunta única.
      const reabertura =
        etapaValida === "fechamento"
          ? construirResumo(coleta, ctx)
          : etapaValida === "historia"
            ? `Bem-vindo(a) de volta, ${ctx.primeiroNome}! Retomando de onde paramos: ${perguntaHistoria(Math.min(3, Math.max(0, n - 1)))}`
            : `Bem-vindo(a) de volta, ${ctx.primeiroNome}! Retomando de onde paramos: ${REABRIR_PERGUNTA[etapaValida]?.(ctx) ?? "Me conta o que você quiser acrescentar."}`;
      return {
        resposta: reabertura,
        etapa_concluida: false,
        coleta: { ...coleta, [etapaValida]: { ...(coleta[etapaValida] ?? {}), _n: seed } },
      };
    }
    // Primeira abertura: delega ao handler da etapa (que faz a pergunta de abertura)
  }

  if (t) {
    const alarme = sinalDeAlarme(t);
    if (alarme) {
      return {
        resposta: MSG_ALARME(alarme),
        etapa_concluida: false,
        coleta: {
          ...coleta,
          [etapaValida]: { ...(coleta[etapaValida] ?? {}), _n: Math.max(1, contador(coleta, etapaValida)) },
          alarme: { sinal: alarme },
        },
      };
    }

    // Chip de correção: não avança; a próxima mensagem é tratada no fluxo da etapa
    if (corrigir(t)) {
      return {
        resposta: `Claro, sem pressa: **o que você quer corrigir?**`,
        etapa_concluida: false,
        coleta: { ...coleta, [etapaValida]: { ...(coleta[etapaValida] ?? {}), _n: contador(coleta, etapaValida), _corr: 1 } },
      };
    }
  }

  switch (etapaValida) {
    case "identificacao":
      return etapaIdentificacao(t, coleta, ctx);
    case "queixa":
      return etapaQueixa(t, coleta, ctx);
    case "historia":
      return etapaHistoria(t, coleta, ctx);
    case "sistemas":
      return etapaSimples("sistemas", t, coleta, ctx, "relato", perguntaSistemas);
    case "antecedentes":
      return etapaSimples("antecedentes", t, coleta, ctx, "registro", perguntaAntecedentes);
    case "familia":
      return etapaSimples("familia", t, coleta, ctx, "registro", perguntaFamilia);
    case "habitos":
      return etapaSimples("habitos", t, coleta, ctx, "registro", perguntaHabitos);
    case "gineco":
      return etapaGineco(t, coleta, ctx);
    case "psicossocial":
      return etapaSimples("psicossocial", t, coleta, ctx, "registro", perguntaPsicossocial);
    case "medicamentos":
      return etapaSimples("medicamentos", t, coleta, ctx, "registro", perguntaMedicamentos);
    case "documentos":
      return etapaDocumentos(t, coleta, ctx);
    default:
      return etapaFechamento(t, coleta, ctx);
  }
}
