"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Pedido = {
  id: string;
  status: string;
  valorCentavos: number;
  justificativa: string;
  respostaAdmin: string | null;
  criadoEm: string;
  decididoEm: string | null;
  consulta: {
    id: string;
    especialidade: string;
    dataInicio: string;
    medico: string;
    paciente: string;
  } | null;
};

const FILTROS = [
  ["em_analise", "Em análise"],
  ["aprovado", "Aprovados"],
  ["negado", "Negados"],
  ["todos", "Todos"],
] as const;

const ROTULO: Record<string, string> = {
  em_analise: "Em análise",
  aprovado: "Aprovado",
  negado: "Negado",
  processado: "Devolvido",
  falhou: "Falhou",
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/**
 * Pedidos MANUAIS de reembolso (faltas do paciente). O paciente pede em até
 * 7 dias com justificativa; o admin aprova ou nega (negar exige resposta,
 * que vai para o paciente). Aprovado: a consulta sai do repasse do médico.
 */
export function AdminReembolsos() {
  const [filtro, setFiltro] = useState<string>("em_analise");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregar = useCallback(async (status: string) => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/admin/reembolsos?status=${encodeURIComponent(status)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { total?: number; reembolsos?: Pedido[]; erro?: string } | null;
      if (!res.ok) throw new Error(json?.erro || "Não foi possível carregar os pedidos.");
      setPedidos(json?.reembolsos ?? []);
      setTotal(json?.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha de conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(filtro);
  }, [filtro, carregar]);

  const decidir = async (p: Pedido, decisao: "aprovar" | "negar") => {
    const resposta = (respostas[p.id] ?? "").trim();
    if (decisao === "negar" && resposta.length < 10) {
      toast.error("Para negar, escreva o motivo ao paciente (mínimo de 10 caracteres).");
      return;
    }
    setEnviando(p.id);
    try {
      const res = await fetch(`/api/admin/reembolsos/${encodeURIComponent(p.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, resposta }),
      });
      const json = (await res.json().catch(() => null)) as { erro?: string } | null;
      if (!res.ok) throw new Error(json?.erro || "Não foi possível registrar a decisão.");
      toast.success(decisao === "aprovar" ? "Reembolso aprovado." : "Reembolso negado.");
      await carregar(filtro);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha de conexão com o servidor.");
    } finally {
      setEnviando(null);
    }
  };

  return (
    <section className="bg-card border rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div>
          <h3 className="font-extrabold text-foreground text-sm">Pedidos de reembolso (faltas)</h3>
          <p className="text-xs text-muted-foreground">
            O paciente pede em até 7 dias. Aprovado, a consulta sai do repasse do médico.
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {FILTROS.map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap ${
                filtro === v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            onClick={() => void carregar(filtro)}
            aria-label="Atualizar"
            className="px-2 py-1.5 rounded-xl border hover:bg-muted"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {carregando ? (
        <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
      ) : pedidos.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum pedido neste filtro.</p>
      ) : (
        <div className="space-y-3">
          {total > pedidos.length && (
            <p className="text-xs text-muted-foreground">
              Mostrando {pedidos.length} de {total}.
            </p>
          )}
          {pedidos.map((p) => (
            <div key={p.id} className="border rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">{p.consulta?.paciente ?? "Paciente"}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground">
                  {ROTULO[p.status] ?? p.status}
                </span>
                <span className="text-xs font-bold text-foreground ml-auto">{reais(p.valorCentavos)}</span>
              </div>
              {p.consulta && (
                <p className="text-xs text-muted-foreground">
                  {p.consulta.especialidade} com {p.consulta.medico} • {quando(p.consulta.dataInicio)} • pedido em{" "}
                  {quando(p.criadoEm)}
                </p>
              )}
              <p className="text-xs text-foreground whitespace-pre-wrap">“{p.justificativa}”</p>
              {p.status === "em_analise" ? (
                <div className="space-y-2">
                  <textarea
                    value={respostas[p.id] ?? ""}
                    onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))}
                    maxLength={1000}
                    rows={2}
                    placeholder="Resposta ao paciente (obrigatória para negar)"
                    className="w-full px-3 py-2 rounded-xl border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      disabled={enviando === p.id}
                      onClick={() => void decidir(p, "negar")}
                      className="px-3 py-2 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Negar
                    </button>
                    <button
                      disabled={enviando === p.id}
                      onClick={() => void decidir(p, "aprovar")}
                      className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprovar
                    </button>
                  </div>
                </div>
              ) : (
                p.respostaAdmin && <p className="text-xs text-muted-foreground">Resposta: {p.respostaAdmin}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
