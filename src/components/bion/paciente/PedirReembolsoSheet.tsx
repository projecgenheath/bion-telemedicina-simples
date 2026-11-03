"use client";

import { useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { useArrastarFechar } from "./useArrastarFechar";
import { EstadoCarregando, EstadoErro } from "./EstadosPaciente";
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
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
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
      toast.success("Reembolso aprovado na hora — a devolução será processada em seguida");
      onFechar();
      return;
    }
    setEnviando(false);
    setErroEnvio(r.erro);
    // 409 (já existe pedido / prazo terminou): atualiza o card para refletir o servidor.
    if (r.status === 409) void recarregarEstado();
  };

  const fechar = () => {
    if (enviando) return;
    // B21: fechar (voltar/ESC/arrastar/véu) com justificativa escrita e
    // não enviada pede confirmação antes de descartar o texto — distinto
    // de M12 (envio em andamento, que simplesmente não fecha).
    if (!temPedido && justificativa.trim().length > 0 && !confirmarDescarte) {
      setConfirmarDescarte(true);
      return;
    }
    onFechar();
  };
  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, fechar);
  useFocoDialogo(true, fechar, dialogoRef);
  const painelRef = useRef<HTMLDivElement>(null);
  useArrastarFechar(painelRef, fechar);

  return (
    <div ref={dialogoRef} className="bpp-sheet-raiz absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-sheet-reembolso">
      <button type="button" className="absolute inset-0 bpp-sheet-veu" aria-label="Fechar" onClick={fechar} />
      <div
        ref={painelRef} className="bpp-sheet-painel relative w-full max-w-lg max-h-[92svh] overflow-y-auto rounded-t-3xl bpp-sheet border-t bpp-sheet-borda px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(2,8,26,0.35)]">
        <div data-arrastar className="-mx-5 -mt-3 mb-1 pt-3 pb-3 touch-none"><div className="mx-auto h-1.5 w-12 rounded-full bpp-sheet-alca" aria-hidden /></div>
        <h2 data-arrastar id="titulo-sheet-reembolso" className="text-lg font-bold">
          {temPedido ? "Pedido de reembolso" : "Pedir reembolso"}
        </h2>
        <p className="text-sm bpp-sheet-suave mt-1">
          {consulta.especialidade} com {consulta.medico} · {consulta.data} às {consulta.hora}
        </p>

        {temPedido ? (
          <DetalhesPedido consultaId={consulta.id} onFechar={fechar} />
        ) : (
          <>
            <div className="mt-4 rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4 text-sm bpp-sheet-suave">
              <p>
                O médico ficou na sala e a consulta foi registrada como <strong className="bpp-sheet-forte">falta</strong>, por isso o reembolso
                não é feito sozinho: você precisa pedir abaixo. Depois do pedido, o reembolso é aprovado na hora.
              </p>
              <p className="mt-2">
                Se você teve um motivo, explique abaixo. O reembolso é integral
                {consulta.valor ? ` (${consulta.valor})` : ""}, aprovado na hora e sem etapa de análise;
                a devolução do valor é processada em seguida.
              </p>
              {prazo ? (
                <p className="mt-2 text-xs bpp-sheet-suave">
                  {prazoAberto ? `Prazo para pedir: até ${fmtTicketData(prazo)} (horário de Brasília).` : "O prazo de 7 dias para pedir reembolso já terminou."}
                </p>
              ) : null}
            </div>

            <label htmlFor="justificativa-reembolso" className="block text-xs font-bold mt-4 mb-2 bpp-sheet-suave">
              Justificativa
            </label>
            <textarea
              id="justificativa-reembolso"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value.slice(0, JUSTIFICATIVA_MAX + 200))}
              disabled={!prazoAberto || enviando}
              className="w-full rounded-xl border bpp-sheet-borda p-3 text-sm bpp-sheet-campo disabled:opacity-50"
              rows={5}
              placeholder="Conte o que aconteceu (ex.: problema de conexão, emergência…)"
              aria-describedby="contador-justificativa"
            />
            <div id="contador-justificativa" className="mt-1 flex justify-between text-xs" aria-live="polite">
              <span className={tamanho > 0 && !valida ? "text-amber-800 dark:text-amber-300" : "bpp-sheet-suave"}>
                {tamanho < JUSTIFICATIVA_MIN
                  ? `Mínimo de ${JUSTIFICATIVA_MIN} caracteres`
                  : tamanho > JUSTIFICATIVA_MAX
                    ? `Máximo de ${JUSTIFICATIVA_MAX} caracteres`
                    : "Tudo certo"}
              </span>
              <span className={tamanho > JUSTIFICATIVA_MAX ? "text-amber-800 dark:text-amber-300" : "bpp-sheet-suave"}>
                {tamanho}/{JUSTIFICATIVA_MAX}
              </span>
            </div>

            {erroEnvio ? (
              <div className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-900 dark:text-red-100" role="alert">
                {erroEnvio}
              </div>
            ) : null}

            {confirmarDescarte ? (
              <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4" role="alertdialog" aria-label="Descartar justificativa?">
                <p className="text-sm font-bold">Descartar a justificativa?</p>
                <p className="text-sm bpp-sheet-suave mt-1">
                  O texto que você escreveu ainda não foi enviado e será perdido se fechar agora.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setConfirmarDescarte(false)}
                    className="bpp-toque flex-1 py-3 rounded-xl bpp-sheet-primario text-sm font-bold"
                  >
                    Continuar escrevendo
                  </button>
                  <button
                    type="button"
                    onClick={onFechar}
                    className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold"
                  >
                    Descartar e fechar
                  </button>
                </div>
              </div>
            ) : (
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={fechar}
                disabled={enviando}
                className="bpp-toque flex-1 py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={!valida || !prazoAberto || enviando}
                className="bpp-toque flex-1 py-3 rounded-xl bpp-sheet-primario text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Enviar pedido
              </button>
            </div>
            )}
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
        <EstadoCarregando texto="Carregando o pedido…" superficie="janela" className="mt-4" />
      ) : erro || !r ? (
        <EstadoErro
          texto={erro ?? "Pedido de reembolso não encontrado."}
          onTentarDeNovo={recarregar}
          superficie="janela"
          className="mt-4"
        />
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider bpp-sheet-suave">Status</span>
              <EtiquetaStatus status={r.status} />
            </div>
            <ul className="mt-3 space-y-1 bpp-sheet-suave">
              <li>
                Valor: <strong className="bpp-sheet-forte">{fmtCentavos(r.valorCentavos)}</strong>
              </li>
              <li>Pedido em {fmtTicketData(r.criadoEm)}</li>
              {r.decididoEm ? <li>Decidido em {fmtTicketData(r.decididoEm)}</li> : null}
            </ul>
          </div>
          <div className="rounded-2xl border bpp-sheet-borda bpp-sheet-cartao p-4">
            <span className="text-xs font-bold uppercase tracking-wider bpp-sheet-suave">Sua justificativa</span>
            <p className="mt-2 whitespace-pre-wrap bpp-sheet-suave">{r.justificativa || "—"}</p>
          </div>
          {r.respostaAdmin ? (
            <div
              className={`rounded-2xl border p-4 ${
                r.status === "negado" ? "border-red-400/30 bg-red-500/10" : "bpp-sheet-borda bpp-sheet-cartao"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider bpp-sheet-suave">Resposta da equipe BION</span>
              <p className="mt-2 whitespace-pre-wrap bpp-sheet-suave">{r.respostaAdmin}</p>
            </div>
          ) : null}
          {r.status === "negado" ? (
            <p className="text-xs bpp-sheet-suave">A decisão é definitiva e não é possível fazer um novo pedido para esta consulta.</p>
          ) : r.status === "em_analise" ? (
            <p className="text-xs bpp-sheet-suave">Você será avisado quando a equipe decidir.</p>
          ) : null}
        </div>
      )}
      <button type="button" onClick={onFechar} className="mt-5 w-full py-3 rounded-xl border bpp-sheet-borda text-sm font-semibold">
        Fechar
      </button>
    </>
  );
}

export function EtiquetaStatus({ status }: { status: string; claro?: boolean }) {
  // Fase 3: as janelas seguem o tema (Clean/Dark), então a etiqueta usa
  // sempre o par claro/escuro — o antigo `claro` ficou só por compatibilidade.
  const rotulo = rotuloReembolsoManual(status);
  const cor =
    rotulo.tom === "ok"
      ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
      : rotulo.tom === "erro"
        ? "bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300"
        : "bg-sky-500/15 text-sky-800 dark:text-sky-200";
  return <span className={`text-xs font-bold px-2 py-1 rounded-full text-right ${cor}`}>{rotulo.texto}</span>;
}
