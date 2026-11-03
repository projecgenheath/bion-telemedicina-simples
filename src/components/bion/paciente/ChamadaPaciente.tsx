"use client";

import { tipoDaConsulta } from "./tipo-atendimento-ui";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Clock, MonitorUp, MonitorX, WifiOff, X } from "lucide-react";
import { textoForaDaJanela } from "@/lib/teleconsulta-logica";
import { ConsultaNaoEncontrada, ErroSalaFatal } from "@/components/bion/consulta/SalaConsultaTela";
import { ConsultaPainelLateral } from "@/components/bion/consulta/PainelLateral";
import { AlertaMidia } from "@/components/bion/consulta/AlertaMidia";
import { useSalaConsulta, type SalaConsulta } from "@/components/bion/consulta/useSalaConsulta";
import { BarraChamada, BotaoChamada } from "@/components/bion/chamada/BarraChamada";
import { podeCompartilharTelaAqui } from "@/components/bion/chamada/compartilhar-tela";
import { VideoChamada916 } from "@/components/bion/chamada/VideoChamada916";
import { useAtalhosChamada } from "@/components/bion/chamada/useAtalhosChamada";
import { useCamerasDisponiveis } from "@/components/bion/chamada/useCamerasDisponiveis";
import { PedidosMedicao } from "./PedidosMedicao";
import { EsperaMedicoPainel } from "./EsperaMedicoPainel";
import { useRecarregarEstado } from "./useRemarcacaoComMulta";
import { ModalBion } from "@/components/bion/ModalBion";

/**
 * Sala de teleconsulta do PACIENTE: tela cheia 9:16 estilo ligação.
 * Toda a lógica (janela, presença, saída, alertas, chat) continua em
 * useSalaConsulta/useTeleconsulta; aqui é só a casca. O paciente só SAI
 * da chamada (não encerra a consulta). O admin nunca chega aqui: o roteador
 * (Consulta.tsx) o manda para Agendamentos (RedirecionaAdminSala).
 */
export function ChamadaPaciente({
  onEnd,
  consultaId,
}: {
  onEnd: () => void;
  consultaId?: string;
}) {
  const sala = useSalaConsulta({ role: "paciente", consultaId, onEnd });
  if (sala.tele.naoEncontrada) return <ConsultaNaoEncontrada role="paciente" />;
  // M16: 401/402/403 no polling — o motor parou; a tela mostra a orientação
  // (sessão expirada/pagamento) em vez de "o médico vai entrar em instantes".
  if (sala.tele.erroSala) return <ErroSalaFatal erro={sala.tele.erroSala} onVoltar={onEnd} />;
  return <TelaChamadaPaciente sala={sala} onEnd={onEnd} />;
}

/**
 * B43: desfaz o fmtValorBRL do store ("R$ 150" / "R$ 149,90") para
 * centavos, para o painel de espera saber se é retorno grátis (valor 0).
 * Se não der para interpretar, devolve undefined e o painel mantém o
 * comportamento de antes.
 */
function valorConsultaCentavosDe(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor.replace("R$", "").trim().replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

/** "MM:SS" (ou "H:MM:SS") desde a primeira vez que a chamada conectou. */
function useTempoDeChamada(conectado: boolean): string | null {
  const [comecou, setComecou] = useState(false);
  const [segundos, setSegundos] = useState(0);
  // Primeira conexão: marca o início (ajuste no render, sem efeito em cascata).
  if (conectado && !comecou) setComecou(true);
  useEffect(() => {
    if (!comecou) return;
    const t0 = Date.now();
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [comecou]);
  if (!comecou) return null;
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Botão de compartilhar tela só no computador (relê se o ponteiro principal mudar). */
function usePodeCompartilharTela(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia("(pointer: fine)");
      mq.addEventListener?.("change", avisar);
      return () => mq.removeEventListener?.("change", avisar);
    },
    podeCompartilharTelaAqui,
    () => false,
  );
}

/** Texto no lugar do vídeo do médico, conforme o estado da sala. */
function textoEspera(t: SalaConsulta["tele"]): { titulo: string; detalhe?: string; animar: boolean } {
  if (t.status === "encerrada") {
    return { titulo: "Consulta encerrada", detalhe: "A chamada terminou. Toque em Sair para voltar ao início.", animar: false };
  }
  if (t.outroSaiu) {
    return { titulo: "O médico saiu da chamada", detalhe: "A sala continua aberta. Ele pode voltar em instantes.", animar: true };
  }
  if (t.status === "conectando-p2p" || t.outroOnline) {
    return { titulo: "Conectando com o médico…", detalhe: "Só um instante.", animar: true };
  }
  return {
    titulo: "O médico vai entrar em instantes",
    detalhe: "Fique nesta tela. A consulta começa aqui mesmo.",
    animar: true,
  };
}

/** Casca visual (separada para poder ser montada com dados de teste). */
export function TelaChamadaPaciente({
  sala,
  onEnd,
}: {
  sala: SalaConsulta;
  onEnd: () => void;
}) {
  const { tele } = sala;
  const conectado = tele.status === "conectado";
  const recarregarEstado = useRecarregarEstado();
  const tempo = useTempoDeChamada(conectado);
  const qtdCameras = useCamerasDisponiveis(tele.localPronto);
  const podeCompartilhar = usePodeCompartilharTela();
  const [mensagensAbertas, setMensagensAbertas] = useState(false);
  const [virando, setVirando] = useState(false);
  const [confirmarSair, setConfirmarSair] = useState(false);
  const [alertaFechado, setAlertaFechado] = useState<string | null>(null);

  // Mensagens novas do médico desde a última vez que a folha ficou aberta.
  const [lidasAte, setLidasAte] = useState(0);
  const recebidas = useMemo(() => tele.chat.filter((m) => !m.minha).length, [tele.chat]);
  const naoLidas = mensagensAbertas ? 0 : Math.max(0, recebidas - lidasAte);

  // Só áudio (câmera negada ou indisponível) ou sem mídia nenhuma.
  // semVideo/semAudio vêm do motor (track caiu ou a captura inicial falhou):
  // desde o M15 os botões NÃO desabilitam mais neste estado — eles viram a
  // ação de recaptura ("tentar de novo") do motor. As marcas seguem servindo
  // para esconder o vídeo local que não existe (VideoChamada916).
  const semCamera = tele.semVideo || (!!tele.erroMidia && !tele.streamLocalRef.current?.getVideoTracks().length);
  const semMic = tele.semAudio;
  const atalhos = useAtalhosChamada({
    onMic: sala.toggleMicLocal,
    onCam: sala.toggleCamLocal,
    podeOcultar: conectado && tele.remotoPronto && !mensagensAbertas && !tele.reconectando,
    ativo: !mensagensAbertas,
  });

  const abrirMensagens = () => {
    sala.setAba("chat");
    setLidasAte(recebidas);
    setMensagensAbertas(true);
  };
  const fecharMensagens = () => {
    setLidasAte(recebidas);
    setMensagensAbertas(false);
  };

  const virar = async () => {
    if (virando) return;
    setVirando(true);
    try {
      await tele.trocarCamera();
    } finally {
      setVirando(false);
    }
  };

  // Sala fora da janela (409): aviso no mesmo visual, com Voltar.
  if (sala.salaForaDaJanela) {
    return <ForaDaJanela916 textos={textoForaDaJanela(sala.salaForaDaJanela, Date.now())} onVoltar={onEnd} />;
  }

  const especialidade = sala.consultaAtual?.especialidade;
  const alerta = tele.erroMidia && alertaFechado !== tele.erroMidia ? tele.erroMidia : null;

  return (
    <VideoChamada916
      videoRemotoRef={sala.videoRemotoRef}
      videoLocalRef={sala.videoLocalRef}
      remotoPronto={tele.remotoPronto}
      camAtivo={tele.camAtivo}
      espelharLocal={!tele.cameraTraseira && !tele.compartilhando}
      semCameraLocal={semCamera}
      contraparteNome={sala.contraparteNome}
      contraparteDetalhe={`${especialidade ? `${especialidade} · ` : ""}${tipoDaConsulta(sala.consultaAtual) ?? "Teleconsulta"}`}
      iniciais={sala.iniciais(sala.contraparteNome)}
      tempo={tempo}
      conectado={conectado}
      qualidade={tele.qualidade}
      reconectando={tele.reconectando}
      espera={textoEspera(tele)}
      overlaysVisiveis={atalhos.visivel}
      handlers={atalhos.handlers}
      avisos={
        alerta || tele.compartilhando || tele.conexaoInstavel ? (
          <div className="flex flex-col items-start gap-2">
            {tele.conexaoInstavel ? (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-full bg-amber-500/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg"
              >
                <WifiOff className="size-3.5" aria-hidden /> Conexão instável — a sala não está respondendo. Tentando de novo…
              </p>
            ) : null}
            {tele.compartilhando ? (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg"
              >
                <MonitorUp className="size-3.5" aria-hidden /> Você está compartilhando a tela
              </p>
            ) : null}
            {alerta ? (
              <div className="relative w-full overflow-hidden rounded-2xl bg-bion-night/90 shadow-2xl backdrop-blur-md">
                <AlertaMidia mensagem={alerta} />
                <button
                  type="button"
                  onClick={() => setAlertaFechado(alerta)}
                  aria-label="Fechar aviso de câmera e microfone"
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-amber-100 hover:bg-white/10"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        ) : null
      }
      barra={
        <BarraChamada
          micAtivo={tele.micAtivo}
          camAtivo={tele.camAtivo}
          semCamera={semCamera}
          semMic={semMic}
          onMic={sala.toggleMicLocal}
          onCam={sala.toggleCamLocal}
          podeVirar={qtdCameras > 1 && tele.localPronto && !semCamera}
          onVirar={() => void virar()}
          virando={virando}
          onMensagens={abrirMensagens}
          naoLidas={naoLidas}
          mensagensAbertas={mensagensAbertas}
          onEncerrar={() => setConfirmarSair(true)}
          rotuloEncerrar="Sair"
          ariaEncerrar="Sair da chamada"
          encerrarAbreDialogo
          extras={
            podeCompartilhar ? (
              <BotaoChamada
                rotulo={tele.compartilhando ? "Parar" : "Tela"}
                aria={tele.compartilhando ? "Parar de compartilhar a tela" : "Compartilhar tela"}
                pressionado={tele.compartilhando}
                destaque={tele.compartilhando}
                onClick={() => void sala.toggleTela()}
              >
                {tele.compartilhando ? <MonitorX className="size-6" aria-hidden /> : <MonitorUp className="size-6" aria-hidden />}
              </BotaoChamada>
            ) : undefined
          }
          visivel={atalhos.visivel}
        />
      }
    >
      {/* Pedido de medidas do médico chega durante a chamada: faixa no topo do vídeo. */}
      {sala.consultaAtual?.id && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 px-4">
          <PedidosMedicao consultaId={sala.consultaAtual.id} variante="chamada" />
        </div>
      )}
      {/* Espera do médico (10 min): contagem e, se ele não entrar, cancelar ou remarcar. */}
      <EsperaMedicoPainel
        consultaId={sala.consultaAtual?.id}
        valorConsultaCentavos={valorConsultaCentavosDe(sala.consultaAtual?.valor)}
        medicoConectado={conectado && tele.remotoPronto}
        onSair={onEnd}
        onSairDaChamada={sala.sairDaSala}
        onResolvida={() => void recarregarEstado()}
      />
      {/* Arquivos anexados pela aba Exames da folha (mesmo fluxo de antes). */}
      <input
        aria-label="Anexar arquivo"
        ref={sala.fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          sala.enviarArquivo(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Sair pede confirmação (como o médico já tem modal de escolha): o toque
          acidental não derruba a chamada — o médico vê "Paciente saiu" e pode
          ficar esperando o retorno. */}
      <ModalBion aberto={confirmarSair} onFechar={() => setConfirmarSair(false)} titulo="Sair da chamada?">
        <p className="text-sm text-muted-foreground">
          O médico verá que você saiu da chamada e pode ficar esperando o seu retorno. A consulta continua
          aberta e você pode voltar enquanto ela durar.
        </p>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => setConfirmarSair(false)} className="px-4 py-3 rounded-2xl border text-sm font-bold flex-1 hover:bg-muted transition">
            Continuar na chamada
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmarSair(false);
              sala.sairDaSala();
            }}
            className="px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex-1 hover:opacity-90 transition"
          >
            Sair da chamada
          </button>
        </div>
      </ModalBion>
      <FolhaMensagens aberta={mensagensAbertas} onFechar={fecharMensagens}>
        <ConsultaPainelLateral
          role="paciente"
          aba={sala.aba}
          setAba={sala.setAba}
          anamneseAtual={sala.anamneseAtual}
          contraparteNome={sala.contraparteNome}
          sessaoNome={sala.sessao.nome}
          dadosPaciente={sala.dadosPaciente}
          anotacoes={sala.anotacoes}
          setAnotacoes={sala.setAnotacoes}
          arquivos={sala.arquivos}
          chatMsgs={tele.chat}
          chatInput={sala.chatInput}
          setChatInput={sala.setChatInput}
          enviarChat={sala.enviarChat}
          onAnexarExame={() => sala.fileRef.current?.click()}
          inserirModeloResumo={sala.inserirModeloResumo}
        />
      </FolhaMensagens>
    </VideoChamada916>
  );
}

/** Folha de baixo com o painel da consulta (abre na aba Chat). Esc ou arrastar o fundo fecha. */
function FolhaMensagens({
  aberta,
  onFechar,
  children,
}: {
  aberta: boolean;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={aberta} onOpenChange={(o) => !o && onFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] border border-b-0 border-white/10 bg-slate-900/95 text-white shadow-2xl outline-none pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom"
        >
          <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
            <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/25" />
            <DialogPrimitive.Title className="pt-2 text-sm font-semibold">Mensagens da consulta</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Fechar mensagens"
              className="mt-1 grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto [&>div]:!w-full [&>div]:!border-0 [&>div]:!bg-transparent">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Sala fora da janela: "A sala abre às HH:MM" / "A sala já fechou" + Voltar. */
function ForaDaJanela916({
  textos,
  onVoltar,
}: {
  textos: { titulo: string; detalhe: string };
  onVoltar: () => void;
}) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[radial-gradient(130%_70%_at_50%_15%,var(--bion-deep)_0%,var(--bion-ink)_55%,var(--bion-night)_100%)] p-6 text-white">
      <div role="status" aria-live="polite" className="flex max-w-xs flex-col items-center gap-5 text-center">
        <div className="grid size-20 place-items-center rounded-full border border-white/25 bg-white/10">
          <Clock className="size-8" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <p className="text-xl font-semibold">{textos.titulo}</p>
          <p className="text-sm leading-relaxed text-white/75">{textos.detalhe}</p>
        </div>
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        >
          <ArrowLeft className="size-4" aria-hidden /> Voltar
        </button>
      </div>
    </div>
  );
}
