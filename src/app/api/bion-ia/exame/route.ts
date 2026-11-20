import { NextRequest } from "next/server";
import { dataIsoClinica } from "@/lib/server/fuso";
import ZAI from "z-ai-web-dev-sdk";
import { exigirConsentimentoIa } from "@/lib/server/consentimento-ia";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import {
  CAMPO_CONSENTIMENTO_IA_EXAME,
  FINALIDADE_CONSENTIMENTO_IA_EXAME,
  VERSAO_CONSENTIMENTO_IA_EXAME,
  consentimentoIaExameValido,
} from "@/lib/consentimento-ia-exame";
import { limparMetadadosImagem } from "@/lib/server/limpar-metadados";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import { notificacaoNovoExame } from "@/lib/server/notificar-resultado";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";
import { nomeCorresponde } from "@/lib/nome-laudo";
import { iaPausada, obterLLM, respostaIaPausada, visaoGemini } from "@/lib/server/llm";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";
import { garantirBuckets, uploadDocumento } from "@/lib/supabase/storage";

/**
 * BION IA — leitura de laudos de exames (PDF ou foto) para o app do paciente.
 *
 * POST multipart/form-data { arquivo, consentimento }
 *
 * Consentimento (LGPD art. 11 e 33): sem `consentimento` igual à versão atual
 * do aviso (lib/consentimento-ia-exame.ts) a rota recusa com 428, ANTES de
 * ler o arquivo. O aceite é gravado em Consentimento + AuditLog (data/hora e
 * versão) antes de qualquer envio à IA. Para a IA vão só os bytes do
 * arquivo (sem o nome original) e, em JPEG/PNG, sem metadados EXIF/XMP/texto.
 * O CONTEÚDO (nome e dados impressos no laudo) segue como está.
 *
 * Fluxo de segurança (LGPD / integridade do prontuário):
 *  1. A IA transcreve o laudo e extrai o NOME COMPLETO do paciente impresso no documento;
 *     visão em cadeia: GOOGLE GEMINI (API própria) → SDK do sandbox;
 *  2. O servidor compara o nome extraído com o nome da conta autenticada
 *     (lib/nome-laudo: normalizado, ≥2 tokens e TODOS os tokens da conta —
 *     primeiro, meio e último — precisam constar no documento);
 *  3. Divergência → o exame NÃO é gravado e o paciente recebe um aviso claro;
 *  4. Sucesso → resultados agrupados por exame são gravados na linha do tempo
 *     (seção "Exames" do app) e um registro de upload entra no histórico.
 */

const LIMITE_BYTES = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 55_000;

const PROMPT_EXTRACAO = `Você é o extrator de laudos laboratoriais da BION Telemedicina. Analise o laudo anexo (PDF ou foto) e devolva EXCLUSIVAMENTE um JSON válido, sem texto fora dele, neste formato:
{
  "nomePaciente": "<nome COMPLETO do paciente impresso no laudo — campo 'Paciente', 'Nome' ou cabeçalho>",
  "dataColeta": "<data de coleta/emissão do laudo no formato YYYY-MM-DD; se ausente use hoje: {HOJE}>",
  "exames": [
    { "titulo": "<nome do exame ou grupo, ex.: 'Hemograma completo', 'Glicemia em jejum'>",
      "itens": [ { "nome": "<análise, ex.: Hemoglobina>", "valor": <número>, "unidade": "<ex.: mg/dL>", "refMin": <número ou omita>, "refMax": <número ou omita> } ] }
  ]
}
Regras: agrupe análises relacionadas em um único exame quando pertencerem ao mesmo painel; converta valores para números (use ponto decimal; 7.200 → 7200); ignore textos sem valor numérico; NUNCA invente resultados que não estejam no documento.`;

type ItemExtraido = { nome: string; valor: number; unidade?: string; refMin?: number; refMax?: number };
type LaudoExtraido = {
  nomePaciente?: string;
  dataColeta?: string;
  exames?: { titulo?: string; itens?: ItemExtraido[] }[];
};

function extrairJson(texto: string): LaudoExtraido | null {
  const limpo = texto.replace(/```json/gi, "```").split("```").find((b) => b.trim().startsWith("{"));
  const bruto = limpo ?? texto;
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(bruto.slice(inicio, fim + 1)) as LaudoExtraido;
  } catch {
    return null;
  }
}

/** Guarda o arquivo enviado mesmo quando a leitura dos valores falha, para o
 *  paciente abrir o original em Exames. Sem Storage, fica só o nome. */
async function guardarOriginalLaudo(
  usuarioId: string,
  arquivo: File,
  bytes: Buffer,
  tipoMime: string,
): Promise<{ id: string; storagePath: string | null }> {
  let storagePath: string | null = null;
  if (supabaseServiceRoleKey()) {
    try {
      await garantirBuckets();
      const up = await uploadDocumento(usuarioId, arquivo.name || "laudo", bytes, tipoMime);
      storagePath = up.path;
    } catch (e) {
      console.error("[BION IA exame] não guardei o arquivo original", e);
    }
  }
  const registro = await db.arquivo.create({
    data: {
      nome: (arquivo.name || "laudo").slice(0, 200),
      tipo: tipoMime.slice(0, 60),
      tamanhoKb: Math.max(1, Math.round(arquivo.size / 1024)),
      enviadoPor: "paciente",
      usuarioId,
      pacienteId: usuarioId,
      consulta: "BION IA",
      storagePath,
    },
  });
  return { id: registro.id, storagePath };
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    // M6 (auditoria): teto por usuário MAIS apertado que o chat — visão é a
    // chamada mais cara (arquivo de até 10 MB por envio). Antes de ler o
    // corpo: 5/min e 30/h por paciente.
    const tetoMin = await limitarAsync(`bion-ia-exame:${usuario.id}`, 5, 60_000);
    if (!tetoMin.permitido) return resposta429(tetoMin.restanteSeg);
    const tetoHora = await limitarAsync(`bion-ia-exame-hora:${usuario.id}`, 30, 3_600_000);
    if (!tetoHora.permitido) return resposta429(tetoHora.restanteSeg);
    // Pausa da BION IA (opt-in): o laudo nem é lido, nada vai à IA.
    if (iaPausada()) return respostaIaPausada();
    // Portão jurídico: sem o aceite geral da IA (NVIDIA) nada é enviado.
    const pendente = await exigirConsentimentoIa(usuario);
    if (pendente) return pendente;

    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) {
      return Response.json({ erro: "Envie o arquivo do laudo (PDF ou foto)." }, { status: 400 });
    }
    if (!consentimentoIaExameValido(form.get(CAMPO_CONSENTIMENTO_IA_EXAME))) {
      return Response.json(
        {
          erro: "Para ler o laudo pela BION IA, confirme antes que concorda com o envio do arquivo à NVIDIA (EUA).",
          motivo: "consentimento_necessario",
          versao: VERSAO_CONSENTIMENTO_IA_EXAME,
        },
        { status: 428 },
      );
    }
    if (arquivo.size > LIMITE_BYTES) {
      return Response.json({ erro: "Arquivo muito grande (máximo de 10 MB)." }, { status: 413 });
    }

    const mime = arquivo.type || "application/octet-stream";
    const ehPdf = mime === "application/pdf";
    const ehImagem = mime.startsWith("image/");
    if (!ehPdf && !ehImagem) {
      return Response.json({ erro: "Formato não suportado — envie o laudo em PDF ou foto." }, { status: 415 });
    }

    // Registra o aceite (data/hora = createdAt; versão na finalidade/detalhes)
    // ANTES de qualquer envio. Falhou o Consentimento OU a auditoria → não envia
    // (registrarAudit engole erros e devolve null; por isso o teste abaixo).
    await db.consentimento.create({
      data: {
        pacienteId: usuario.id,
        quem: usuario.nome,
        perfil: "PACIENTE", // = usuario.role, igual a /api/consentimentos (a anonimização casa por "PACIENTE")
        finalidade: FINALIDADE_CONSENTIMENTO_IA_EXAME,
        documentos: 1,
        aceito: true,
      },
    });
    const auditAceite = await registrarAudit(usuarioSemNome(usuario), {
      acao: "CONSENTIMENTO_IA_EXAME",
      categoria: "consentimento",
      entidade: "consentimento",
      entidadeId: VERSAO_CONSENTIMENTO_IA_EXAME,
      detalhes: `Aceite do envio de laudo à NVIDIA (EUA) — versão ${VERSAO_CONSENTIMENTO_IA_EXAME} em ${new Date().toISOString()}`,
    });

    if (!auditAceite) {
      return Response.json(
        { erro: "Não consegui registrar sua autorização agora, então o laudo não foi enviado. Tente novamente." },
        { status: 503 },
      );
    }

    const original = new Uint8Array(await arquivo.arrayBuffer());
    const limpeza = limparMetadadosImagem(mime, original);
    if (limpeza.aviso) console.warn(`[BION IA exame] metadados não removidos (${limpeza.aviso}); arquivo enviado como veio`);
    const bytes = Buffer.from(limpeza.bytes);
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    const base64Puro = bytes.toString("base64");

    const tipoArquivo = ehPdf ? "application/pdf" : mime;
    const responderSemLeitura = async (mensagem: string) => {
      const salvo = await guardarOriginalLaudo(usuario.id, arquivo, bytes, tipoArquivo);
      const dados = await carregarDados(usuario);
      const texto = salvo.storagePath
        ? `${mensagem} O arquivo original continua em Exames: toque em Ver arquivo.`
        : `${mensagem} Não consegui guardar o arquivo agora. Envie de novo.`;
      return ok({ ok: true, documentoRegistrado: true, leituraFalhou: true, arquivoId: salvo.id, mensagem: texto, dados });
    };

    // Sem LLM acessível (produção/Vercel): guarda o original e avisa.
    const clienteLlm = await obterLLM();
    if (!clienteLlm) {
      return responderSemLeitura(
        `Documento **${arquivo.name || "anexo"}** recebido. Neste momento não consegui processar os valores automaticamente.`,
      );
    }

    const promptExtracao = PROMPT_EXTRACAO.replace("{HOJE}", dataIsoClinica()); // dia em São Paulo, não em UTC
    let texto = "";

    if (clienteLlm.tipo === "gemini") {
      // Canal preferencial: API própria do projeto (aceita foto e PDF nativamente).
      texto = (await visaoGemini(mime, base64Puro, promptExtracao, TIMEOUT_MS)) ?? "";
    } else {
      const zai = clienteLlm.tipo === "sdk" ? clienteLlm.zai : null;
      if (!zai) {
        return responderSemLeitura("A leitura automática de laudos não está disponível agora.");
      }
      // O endpoint /chat/completions/vision escolhe o modelo de visão padrão do
      // gateway quando "model" é omitido — comportamento validado em teste real.
      const corpoVision = {
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: promptExtracao },
              ehPdf
                ? { type: "file_url" as const, file_url: { url: dataUrl } }
                : { type: "image_url" as const, image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: "disabled" as const },
      };

      const completion = (await Promise.race([
        zai.chat.completions.createVision(
          corpoVision as Parameters<typeof zai.chat.completions.createVision>[0],
        ),
        new Promise<null>((_, rejeita) => setTimeout(() => rejeita(new Error("timeout")), TIMEOUT_MS)),
      ])) as Awaited<ReturnType<typeof zai.chat.completions.createVision>> | null;
      texto = completion?.choices?.[0]?.message?.content ?? "";
    }

    const laudo = extrairJson(texto);
    if (!laudo || !Array.isArray(laudo.exames)) {
      return responderSemLeitura("Não consegui ler os resultados deste laudo. Verifique se a foto ou o PDF está nítido.");
    }

    // ---- Verificação de segurança: o laudo é do paciente autenticado? ----
    const nomeEncontrado = (laudo.nomePaciente ?? "").trim();
    if (!nomeEncontrado || !nomeCorresponde(nomeEncontrado, usuario.nome)) {
      return Response.json(
        {
          ok: false,
          motivo: "nome_divergente",
          nomeEncontrado: nomeEncontrado || null,
          mensagem: nomeEncontrado
            ? `Por segurança, este laudo não foi importado: o nome do paciente no documento ("${nomeEncontrado}") é diferente do nome da sua conta ("${usuario.nome}"). Confira se você enviou o laudo correto.`
            : "Por segurança, este laudo não foi importado: não encontrei o nome do paciente no documento. Envie o laudo completo, com o campo de identificação visível.",
        },
        { status: 200 },
      );
    }

    const grupos = laudo.exames
      .filter((g) => g?.titulo && Array.isArray(g.itens) && g.itens.some((i) => i?.nome && Number.isFinite(Number(i.valor))))
      .map((g) => ({
        titulo: String(g.titulo).slice(0, 120),
        itens: g.itens!.filter((i) => i?.nome && Number.isFinite(Number(i.valor))).slice(0, 40),
      }));
    if (!grupos.length) {
      return responderSemLeitura("Li o documento, mas não encontrei resultados laboratoriais com valores numéricos.");
    }

    const dataColeta = laudo.dataColeta ? new Date(`${laudo.dataColeta}T12:00:00`) : new Date();
    const dataValida = Number.isNaN(dataColeta.getTime()) ? new Date() : dataColeta;

    // Registra o upload no histórico (mesmo registro visto no perfil) e guarda o original.
    const arquivoRegistrado = await guardarOriginalLaudo(usuario.id, arquivo, bytes, tipoArquivo);

    const examesSalvos: { titulo: string; itens: ItemExtraido[]; dataColeta: string }[] = [];
    for (const grupo of grupos) {
      const itensJson = JSON.stringify(
        grupo.itens.map((i) => ({
          nome: String(i.nome).slice(0, 120),
          valor: Number(i.valor),
          unidade: String(i.unidade ?? "").slice(0, 30),
          ...(Number.isFinite(Number(i.refMin)) ? { refMin: Number(i.refMin) } : {}),
          ...(Number.isFinite(Number(i.refMax)) ? { refMax: Number(i.refMax) } : {}),
        })),
      );
      const existente = await db.exameLaboratorial.findFirst({
        where: { usuarioId: usuario.id, titulo: grupo.titulo, dataColeta: dataValida },
      });
      if (existente) {
        await db.exameLaboratorial.update({ where: { id: existente.id }, data: { itens: itensJson, arquivoNome: arquivo.name } });
      } else {
        await db.exameLaboratorial.create({
          data: {
            usuarioId: usuario.id,
            titulo: grupo.titulo,
            dataColeta: dataValida,
            itens: itensJson,
            arquivoNome: arquivo.name ?? null,
            origem: "bion-ia",
          },
        });
      }
      examesSalvos.push({ titulo: grupo.titulo, itens: grupo.itens, dataColeta: dataValida.toISOString() });
    }

    // Item 13 (melhorias): além do aviso ao paciente, o médico do vínculo
    // atual fica sabendo que o laudo chegou — antes o resultado postado
    // não avisava ninguém. (O nome do paciente vai SÓ na notificação ao
    // médico, que já o conhece; a auditoria abaixo segue só com ids.)
    const notifMedico = examesSalvos.length
      ? await notificacaoNovoExame(
          { id: usuario.id, nome: usuario.nome },
          examesSalvos.length > 1
            ? `${examesSalvos[0].titulo} e outros ${examesSalvos.length - 1}`
            : examesSalvos[0].titulo,
        )
      : null;

    await aplicarSideEffects(
      usuarioSemNome(usuario), // auditoria só com id (sem nome do paciente)
      [
        {
          tipo: "exame",
          titulo: "Exame importado pela BION IA",
          texto: `${examesSalvos.length} grupo(s) de resultados de "${arquivo.name || "laudo"}" foram adicionados à sua linha do tempo de exames.`,
          para: "paciente",
        },
        ...(notifMedico ? [notifMedico] : []),
      ],
      {
        acao: "EXAME_IMPORTADO_IA",
        categoria: "prontuario",
        entidade: "arquivo",
        entidadeId: arquivoRegistrado.id,
        // Só ids: sem nome do paciente nem nome original do arquivo.
        detalhes: `Laudo (arquivo ${arquivoRegistrado.id}) lido pela IA para o paciente id ${usuario.id} (${examesSalvos.length} grupos)`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok({ ok: true, nomeVerificado: nomeEncontrado, examesSalvos, dados });
  } catch (erro) {
    if ((erro as Error)?.message === "timeout") {
      return Response.json({ erro: "A leitura do laudo demorou demais. Tente novamente." }, { status: 504 });
    }
    return falha(erro);
  }
}
