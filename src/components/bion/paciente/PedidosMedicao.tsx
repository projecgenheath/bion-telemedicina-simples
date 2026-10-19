"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { ROTULO_TIPO, validarResposta, type TipoPedido } from "@/lib/saude-paciente";
import { apiSaude } from "./api-saude";

export type PedidoPendente = { id: string; consultaId: string | null; tipos: TipoPedido[]; medico: string; criadoEm: string };

/**
 * Pedidos de medição pendentes que o médico mandou (peso, altura, pressão).
 * - variante "app": card na seção Saúde (some quando não há pedido).
 * - variante "chamada": faixa sobre o vídeo, filtrada pela consulta; consulta a
 *   cada 15 s enquanto a chamada está aberta (o pedido chega durante a consulta).
 */
export function PedidosMedicao({ consultaId, variante = "app" }: { consultaId?: string; variante?: "app" | "chamada" }) {
  const { aplicarDelta } = useBion();
  const [pedidos, setPedidos] = useState<PedidoPendente[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const q = consultaId ? `?consultaId=${encodeURIComponent(consultaId)}` : "";
    const d = await apiSaude<{ pedidos: PedidoPendente[] }>(`/api/paciente/pedidos-medicao${q}`, undefined, true);
    if (d) setPedidos(d.pedidos);
  }, [consultaId]);

  useEffect(() => {
    // Primeira carga fora do corpo do efeito (evita setState síncrono no efeito).
    const t0 = setTimeout(() => void carregar(), 0);
    if (variante !== "chamada") return () => clearTimeout(t0);
    // Busca na hora quando o médico pede (broadcast `pedido_medicao_criado` no
    // canal da sala, repassado por teleconsulta-chamada); 15 s fica de reserva.
    const aoCriar = () => void carregar();
    window.addEventListener("bion:pedido-medicao-criado", aoCriar);
    const t = setInterval(() => void carregar(), 15_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
      window.removeEventListener("bion:pedido-medicao-criado", aoCriar);
    };
  }, [carregar, variante]);

  if (!pedidos.length) return null;

  const respondido = (id: string, medicoes: unknown[], perfil?: unknown) => {
    for (const m of medicoes) aplicarDelta({ medicao: m });
    if (perfil) aplicarDelta({ perfilPaciente: perfil });
    setPedidos((p) => p.filter((x) => x.id !== id));
    setAberto(null);
    toast.success("Medidas enviadas ao médico.");
  };

  const escuro = variante === "chamada";
  return (
    <div
      className={
        escuro
          ? "pointer-events-auto mx-auto w-full max-w-sm space-y-2"
          : "space-y-3"
      }
      aria-label="Pedidos de medição do médico"
    >
      {pedidos.map((p) => (
        <div
          key={p.id}
          className={
            escuro
              ? "rounded-2xl border border-white/15 bg-slate-900/85 p-4 text-white shadow-xl backdrop-blur"
              : "bp-glass p-5"
          }
        >
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{p.medico} pediu suas medidas</p>
              <p className={`text-xs ${escuro ? "text-white/75" : "opacity-80"}`}>
                {p.tipos.map((t) => ROTULO_TIPO[t]).join(", ")}
              </p>
            </div>
            {aberto !== p.id && (
              <button
                type="button"
                onClick={() => setAberto(p.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
                  escuro ? "bg-white text-slate-900" : "bg-bion-ink text-bion-paper dark:bg-bion-paper dark:text-bion-ink"
                }`}
              >
                Informar
              </button>
            )}
          </div>
          {aberto === p.id && (
            <FormPedido pedido={p} escuro={escuro} onCancelar={() => setAberto(null)} onEnviado={respondido} onFalhou={() => void carregar()} />
          )}
        </div>
      ))}
    </div>
  );
}

function Campo({
  rotulo,
  unidade,
  valor,
  onValor,
  escuro,
}: {
  rotulo: string;
  unidade: string;
  valor: string;
  onValor: (v: string) => void;
  escuro: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold">
      {rotulo}
      <span className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => onValor(e.target.value.replace(/[^\d.,]/g, ""))}
          className={`w-full min-w-0 rounded-xl border px-3 py-2 text-base font-normal outline-none focus-visible:ring-2 ${
            escuro
              ? "border-white/20 bg-white/10 text-white focus-visible:ring-white/60"
              : "border-bion-ink/15 bg-white/70 text-bion-ink focus-visible:ring-bion-ink/40 dark:border-white/15 dark:bg-white/10 dark:text-bion-paper"
          }`}
        />
        <span className="shrink-0 opacity-75">{unidade}</span>
      </span>
    </label>
  );
}

const n = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : undefined);

function FormPedido({
  pedido,
  escuro,
  onCancelar,
  onEnviado,
  onFalhou,
}: {
  pedido: PedidoPendente;
  escuro: boolean;
  onCancelar: () => void;
  onEnviado: (id: string, medicoes: unknown[], perfil?: unknown) => void;
  onFalhou?: (id: string) => void;
}) {
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [sis, setSis] = useState("");
  const [dia, setDia] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const resposta = { peso: n(peso), altura: n(altura), sistolica: n(sis), diastolica: n(dia) };
    const v = validarResposta(pedido.tipos, resposta);
    if (!v.ok) {
      toast.error(v.erro);
      return;
    }
    setEnviando(true);
    const d = await apiSaude<{ medicoes: unknown[]; perfilPaciente?: unknown }>(
      `/api/paciente/pedidos-medicao/${pedido.id}`,
      { method: "POST", body: JSON.stringify(resposta) },
    );
    setEnviando(false);
    if (d) onEnviado(pedido.id, d.medicoes, d.perfilPaciente);
    else onFalhou?.(pedido.id);
  };

  return (
    <form onSubmit={enviar} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {pedido.tipos.includes("peso") && <Campo rotulo="Peso" unidade="kg" valor={peso} onValor={setPeso} escuro={escuro} />}
        {pedido.tipos.includes("altura") && (
          <Campo rotulo="Altura" unidade="cm" valor={altura} onValor={setAltura} escuro={escuro} />
        )}
        {pedido.tipos.includes("pressao") && (
          <>
            <Campo rotulo="Pressão máxima" unidade="mmHg" valor={sis} onValor={setSis} escuro={escuro} />
            <Campo rotulo="Pressão mínima" unidade="mmHg" valor={dia} onValor={setDia} escuro={escuro} />
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-full px-4 py-2 text-xs font-bold opacity-80">
          Agora não
        </button>
        <button
          type="submit"
          disabled={enviando}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-60 ${
            escuro ? "bg-white text-slate-900" : "bg-bion-ink text-bion-paper dark:bg-bion-paper dark:text-bion-ink"
          }`}
        >
          {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Enviar ao médico
        </button>
      </div>
    </form>
  );
}
