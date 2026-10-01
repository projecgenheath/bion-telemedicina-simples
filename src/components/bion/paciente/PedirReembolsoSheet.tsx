"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtTicketData, type Consulta } from "@/lib/bion-tipos";
import { fmtCentavos } from "./usePreviaCancelamento";
import { useRecarregarEstado } from "./useRemarcacaoComMulta";
import {
  JUSTIFICATIVA_MAX,
  JUSTIFICATIVA_MIN,
  pedirReembolsoManual,
  rotuloReembolsoManual,
  useReembolsoManual,
} from "./useReembolsoManual";

/**
 * Folha do reembolso MANUAL de uma consulta marcada como falta do paciente.
 * Sem pedido: formulário com a justificativa (10–1000 caracteres, igual ao
 * servidor) dentro do prazo `podePedirAte`. Com pedido: detalhes (GET) —
 * justificativa, status, resposta do admin e datas (Brasília).
 */
export function PedirReembolsoSheet({ consulta, onFechar }: { consulta: Consulta; onFechar: () => void }) {
  const temPedido = !!consulta.reembolsoManual;
  const recarregarEstado = useRecarregarEstado();
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const tamanho = justificativa.trim().length;
  const valida = tamanho >= JUSTIFICATIVA_MIN && tamanho <= JUSTIFICATIVA_MAX;
  const prazo = consulta.podePedirAte ?? null;
  const prazoAberto = !!prazo && Date.now() < new Date(prazo).getTime();

  const enviar = async () => {
    if (!valida || !prazoAberto || enviando) return;
    setEnviando(true);
    setErroEnvio(null);
    const r = await pedirReembolsoManual(consulta.id, justificativa);
    if (r.ok) {
      await recarregarEstado();
      setEnviando(false);
      toast.success("Pedido de reembolso enviado — você será avisado da decisão");
      onFechar();
      return;
    }
    setEnviando(false);
    setErroEnvio(r.erro);
    // 409 (já existe pedido / prazo terminou): atualiza o card para refletir o servidor.
    if (r.status === 409) void recarregarEstado();
  };

  const fechar = () => {
    if (!enviando) onFechar();
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-sheet-reembolso">
      <button type="button" className="absolute inset-0 bg-black/80" aria-label="Fechar" onClick={fechar} />
      <div className="relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bg-zinc-950 text-white border-t border-white/10 px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
        <h2 id="titulo-sheet-reembolso" className="text-lg font-bold">
          {temPedido ? "Pedido de reembolso" : "Pedir reembolso"}
        </h2>
        <p className="text-sm text-white/60 mt-1">
          {consulta.especialidade} com {consulta.medico} · {consulta.data} às {consulta.hora}
        </p>

        {temPedido ? (
          <DetalhesPedido consultaId={consulta.id} onFechar={fechar} />
        ) : (
          <>
            <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-white/75">
              <p>
                O médico ficou na sala e a consulta foi registrada como <strong className="text-white">falta</strong>, por isso não há
                reembolso automático.
              </p>
              <p className="mt-2">
                Se você teve um motivo, explique abaixo. A equipe BION analisa o pedido; se for aprovado, o valor integral
                {consulta.valor ? ` (${consulta.valor})` : ""} volta pelo mesmo meio de pagamento. Se for negado, a decisão é definitiva.
              </p>
              {prazo ? (
                <p className="mt-2 text-xs text-white/55">
                  {prazoAberto ? `Prazo para pedir: até ${fmtTicketData(prazo)} (horário de Brasília).` : "O prazo de 7 dias para pedir reembolso já terminou."}
                </p>
              ) : null}
            </div>

            <label htmlFor="justificativa-reembolso" className="block text-xs font-bold mt-4 mb-2 text-white/80">
              Justificativa
            </label>
            <textarea
              id="justificativa-reembolso"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value.slice(0, JUSTIFICATIVA_MAX + 200))}
              disabled={!prazoAberto || enviando}
              className="w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-sm text-white placeholder:text-white/40 disabled:opacity-50"
              rows={5}
              placeholder="Conte o que aconteceu (ex.: problema de conexão, emergência…)"
              aria-describedby="contador-justificativa"
            />
            <div id="contador-justificativa" className="mt-1 flex justify-between text-[11px]" aria-live="polite">
              <span className={tamanho > 0 && !valida ? "text-amber-300" : "text-white/45"}>
                {tamanho < JUSTIFICATIVA_MIN
                  ? `Mínimo de ${JUSTIFICATIVA_MIN} caracteres`
                  : tamanho > JUSTIFICATIVA_MAX
                    ? `Máximo de ${JUSTIFICATIVA_MAX} caracteres`
                    : "Tudo certo"}
              </span>
              <span className={tamanho > JUSTIFICATIVA_MAX ? "text-amber-300" : "text-white/45"}>
                {tamanho}/{JUSTIFICATIVA_MAX}
              </span>
            </div>

            {erroEnvio ? (
              <div className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
                {erroEnvio}
              </div>
            ) : null}

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={fechar}
                disabled={enviando}
                className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-semibold disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={!valida || !prazoAberto || enviando}
                className="flex-1 py-3 rounded-xl bg-sky-500 text-zinc-950 text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Enviar pedido
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetalhesPedido({ consultaId, onFechar }: { consultaId: string; onFechar: () => void }) {
  const { reembolso: r, carregando, erro, recarregar } = useReembolsoManual(consultaId);

  return (
    <>
      {carregando ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900 p-4 text-sm text-white/70 inline-flex w-full items-center gap-2" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando o pedido…
        </div>
      ) : erro || !r ? (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm" role="alert">
          <p className="text-red-100">{erro ?? "Pedido de reembolso não encontrado."}</p>
          <button type="button" onClick={recarregar} className="mt-3 rounded-full px-3 py-1.5 text-xs font-bold bg-white/10">
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">Status</span>
              <EtiquetaStatus status={r.status} />
            </div>
            <ul className="mt-3 space-y-1 text-white/75">
              <li>
                Valor: <strong className="text-white">{fmtCentavos(r.valorCentavos)}</strong>
              </li>
              <li>Pedido em {fmtTicketData(r.criadoEm)}</li>
              {r.decididoEm ? <li>Decidido em {fmtTicketData(r.decididoEm)}</li> : null}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">Sua justificativa</span>
            <p className="mt-2 whitespace-pre-wrap text-white/85">{r.justificativa || "—"}</p>
          </div>
          {r.respostaAdmin ? (
            <div
              className={`rounded-2xl border p-4 ${
                r.status === "negado" ? "border-red-400/30 bg-red-500/10" : "border-white/10 bg-zinc-900"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">Resposta da equipe BION</span>
              <p className="mt-2 whitespace-pre-wrap text-white/85">{r.respostaAdmin}</p>
            </div>
          ) : null}
          {r.status === "negado" ? (
            <p className="text-xs text-white/55">A decisão é definitiva e não é possível fazer um novo pedido para esta consulta.</p>
          ) : r.status === "em_analise" ? (
            <p className="text-xs text-white/55">Você será avisado quando a equipe decidir.</p>
          ) : null}
        </div>
      )}
      <button type="button" onClick={onFechar} className="mt-5 w-full py-3 rounded-xl border border-white/15 text-sm font-semibold">
        Fechar
      </button>
    </>
  );
}

export function EtiquetaStatus({ status, claro = false }: { status: string; claro?: boolean }) {
  const rotulo = rotuloReembolsoManual(status);
  const cor = claro
    ? rotulo.tom === "ok"
      ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
      : rotulo.tom === "erro"
        ? "bg-destructive/10 text-destructive"
        : "bg-sky-500/15 text-sky-800 dark:text-sky-200"
    : rotulo.tom === "ok"
      ? "bg-emerald-500/15 text-emerald-200"
      : rotulo.tom === "erro"
        ? "bg-red-500/15 text-red-200"
        : "bg-sky-500/15 text-sky-200";
  return <span className={`text-[11px] font-bold px-2 py-1 rounded-full text-right ${cor}`}>{rotulo.texto}</span>;
}
