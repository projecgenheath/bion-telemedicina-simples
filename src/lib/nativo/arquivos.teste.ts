/**
 * Testes do helper de arquivos (src/lib/nativo/arquivos) — contrato
 * combinado com Médicos:
 *  1) entradas `Blob | Uint8Array` + nome do arquivo (higienizado);
 *  2) em falha a promessa é REJEITADA (ErroArquivo), nunca só logada.
 * Rodar: bun --conditions=react-server src/lib/nativo/arquivos.teste.ts
 */
import {
  criarArquivos,
  ErroArquivo,
  mensagemResultado,
  nomeArquivoSeguro,
  bytesParaBase64,
  PASTA_APP,
  type AmbienteArquivos,
  type ResultadoArquivo,
} from "./arquivos";

let ok = 0;
let falhas = 0;
function verdade(nome: string, cond: boolean) {
  if (cond) ok++;
  else {
    falhas++;
    console.error("FALHOU:", nome);
  }
}
function igual(nome: string, atual: unknown, esperado: unknown) {
  verdade(`${nome} (atual=${JSON.stringify(atual)})`, JSON.stringify(atual) === JSON.stringify(esperado));
}
async function rejeita(nome: string, p: Promise<unknown>) {
  try {
    await p;
    verdade(`${nome}: deveria rejeitar`, false);
  } catch (e) {
    verdade(`${nome}: rejeita com ErroArquivo`, e instanceof ErroArquivo);
  }
}

type Chamada = { op: string; args: Record<string, unknown> };
function ambiente(op: {
  nativo: boolean;
  falhaWrite?: (dir: string) => boolean;
  falhaShare?: Error;
  falhaBaixar?: boolean;
  falhaImprimir?: boolean;
  webShare?: "compartilhado" | "indisponivel" | Error;
}) {
  const chamadas: Chamada[] = [];
  const amb: AmbienteArquivos = {
    nativo: () => op.nativo,
    filesystem: async () => ({
      async writeFile(o) {
        chamadas.push({ op: "writeFile", args: { path: o.path, directory: o.directory, data: o.data } });
        if (op.falhaWrite?.(o.directory)) throw new Error("permissão negada");
        return { uri: `file:///${o.directory}/${o.path}` };
      },
    }),
    share: async () => ({
      async share(o) {
        chamadas.push({ op: "share", args: { files: o.files } });
        if (op.falhaShare) throw op.falhaShare;
        return {};
      },
    }),
    web: {
      async baixar(blob, nome) {
        chamadas.push({ op: "baixar", args: { nome, tipo: blob.type, tam: blob.size } });
        if (op.falhaBaixar) throw new Error("sem DOM");
      },
      async imprimir(blob, nome) {
        chamadas.push({ op: "imprimir", args: { nome, tipo: blob.type } });
        if (op.falhaImprimir) throw new Error("iframe falhou");
        return "impressao";
      },
      async compartilhar(blob, nome) {
        chamadas.push({ op: "compartilharWeb", args: { nome } });
        if (op.webShare instanceof Error) throw op.webShare;
        return op.webShare ?? "indisponivel";
      },
    },
  };
  return { amb, chamadas, api: criarArquivos(amb) };
}

const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // "%PDF-1"
const blob = new Blob([bytes], { type: "application/octet-stream" });

// --- nome do arquivo higienizado ---
igual("acento e espaço", nomeArquivoSeguro("Receita — Losartana 50 mg"), "Receita-Losartana-50-mg.pdf");
igual("barra e ponto-ponto não viram pasta", nomeArquivoSeguro("../../etc/passwd"), "etc-passwd.pdf");
igual("caracteres reservados", nomeArquivoSeguro('a<b>c:d"e|f?g*h'), "a-b-c-d-e-f-g-h.pdf");
igual("já termina em .pdf", nomeArquivoSeguro("laudo.PDF"), "laudo.pdf");
igual("vazio vira documento", nomeArquivoSeguro("   "), "documento.pdf");
igual("idempotente", nomeArquivoSeguro(nomeArquivoSeguro("Solicitação de exame 09.11")), nomeArquivoSeguro("Solicitação de exame 09.11"));
verdade("até 124 caracteres", nomeArquivoSeguro("x".repeat(500)).length === 124);
igual("base64 em blocos", bytesParaBase64(bytes), Buffer.from(bytes).toString("base64"));

async function principal() {
  // --- 1) aceita Blob e Uint8Array (web) ---
  for (const [rotulo, dados] of [["Uint8Array", bytes], ["Blob", blob]] as const) {
    const { api, chamadas } = ambiente({ nativo: false });
    const r = await api.salvarPdf(dados, "Atestado médico");
    igual(`web salvar ${rotulo}: modo`, r, { modo: "baixado", nome: "Atestado-medico.pdf" });
    igual(`web salvar ${rotulo}: blob PDF`, chamadas[0]?.args, { nome: "Atestado-medico.pdf", tipo: "application/pdf", tam: 6 });
    const p = await ambiente({ nativo: false }).api.imprimirPdf(dados, "Receita");
    igual(`web imprimir ${rotulo}`, p, { modo: "impressao", nome: "Receita.pdf" });
  }

  // --- 1) aceita Blob e Uint8Array (app nativo) ---
  for (const [rotulo, dados] of [["Uint8Array", bytes], ["Blob", blob]] as const) {
    const { api, chamadas } = ambiente({ nativo: true });
    const r = await api.salvarPdf(dados, "Receita/ç");
    verdade(`app salvar ${rotulo}: salvo`, r.modo === "salvo");
    igual(`app salvar ${rotulo}: grava em Documentos/BION`, chamadas[0]?.args, {
      path: `${PASTA_APP}/Receita-c.pdf`, directory: "DOCUMENTS", data: Buffer.from(bytes).toString("base64"),
    });
    const c = ambiente({ nativo: true });
    const rc = await c.api.compartilharPdf(dados, "Exame");
    igual(`app compartilhar ${rotulo}: cache + share`, c.chamadas.map((x) => [x.op, x.args.directory ?? x.args.files]), [
      ["writeFile", "CACHE"], ["share", ["file:///CACHE/BION/Exame.pdf"]],
    ]);
    verdade(`app compartilhar ${rotulo}: modo`, rc.modo === "compartilhado");
    const i = ambiente({ nativo: true });
    const ri = await i.api.imprimirPdf(dados, "Exame");
    verdade(`app imprimir ${rotulo}: abre a folha do sistema`, ri.modo === "compartilhado" && i.chamadas.some((x) => x.op === "share"));
  }

  // Documentos recusado (Android ≤ 10 sem permissão) → folha de compartilhar.
  {
    const { api, chamadas } = ambiente({ nativo: true, falhaWrite: (d) => d === "DOCUMENTS" });
    const r = await api.salvarPdf(bytes, "Receita");
    verdade("app salvar sem Documentos: cai no compartilhar", r.modo === "compartilhado" && chamadas.some((x) => x.op === "share"));
    verdade("app salvar sem Documentos: nunca diz salvo", r.modo !== "salvo");
  }

  // Usuário fechou a folha: não é falha, e não é "salvo".
  {
    const { api } = ambiente({ nativo: true, falhaShare: new Error("Share canceled") });
    const r = await api.compartilharPdf(bytes, "x");
    igual("app share cancelado", r.modo, "cancelado");
    igual("cancelado não mostra aviso de salvo", mensagemResultado(r), null);
  }

  // --- 2) falhas REJEITAM a promessa ---
  await rejeita("app: writeFile falha no cache", ambiente({ nativo: true, falhaWrite: () => true }).api.compartilharPdf(bytes, "x"));
  await rejeita("app: salvar sem Documentos e sem cache", ambiente({ nativo: true, falhaWrite: () => true }).api.salvarPdf(bytes, "x"));
  await rejeita("app: share quebra (não é cancelamento)", ambiente({ nativo: true, falhaShare: new Error("No Activity found") }).api.compartilharPdf(bytes, "x"));
  await rejeita("app: imprimir sem share", ambiente({ nativo: true, falhaShare: new Error("boom") }).api.imprimirPdf(bytes, "x"));
  await rejeita("web: download falha", ambiente({ nativo: false, falhaBaixar: true }).api.salvarPdf(bytes, "x"));
  await rejeita("web: impressão falha", ambiente({ nativo: false, falhaImprimir: true }).api.imprimirPdf(bytes, "x"));
  await rejeita("web: compartilhar sem Web Share e sem download", ambiente({ nativo: false, falhaBaixar: true }).api.compartilharPdf(bytes, "x"));
  await rejeita("conteúdo inválido (web)", ambiente({ nativo: false }).api.salvarPdf("texto" as unknown as Uint8Array, "x"));
  await rejeita("conteúdo inválido (app)", ambiente({ nativo: true }).api.compartilharPdf({} as unknown as Uint8Array, "x"));

  // Web Share indisponível → download; com erro não-cancelamento → download.
  {
    const a = ambiente({ nativo: false, webShare: "indisponivel" });
    igual("web compartilhar indisponível → baixado", (await a.api.compartilharPdf(bytes, "x")).modo, "baixado");
    const b = ambiente({ nativo: false, webShare: new Error("NotAllowedError") });
    igual("web compartilhar com erro → baixado", (await b.api.compartilharPdf(bytes, "x")).modo, "baixado");
    const c = ambiente({ nativo: false, webShare: Object.assign(new Error("x"), { name: "AbortError" }) });
    igual("web compartilhar cancelado", (await c.api.compartilharPdf(bytes, "x")).modo, "cancelado");
  }

  // Mensagens: só afirma "salvo" quando gravou de fato.
  const salvo: ResultadoArquivo = { modo: "salvo", nome: "a.pdf", uri: "file:///a", pasta: "Documentos/BION" };
  igual("mensagem salvo", mensagemResultado(salvo), "PDF salvo em Documentos/BION.");
  verdade("compartilhado não diz salvo", mensagemResultado({ modo: "compartilhado", nome: "a.pdf" }) === null);

  console.log(`arquivos: ${ok} ok, ${falhas} falhas`);
  if (falhas) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
