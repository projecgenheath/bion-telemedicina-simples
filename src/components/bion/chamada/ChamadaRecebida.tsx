"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Phone, PhoneOff, Video, VolumeX } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { useChamadaRecebida } from "@/lib/use-chamada-recebida";
import { marcarAtendidaNaSala, sincronizarUsuarioAtendidasNaSala } from "@/lib/chamada-atendidas-na-sala";
import {
  chaveChamada,
  decidirAposAtender,
  iniciaisContraparte,
  modoChamadaRecebida,
  respostaConsultaEncerrada,
  tentativaParaAtenderNaSala,
  textoConfirmarTroca,
  type ModoChamadaRecebida,
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
 *
 * Onde aparece (modoChamadaRecebida): fora de /consulta, tela cheia com toque;
 * em QUALQUER outra /consulta, aviso compacto no topo (só vibração curta, sem
 * toque) e "Atender" pede confirmação "Sair da chamada atual e atender?" com
 * o aviso de perda por papel (textoConfirmarTroca);
 * na sala da MESMA consulta, nada na tela, e a tentativa é atendida em segundo
 * plano (uma vez, sem navegar, erros ignorados).
 */
export function ChamadaRecebida() {
  const { sessao, autenticado, consultas } = useBion();
  const ativo = autenticado && (sessao.role === "paciente" || sessao.role === "medico");
  const { chamada, fechar, encerrar, fecharTentativa } = useChamadaRecebida(ativo, consultas);
  const usuarioId = autenticado ? (sessao.id ?? null) : null;
  // Logout ou troca de conta: esquece as tentativas atendidas em segundo plano.
  useEffect(() => {
    sincronizarUsuarioAtendidasNaSala(usuarioId);
  }, [usuarioId]);
  if (!chamada) return null;
  // useSearchParams pede Suspense no layout (senão o build estático reclama).
  return (
    <Suspense fallback={null}>
      <ChamadaNoLugar
        chamada={chamada}
        papel={sessao.role === "medico" ? "medico" : "paciente"}
        usuarioId={usuarioId}
        onFechar={fechar}
        onEncerrada={() => encerrar(chamada.consultaId)}
        onFecharTentativa={fecharTentativa}
      />
    </Suspense>
  );
}

function ChamadaNoLugar({
  chamada,
  papel,
  usuarioId,
  onFechar,
  onEncerrada,
  onFecharTentativa,
}: {
  chamada: ChamadaTocando;
  papel: PapelChamada;
  usuarioId: string | null;
  onFechar: () => void;
  onEncerrada: () => void;
  onFecharTentativa: (consultaId: string, tentativa: number) => void;
}) {
  const pathname = usePathname() ?? "";
  const busca = useSearchParams()?.toString() ?? "";
  const modo = modoChamadaRecebida(chamada.consultaId, pathname, busca ? `?${busca}` : "");

  // Já está na sala desta consulta: atende em segundo plano, uma vez, sem UI
  // nem navegação (erros, inclusive 409, ignorados) e fecha a tentativa.
  useEffect(() => {
    const alvo = tentativaParaAtenderNaSala(chamada, modo, Date.now());
    if (!alvo) return;
    // Um POST por usuário+consulta+tentativa (guarda também contra o efeito duplo do StrictMode).
    if (marcarAtendidaNaSala(usuarioId, alvo.consultaId, alvo.tentativa)) {
      void responder(alvo.consultaId, "atender", alvo.tentativa).catch(() => undefined);
    }
    onFecharTentativa(alvo.consultaId, alvo.tentativa);
  }, [chamada, modo, usuarioId, onFecharTentativa]);

  if (modo === "nada") return null;
  return (
    <ControleChamadaRecebida
      key={chaveChamada(chamada.consultaId, chamada.tentativa)}
      chamada={chamada}
      modo={modo}
      papel={papel}
      onFechar={onFechar}
      onEncerrada={onEncerrada}
    />
  );
}

export default ChamadaRecebida;

type Fase = "tocando" | "atendendo" | "recusando" | "bloqueado";
type PapelChamada = "paciente" | "medico";
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
export function ControleChamadaRecebida({
  chamada,
  modo = "tela",
  papel = "paciente",
  onFechar,
  onEncerrada,
}: {
  chamada: ChamadaTocando;
  modo?: Exclude<ModoChamadaRecebida, "nada">;
  /** Quem recebe (muda o texto da confirmação de troca de chamada). */
  papel?: PapelChamada;
  onFechar: () => void;
  /** 409 consulta_encerrada: fecha e não toca mais nesta consulta (padrão: só fecha). */
  onEncerrada?: () => void;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("tocando");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Tela cheia: toque em loop + vibração. Aviso (já numa chamada): só uma vibração curta.
  const somBloqueado = useToque(fase === "tocando" && modo === "tela");
  useVibracaoCurta(fase === "tocando" && modo === "aviso");
  const { consultaId, tentativa } = chamada;

  function pedirAtender() {
    if (fase !== "tocando") return;
    // No aviso compacto o usuário está em outra chamada: confirma antes de sair dela.
    if (modo === "aviso" && !confirmando) {
      setConfirmando(true);
      return;
    }
    void atender();
  }

  async function atender() {
    if (fase !== "tocando") return;
    setConfirmando(false);
    setFase("atendendo");
    const sala = await pedir(`/api/telemedicina/${encodeURIComponent(consultaId)}/sala?espiar=1`);
    // Bloqueado já na sala: não marca a chamada como atendida.
    const pre = decidirAposAtender(sala, null);
    if (pre.tipo === "fechar") {
      (onEncerrada ?? onFechar)();
      return;
    }
    if (pre.tipo === "bloqueado") {
      setMensagem(pre.mensagem);
      setFase("bloqueado");
      return;
    }
    const resp = await responder(consultaId, "atender", tentativa);
    const r = decidirAposAtender(sala, resp);
    // Consulta cancelada/concluída: só fecha o toque, sem navegar.
    if (r.tipo === "fechar") {
      (onEncerrada ?? onFechar)();
      return;
    }
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
    const resp = await responder(consultaId, "recusar", tentativa);
    if (respostaConsultaEncerrada(resp)) (onEncerrada ?? onFechar)();
    else onFechar();
  }

  if (modo === "aviso") {
    return (
      <AvisoChamadaRecebida
        contraparte={chamada.contraparte}
        especialidade={chamada.especialidade}
        fase={fase}
        mensagem={mensagem}
        confirmando={confirmando}
        textoConfirmacao={textoConfirmarTroca(papel)}
        onAtender={pedirAtender}
        onCancelarConfirmacao={() => setConfirmando(false)}
        onRecusar={recusar}
      />
    );
  }
  return (
    <TelaChamadaRecebida
      contraparte={chamada.contraparte}
      especialidade={chamada.especialidade}
      fase={fase}
      mensagem={mensagem}
      somBloqueado={somBloqueado}
      onAtender={pedirAtender}
      onRecusar={recusar}
    />
  );
}

/** Uma vibração curta ao aparecer o aviso compacto (sem toque: há uma chamada em andamento). */
function useVibracaoCurta(ativa: boolean) {
  useEffect(() => {
    if (!ativa || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try {
      navigator.vibrate(200);
    } catch {
      /* sem vibração */
    }
    return () => {
      try {
        navigator.vibrate(0);
      } catch {
        /* nada */
      }
    };
  }, [ativa]);
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

/**
 * Aviso compacto no topo, para quem já está em /consulta (outra chamada):
 * faixa pequena que não cobre os controles da chamada (que ficam embaixo),
 * não rouba o foco (atalhos M/V da chamada continuam) e não toca som.
 */
export function AvisoChamadaRecebida({
  contraparte,
  especialidade,
  fase,
  mensagem,
  confirmando,
  textoConfirmacao,
  onAtender,
  onCancelarConfirmacao,
  onRecusar,
}: {
  contraparte: string;
  especialidade: string;
  fase: Fase;
  mensagem?: string | null;
  confirmando: boolean;
  /** Texto da confirmação (textoConfirmarTroca(papel)). */
  textoConfirmacao: string;
  onAtender: () => void;
  onCancelarConfirmacao: () => void;
  onRecusar: () => void;
}) {
  const titulo = useId();
  const bloqueado = fase === "bloqueado";
  const ocupado = fase === "atendendo" || fase === "recusando";
  const nome = contraparte || "Chamada da consulta";
  return (
    <div
      role="dialog"
      aria-labelledby={titulo}
      aria-live="polite"
      className="fixed inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[200] mx-auto max-w-md rounded-2xl bg-[#0a1f44]/95 p-3 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md motion-safe:animate-in motion-safe:slide-in-from-top-4 motion-safe:fade-in"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold ring-1 ring-white/25">
          {!bloqueado && (
            <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-emerald-400/70 motion-safe:animate-ping [animation-duration:1.6s]" />
          )}
          {iniciaisContraparte(contraparte)}
        </div>
        <div className="min-w-0 flex-1">
          <p id={titulo} className="truncate text-sm font-semibold">
            {nome}
          </p>
          <p className="flex items-center gap-1 truncate text-xs text-white/70">
            <Video className="size-3.5 shrink-0" aria-hidden />
            {fase === "atendendo" ? "Conectando…" : `Chamada de vídeo${especialidade ? ` · ${especialidade}` : ""}`}
          </p>
        </div>
        {!confirmando && (
          // Celular: botões numa 2ª linha (o nome não fica cortado); sm+: tudo numa linha.
          <div className="ml-auto flex shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end">
            <BotaoAviso cor="vermelho" rotulo="Recusar" onClick={onRecusar} desativado={fase === "recusando"}>
              <PhoneOff className="size-4" aria-hidden />
            </BotaoAviso>
            {!bloqueado && (
              <BotaoAviso cor="verde" rotulo="Atender" onClick={onAtender} desativado={ocupado}>
                <Phone className="size-4" aria-hidden />
              </BotaoAviso>
            )}
          </div>
        )}
      </div>
      {confirmando && (
        <p className="mt-2 text-sm leading-snug text-white/90">{textoConfirmacao}</p>
      )}
      {confirmando && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancelarConfirmacao}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Continuar aqui
          </button>
          <BotaoAviso cor="verde" rotulo="Sair e atender" onClick={onAtender} desativado={ocupado}>
            <Phone className="size-4" aria-hidden />
          </BotaoAviso>
        </div>
      )}
      {bloqueado && mensagem && (
        <p role="alert" className="mt-2 rounded-xl bg-amber-400/15 px-3 py-2 text-center text-sm font-medium text-amber-100 ring-1 ring-amber-300/40">
          {mensagem}
        </p>
      )}
    </div>
  );
}

function BotaoAviso({
  cor,
  rotulo,
  onClick,
  desativado,
  children,
}: {
  cor: "verde" | "vermelho";
  rotulo: string;
  onClick: () => void;
  desativado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desativado}
      className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold shadow transition active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        cor === "verde" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
      }`}
    >
      {children}
      {rotulo}
    </button>
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
