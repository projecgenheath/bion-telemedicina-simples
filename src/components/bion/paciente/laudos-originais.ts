/** Laudos enviados à BION IA e se a leitura gravou resultados com o mesmo nome. */

export function laudosDaIa<T extends { consulta: string }>(arquivos: T[]): T[] {
  return arquivos.filter((a) => a.consulta === "BION IA");
}

export function laudoTemResultado(nome: string, exames: { arquivoNome?: string | null }[]): boolean {
  return exames.some((e) => !!e.arquivoNome && e.arquivoNome === nome);
}

/** Abre o original guardado no Storage. Devolve o erro para a tela mostrar. */
export async function abrirArquivoOriginal(id: string, nome: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const res = await fetch(`/api/arquivos?id=${encodeURIComponent(id)}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { url?: unknown; erro?: unknown };
    if (!res.ok || typeof json.url !== "string") {
      return { ok: false, erro: typeof json.erro === "string" ? json.erro : "Não foi possível abrir o arquivo." };
    }
    const a = document.createElement("a");
    a.href = json.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo." };
  }
}
