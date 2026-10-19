"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, PhoneOff, Video, VolumeX } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { useChamadaRecebida } from "@/lib/use-chamada-recebida";
import {
  chaveChamada,
  decidirAposAtender,
  iniciaisContraparte,
  type ChamadaTocando,
} from "@/lib/chamada-recebida-logica";

/**
 * Chamada recebida com o app aberto (tele v2, fase 2) — COMUM a paciente e
 * médico. Montado uma vez no layout do grupo (bion): `<ChamadaRecebida />`.
 * Só existe para os papéis paciente e médico (admin não ouve nem vê).
 *
 * Atender: pré-checa a sala (GET .../sala?espiar=1, só leitura), faz
 * POST .../chamada { acao: "atender" } e vai para /consulta?consulta=<id>.
 * Se vier 409 { motivo: "evolucao_pendente" } (da sala ou da rota chamada),
 * NÃO navega: para o toque e mostra "Conclua a evolução anterior para atender".
 * Recusar: POST .../chamada { acao: "recusar" } e fecha.
 */
export function ChamadaRecebida() {
  const { sessao, autenticado, consultas } = useBion();
  const ativo = autenticado && (sessao.role === "paciente" || sessao.role === "medico");
  const { chamada, fechar } = useChamadaRecebida(ativo, consultas);
  if (!chamada) return null;
  return <ControleChamadaRecebida key={chaveChamada(chamada.consultaId, chamada.tentativa)} chamada={chamada} onFechar={fechar} />;
}

export default ChamadaRecebida;

type Fase = "tocando" | "atendendo" | "recusando" | "bloqueado";
type Resposta = { status: number; corpo?: unknown } | null;

async function pedir(url: string, init?: RequestInit): Promise<Resposta> {
  try {
    const r = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    const corpo = await r.json().catch(() => undefined);
    return { status: r.status, corpo };
  } catch {
    return null;
  }
}

function responder(consultaId: string, acao: "atender" | "recusar", tentativa: number): Promise<Resposta> {
  return pedir(`/api/telemedicina/${encodeURIComponent(consultaId)}/chamada`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao, tentativa }),
  });
}

/** Controle de UMA chamada (toque, atender, recusar). Exportado para testes manuais/harness. */
export function ControleChamadaRecebida({ chamada, onFechar }: { chamada: ChamadaTocando; onFechar: () => void }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("tocando");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const somBloqueado = useToque(fase === "tocando");
  const { consultaId, tentativa } = chamada;

  async function atender() {
    if (fase !== "tocando") return;
    setFase("atendendo");
    const sala = await pedir(`/api/telemedicina/${encodeURIComponent(consultaId)}/sala?espiar=1`);
    // Bloqueado já na sala: não marca a chamada como atendida.
    const pre = decidirAposAtender(sala, null);
    if (pre.tipo === "bloqueado") {
      setMensagem(pre.mensagem);
      setFase("bloqueado");
      return;
    }
    const resp = await responder(consultaId, "atender", tentativa);
    const r = decidirAposAtender(sala, resp);
    if (r.tipo === "bloqueado") {
      setMensagem(r.mensagem);
      setFase("bloqueado");
      return;
    }
    onFechar();
    router.push(`/consulta?consulta=${encodeURIComponent(consultaId)}`);
  }

  async function recusar() {
    if (fase === "recusando") return;
    setFase("recusando");
    await responder(consultaId, "recusar", tentativa);
    onFechar();
  }

  return (
    <TelaChamadaRecebida
      contraparte={chamada.contraparte}
      especialidade={chamada.especialidade}
      fase={fase}
      mensagem={mensagem}
      somBloqueado={somBloqueado}
      onAtender={atender}
      onRecusar={recusar}
    />
  );
}

/**
 * Toque em loop (public/sons/toque.mp3, sintetizado — sem áudio de terceiros)
 * + vibração onde houver. Se o navegador bloquear o autoplay, a tela aparece
 * do mesmo jeito e o som tenta de novo no primeiro toque/tecla do usuário.
 * Devolve true enquanto o som estiver bloqueado.
 */
function useToque(tocar: boolean): boolean {
  const [bloqueado, setBloqueado] = useState(false);
  useEffect(() => {
    if (!tocar) return;
    let parado = false;
    const audio = typeof Audio === "undefined" ? null : new Audio("/sons/toque.mp3");
    const tentar = () => {
      if (!audio || parado) return;
      audio.play().then(
        () => {
          if (!parado) setBloqueado(false);
        },
        () => {
          if (!parado) setBloqueado(true);
        },
      );
    };
    if (audio) {
      audio.loop = true;
      tentar();
    }
    const destravar = () => tentar();
    window.addEventListener("pointerdown", destravar, { once: true });
    window.addEventListener("keydown", destravar, { once: true });

    const podeVibrar = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const vibrar = () => {
      try {
        navigator.vibrate([700, 300, 700]);
      } catch {
        /* sem vibração */
      }
    };
    let intervalo: number | undefined;
    if (podeVibrar) {
      vibrar();
      intervalo = window.setInterval(vibrar, 3000);
    }
    return () => {
      parado = true;
      window.removeEventListener("pointerdown", destravar);
      window.removeEventListener("keydown", destravar);
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (intervalo !== undefined) window.clearInterval(intervalo);
      if (podeVibrar) {
        try {
          navigator.vibrate(0);
        } catch {
          /* nada */
        }
      }
    };
  }, [tocar]);
  return tocar && bloqueado;
}

/** Tela (só apresentação). Exportada para o harness e para quem quiser reaproveitar. */
export function TelaChamadaRecebida({
  contraparte,
  especialidade,
  fase,
  mensagem,
  somBloqueado = false,
  onAtender,
  onRecusar,
}: {
  contraparte: string;
  especialidade: string;
  fase: Fase;
  mensagem?: string | null;
  somBloqueado?: boolean;
  onAtender: () => void;
  onRecusar: () => void;
}) {
  const titulo = useId();
  const atenderRef = useRef<HTMLButtonElement>(null);
  const bloqueado = fase === "bloqueado";
  const ocupado = fase === "atendendo" || fase === "recusando";

  useEffect(() => {
    atenderRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titulo}
      className="fixed inset-0 z-[200] flex justify-center bg-[#0b1424] text-white"
    >
      <div className="relative flex h-full w-full max-w-[min(100vw,calc(100dvh*9/16))] flex-col items-center overflow-hidden bg-gradient-to-b from-[#123e7d] via-[#0a1f44] to-[#0b1424] px-6 pt-[max(3.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:my-6 sm:h-[calc(100%-3rem)] sm:rounded-[2rem] sm:shadow-2xl sm:ring-1 sm:ring-white/10">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-[#14457f]/40 blur-3xl" />

        <p className="relative flex items-center gap-2 text-sm font-medium text-white/75">
          <Video className="size-4" aria-hidden />
          Consulta Bion · chamada de vídeo
        </p>

        <div className="relative mt-14 flex items-center justify-center">
          {!bloqueado && (
            <>
              <span aria-hidden className="absolute size-40 rounded-full bg-white/10 motion-safe:animate-ping [animation-duration:2s]" />
              <span aria-hidden className="absolute size-48 rounded-full ring-1 ring-white/10 motion-safe:animate-pulse" />
            </>
          )}
          <div className="relative flex size-32 items-center justify-center rounded-full bg-white/15 text-4xl font-semibold tracking-wide ring-2 ring-white/30 backdrop-blur">
            {iniciaisContraparte(contraparte)}
          </div>
        </div>

        <h2 id={titulo} className="relative mt-10 max-w-full truncate text-center text-3xl font-semibold">
          {contraparte || "Chamada da consulta"}
        </h2>
        {especialidade && <p className="relative mt-2 text-center text-base text-white/70">{especialidade}</p>}

        <p className="relative mt-6 min-h-6 text-center text-sm text-white/70" aria-live="polite">
          {bloqueado ? null : fase === "atendendo" ? "Conectando…" : fase === "recusando" ? "Recusando…" : "Chamando…"}
        </p>

        {bloqueado && mensagem && (
          <div role="alert" className="relative mt-2 w-full rounded-2xl bg-amber-400/15 px-4 py-3 text-center text-base font-medium text-amber-100 ring-1 ring-amber-300/40">
            {mensagem}
          </div>
        )}

        {somBloqueado && !bloqueado && (
          <p className="relative mt-2 flex items-center gap-1.5 text-xs text-white/60">
            <VolumeX className="size-3.5" aria-hidden /> Toque na tela para ativar o som
          </p>
        )}

        <div className="relative mt-auto flex w-full items-start justify-center gap-16">
          <BotaoRedondo cor="vermelho" rotulo="Recusar" onClick={onRecusar} desativado={fase === "recusando"}>
            <PhoneOff className="size-8" aria-hidden />
          </BotaoRedondo>
          {!bloqueado && (
            <BotaoRedondo ref={atenderRef} cor="verde" rotulo="Atender" onClick={onAtender} desativado={ocupado}>
              <Phone className="size-8" aria-hidden />
            </BotaoRedondo>
          )}
        </div>
      </div>
    </div>
  );
}

function BotaoRedondo({
  cor,
  rotulo,
  onClick,
  desativado,
  children,
  ref,
}: {
  cor: "verde" | "vermelho";
  rotulo: string;
  onClick: () => void;
  desativado?: boolean;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={desativado}
        aria-label={rotulo}
        className={`flex size-[4.5rem] items-center justify-center rounded-full shadow-lg transition active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60 ${
          cor === "verde" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
        }`}
      >
        {children}
      </button>
      <span className="text-sm font-medium text-white/85">{rotulo}</span>
    </div>
  );
}
