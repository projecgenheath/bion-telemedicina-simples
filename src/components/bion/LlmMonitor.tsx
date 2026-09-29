"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type Evento = {
  ts: number;
  ok: boolean;
  ms: number;
  fonte: string | null;
  modelo: string | null;
  textoLen: number;
  http: number | null;
  finish: string | null;
  erro: string | null;
};

type Resumo = {
  turnos: number;
  ok: number;
  falhas: number;
  taxaOk: number;
  msMedia: number;
  msP50: number;
  msP95: number;
  modelos: (string | null)[];
};

export function LlmMonitor() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/bion-ia/monitor");
      const json = (await res.json()) as { resumo?: Resumo; eventos?: Evento[]; erro?: string };
      if (!res.ok) throw new Error(json.erro ?? "Falha");
      setResumo(json.resumo ?? null);
      setEventos(json.eventos ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não carregou o monitor");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Monitor LLM</h1>
          <p className="text-sm text-muted-foreground">Latência, taxa de acerto e falhas do Gemma / BION IA</p>
        </div>
        <button type="button" onClick={() => void carregar()} className="rounded-full px-3 py-2 text-sm border inline-flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>
      {erro ? <p className="text-sm text-red-500">{erro}</p> : null}
      {resumo ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Turnos", String(resumo.turnos)],
            ["Taxa OK", `${resumo.taxaOk}%`],
            ["p50", `${resumo.msP50} ms`],
            ["p95", `${resumo.msP95} ms`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="text-2xl font-black mt-1">{v}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr>
              <th className="p-3">Quando</th>
              <th className="p-3">Status</th>
              <th className="p-3">ms</th>
              <th className="p-3">Modelo</th>
              <th className="p-3">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.ts} className="border-b last:border-0">
                <td className="p-3 whitespace-nowrap">{new Date(e.ts).toLocaleTimeString("pt-BR")}</td>
                <td className="p-3">{e.ok ? "OK" : "Falha"}</td>
                <td className="p-3">{e.ms}</td>
                <td className="p-3">{e.modelo ?? e.fonte ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{e.ok ? `${e.textoLen} chars` : e.erro ?? e.finish ?? `HTTP ${e.http ?? "—"}`}</td>
              </tr>
            ))}
            {!eventos.length ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={5}>
                  Ainda sem turnos nesta instância. Use o chat da BION IA e atualize.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
