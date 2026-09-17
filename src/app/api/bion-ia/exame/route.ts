import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * BION IA — leitura de laudos de exames (PDF ou foto) para o app do paciente.
 *
 * POST multipart/form-data { arquivo }
 *
 * Fluxo de segurança (LGPD / integridade do prontuário):
 *  1. A IA transcreve o laudo e extrai o NOME COMPLETO do paciente impresso no documento;
 *  2. O servidor compara o nome extraído com o nome da conta autenticada
 *     (comparação normalizada, tolerante a acentos/ordem/nomes do meio);
 *  3. Divergência → o exame NÃO é gravado e o paciente recebe um aviso claro;
 *  4. Sucesso → resultados agrupados por exame são gravados na linha do tempo
 *     (seção "Exames" do app) e um registro de upload entra no histórico.
 */

const LIMITE_BYTES = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 90_000;

type ItemExtraido = { nome: string; valor: number; unidade?: string; refMin?: number; refMax?: number };
type LaudoExtraido = {
  nomePaciente?: string;
  dataColeta?: string;
  exames?: { titulo?: string; itens?: ItemExtraido[] }[];
};

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function getZai() {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
}

function normalizarNome(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(dr\.?|dra\.?|sr\.?|sra\.?)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** O nome do documento corresponde ao da conta? Tolerante a nomes do meio e ordem. */
function nomeCorresponde(extraido: string, esperado: string): boolean {
  const a = normalizarNome(extraido);
  const b = normalizarNome(esperado);
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensA = a.split(" ").filter((t) => t.length > 1);
  const tokensB = b.split(" ").filter((t) => t.length > 1);
  if (!tokensA.length || !tokensB.length) return false;
  // Todo token do nome da conta precisa constar no documento (e vice-versa p/ evitar homônimos parciais)
  const contemTodos = (menor: string[], maior: string[]) =>
    menor.every((t) => maior.some((x) => x === t || (t.length > 3 && x.startsWith(t)) || (x.length > 3 && t.startsWith(x))));
  return tokensA.length <= tokensB.length ? contemTodos(tokensA, tokensB) : contemTodos(tokensB, tokensA);
}

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

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");

    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) {
      return Response.json({ erro: "Envie o arquivo do laudo (PDF ou foto)." }, { status: 400 });
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

    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    const zai = await getZai();
    // O endpoint /chat/completions/vision escolhe o modelo de visão padrão do
    // gateway quando "model" é omitido — comportamento validado em teste real.
    const corpoVision = {
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `Você é o extrator de laudos laboratoriais da BION Telemedicina. Analise o laudo anexo (PDF ou foto) e devolva EXCLUSIVAMENTE um JSON válido, sem texto fora dele, neste formato:
{
  "nomePaciente": "<nome COMPLETO do paciente impresso no laudo — campo 'Paciente', 'Nome' ou cabeçalho>",
  "dataColeta": "<data de coleta/emissão do laudo no formato YYYY-MM-DD; se ausente use hoje: ${new Date().toISOString().slice(0, 10)}>",
  "exames": [
    { "titulo": "<nome do exame ou grupo, ex.: 'Hemograma completo', 'Glicemia em jejum'>",
      "itens": [ { "nome": "<análise, ex.: Hemoglobina>", "valor": <número>, "unidade": "<ex.: mg/dL>", "refMin": <número ou omita>, "refMax": <número ou omita> } ] }
  ]
}
Regras: agrupe análises relacionadas em um único exame quando pertencerem ao mesmo painel; converta valores para números (use ponto decimal; 7.200 → 7200); ignore textos sem valor numérico; NUNCA invente resultados que não estejam no documento.`,
            },
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

    const texto = completion?.choices?.[0]?.message?.content ?? "";
    const laudo = extrairJson(texto);
    if (!laudo || !Array.isArray(laudo.exames)) {
      return Response.json(
        { ok: false, motivo: "extracao_falhou", mensagem: "Não consegui ler os resultados deste laudo. Verifique se a foto/PDF está nítido e tente novamente." },
        { status: 200 },
      );
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
      return Response.json(
        { ok: false, motivo: "sem_resultados", mensagem: "Li o documento, mas não encontrei resultados laboratoriais com valores numéricos. É um laudo de exame?" },
        { status: 200 },
      );
    }

    const dataColeta = laudo.dataColeta ? new Date(`${laudo.dataColeta}T12:00:00`) : new Date();
    const dataValida = Number.isNaN(dataColeta.getTime()) ? new Date() : dataColeta;

    // Registra o upload no histórico (mesmo registro visto no perfil)
    await db.arquivo.create({
      data: {
        nome: arquivo.name || "laudo.pdf",
        tipo: ehPdf ? "application/pdf" : mime,
        tamanhoKb: Math.max(1, Math.round(arquivo.size / 1024)),
        enviadoPor: "paciente",
        usuarioId: usuario.id,
        consulta: "BION IA",
      },
    });

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

    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "exame",
          titulo: "Exame importado pela BION IA",
          texto: `${examesSalvos.length} grupo(s) de resultados de "${arquivo.name || "laudo"}" foram adicionados à sua linha do tempo de exames.`,
          para: "paciente",
        },
      ],
      {
        acao: "EXAME_IMPORTADO_IA",
        categoria: "prontuario",
        detalhes: `Laudo "${arquivo.name}" lido pela IA e vinculado a ${usuario.nome} (${examesSalvos.length} grupos)`,
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
