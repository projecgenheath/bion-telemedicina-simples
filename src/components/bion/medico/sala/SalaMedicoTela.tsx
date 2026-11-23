"use client";

/* ==================================================================== */
/* Sala de vídeo do MÉDICO (etapa 4, ref. 03) — só apresentação.         */
/* Recebe o MESMO objeto `sala` (useSalaConsulta) e as MESMAS ações que  */
/* a SalaConsultaTela: conexão, mídia, permissões, chat da sala (gravado */
/* com a consulta) e travas continuam no hook e no ChamadaMedico. Os     */
/* <video> mantêm refs e atributos; microfone, câmera, tela, anexo,      */
/* atalhos M/C/S e o input de arquivo chamam as mesmas funções. A sala   */
/* do paciente segue na SalaConsultaTela, sem mudança.                   */
/* ==================================================================== */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowLeft,
  Award,
  CameraOff,
  Clock,
  Ellipsis,
  FileText,
  Hourglass,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  Phone,
  Pill,
  Shield,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";
import { textoForaDaJanela } from "@/lib/teleconsulta-logica";
import { AlertaMidia } from "@/components/bion/consulta/AlertaMidia";
import { ConsultaPainelLateral } from "@/components/bion/consulta/PainelLateral";
import { ModalBion } from "@/components/bion/ModalBion";
import type { SalaConsulta } from "@/components/bion/consulta/useSalaConsulta";
import { poppins } from "../inicio/fonte-medico";
import "./sala-medico.css";

const nada = () => {};

export function SalaMedicoTela({
  sala,
  onEnd,
  onEncerrar,
  onReceita = nada,
  onAtestado = nada,
  onExame = nada,
  children,
}: {
  sala: SalaConsulta;
  onEnd: () => void;
  onEncerrar: () => void;
  onReceita?: () => void;
  onAtestado?: () => void;
  onExame?: () => void;
  children?: ReactNode;
}) {
  const { tele, salaForaDaJanela } = sala;
  const painelRef = useRef<HTMLDivElement>(null);
  const abrirChat = () => {
    sala.setAba("chat");
    // Celular: o painel fica abaixo do vídeo — leva o médico até ele.
    painelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`bms ${poppins.variable}`} data-status={tele.status}>
      <main className="bms-palco-coluna">
        {salaForaDaJanela ? (
          <AvisoForaDaJanelaMedico textos={textoForaDaJanela(salaForaDaJanela, Date.now())} onVoltar={onEnd} />
        ) : (
          <div className="bms-palco">
            <AreaVideoMedico
              videoRemotoRef={sala.videoRemotoRef}
              videoLocalRef={sala.videoLocalRef}
              remotoPronto={tele.remotoPronto}
              camAtivo={tele.camAtivo}
              erroMidia={tele.erroMidia}
              compartilhando={tele.compartilhando}
              contraparteNome={sala.contraparteNome}
              iniciais={sala.iniciais}
              statusSala={tele.status}
              outroOnline={tele.outroOnline}
              outroSaiu={tele.outroSaiu}
              qualidade={tele.qualidade}
              reconectando={tele.reconectando}
            />
            <div className="bms-rodape">
              <InfoChamada
                nome={sala.contraparteNome}
                detalhe={sala.contraparteDetalhe}
                iniciais={sala.iniciais}
                tempo={sala.tempo}
                restante={sala.restanteSlot}
                statusSala={tele.status}
              />
              <ControlesMedico
                micAtivo={tele.micAtivo}
                camAtivo={tele.camAtivo}
                semMic={tele.semAudio}
                semCamera={tele.semVideo}
                compartilhando={tele.compartilhando}
                onToggleMic={sala.toggleMicLocal}
                onToggleCam={sala.toggleCamLocal}
                onToggleTela={sala.toggleTela}
                onAnexar={() => sala.fileRef.current?.click()}
                onReceita={onReceita}
                onAtestado={onAtestado}
                onExame={onExame}
                onEncerrar={onEncerrar}
                onChat={abrirChat}
                fileRef={sala.fileRef}
                onArquivos={sala.enviarArquivo}
              />
            </div>
          </div>
        )}
        {tele.erroMidia ? (
          <div className="bms-alerta">
            <AlertaMidia mensagem={tele.erroMidia} />
          </div>
        ) : null}
      </main>

      <div ref={painelRef} className="bms-painel">
        <ConsultaPainelLateral
          role="medico"
          aba={sala.aba}
          setAba={sala.setAba}
          anamneseAtual={sala.anamneseAtual}
          contraparteNome={sala.contraparteNome}
          sessaoNome={sala.sessao.nome}
          dadosPaciente={sala.dadosPaciente}
          resumoClinico={sala.resumoClinico}
          motivoConsulta={sala.consultaAtual?.motivoConsulta}
          anotacoes={sala.anotacoes}
          setAnotacoes={sala.setAnotacoes}
          resumoStatus={sala.resumoStatus}
          onTentarSalvarResumo={sala.tentarSalvarResumoDeNovo}
          arquivos={sala.arquivos}
          chatMsgs={tele.chat}
          chatInput={sala.chatInput}
          setChatInput={sala.setChatInput}
          enviarChat={sala.enviarChat}
          onAnexarExame={() => sala.fileRef.current?.click()}
          inserirModeloResumo={sala.inserirModeloResumo}
        />
      </div>

      {children}

      {/* O1 (mesmo modal da SalaConsultaTela): inserir o modelo de evolução
          com anotações já escritas pede confirmação — a substituição é
          autossalva, então seria definitiva. */}
      <ModalBion
        aberto={sala.confirmarModeloResumo}
        onFechar={sala.cancelarInsercaoModeloResumo}
        titulo="Substituir suas anotações pelo modelo de evolução?"
        largura="max-w-md"
        overlay="bg-black/70 backdrop-blur-sm"
        foraFecha={false}
      >
        <div className="bg-card text-foreground border rounded-3xl w-full p-6 shadow-2xl">
          <h3 className="text-base font-bold">Inserir o modelo apaga o texto atual</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Você já escreveu o resumo desta consulta. Se inserir o modelo de evolução, o texto atual
            é substituído por ele — e a substituição também é salva automaticamente.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={sala.cancelarInsercaoModeloResumo}
              className="px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex-1 hover:opacity-90 transition"
            >
              Manter minhas anotações
            </button>
            <button
              type="button"
              onClick={sala.confirmarInsercaoModeloResumo}
              className="px-4 py-3 rounded-2xl border text-sm font-bold flex-1 hover:bg-muted transition"
            >
              Substituir pelo modelo
            </button>
          </div>
        </div>
      </ModalBion>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vídeo: mesmos <video> (refs e atributos) da ConsultaAreaVideo.      */
/* ------------------------------------------------------------------ */
function AreaVideoMedico({
  videoRemotoRef,
  videoLocalRef,
  remotoPronto,
  camAtivo,
  erroMidia,
  compartilhando,
  contraparteNome,
  iniciais,
  statusSala,
  outroOnline,
  outroSaiu = false,
  qualidade = "boa",
  reconectando = false,
}: {
  videoRemotoRef: RefObject<HTMLVideoElement | null>;
  videoLocalRef: RefObject<HTMLVideoElement | null>;
  remotoPronto: boolean;
  camAtivo: boolean;
  erroMidia: string | null | undefined;
  compartilhando: boolean;
  contraparteNome: string;
  iniciais: (nome: string) => string;
  statusSala: string;
  outroOnline: boolean;
  outroSaiu?: boolean;
  qualidade?: "boa" | "fraca" | "ruim";
  reconectando?: boolean;
}) {
  const avisoRede =
    statusSala === "encerrada"
      ? null
      : reconectando
        ? "Reconectando… a chamada volta sozinha em instantes."
        : qualidade === "ruim"
          ? "Conexão muito instável: o vídeo pode travar. Se puder, aproxime-se do Wi-Fi."
          : qualidade === "fraca"
            ? "Conexão fraca: a imagem pode perder qualidade."
            : null;
  const estado =
    statusSala === "encerrada"
      ? "Chamada encerrada"
      : outroSaiu
        ? "Paciente saiu da chamada. A sala continua aberta para a volta."
        : statusSala === "conectando-p2p"
          ? "Negociando conexão segura…"
          : outroOnline
            ? "Na sala — conectando mídia…"
            : "Aguardando o outro participante entrar na sala";
  return (
    <div className="bms-video">
      <video
        ref={videoRemotoRef}
        autoPlay
        playsInline
        aria-label={`Vídeo de ${contraparteNome}`}
        className={`bms-video-remoto ${remotoPronto ? "" : "hidden"}`}
      />

      {!remotoPronto && (
        <div className="bms-espera">
          <div className="bms-espera-avatar">{iniciais(contraparteNome)}</div>
          <div className="bms-espera-nome">{contraparteNome}</div>
          <div className="bms-espera-estado">
            <span aria-hidden className={`bms-ponto ${outroOnline ? "bms-ponto-on" : ""}`} />
            {estado}
          </div>
        </div>
      )}

      <div className="bms-topo">
        <StatusSala statusSala={statusSala} />
        {avisoRede ? (
          <div role="status" aria-live="polite" className={`bms-aviso-rede ${reconectando || qualidade === "ruim" ? "bms-aviso-grave" : ""}`}>
            <WifiOff aria-hidden />
            <span>{avisoRede}</span>
          </div>
        ) : null}
      </div>

      <div className="bms-pip">
        <video
          ref={videoLocalRef}
          autoPlay
          muted
          playsInline
          aria-label="Sua câmera"
          className={`w-full h-full object-cover mirror ${camAtivo ? "" : "hidden"}`}
        />
        {(!camAtivo || erroMidia) && (
          <div className="bms-pip-off">
            <CameraOff aria-hidden />
            <span>{erroMidia ? "Somente áudio/escuta" : "Câmera desligada"}</span>
          </div>
        )}
        <span className="bms-pip-rotulo">{compartilhando ? "Tela compartilhada" : "Você"}</span>
      </div>
    </div>
  );
}

function StatusSala({ statusSala }: { statusSala: string }) {
  const texto =
    statusSala === "conectado"
      ? "Conectado"
      : statusSala === "instavel"
        ? "Reconectando…"
        : statusSala === "conectando-p2p"
          ? "Negociando mídia…"
          : statusSala === "encerrada"
            ? "Chamada encerrada"
            : "Sala aberta";
  return (
    <div className="bms-status" title="Criptografia ponta a ponta (DTLS-SRTP)">
      <Shield aria-hidden />
      <span>{texto}</span>
      <span className="sr-only">. Criptografia ponta a ponta (DTLS-SRTP)</span>
    </div>
  );
}

/* Pílula de baixo (ref. 03): paciente, "Consulta", ponto vermelho e cronômetro. */
function InfoChamada({
  nome,
  detalhe,
  iniciais,
  tempo,
  restante,
  statusSala,
}: {
  nome: string;
  detalhe: string;
  iniciais: (nome: string) => string;
  tempo: string;
  restante: SalaConsulta["restanteSlot"];
  statusSala: string;
}) {
  return (
    <div className="bms-info">
      <span aria-hidden className="bms-info-avatar">
        {iniciais(nome)}
      </span>
      <span className="bms-info-texto">
        <span className="bms-info-nome">{nome}</span>
        <span className="bms-info-detalhe">{detalhe || "Consulta"}</span>
      </span>
      <span className="bms-info-tempos">
        {restante ? (
          <span title="Tempo até o fim do horário agendado" className={`bms-info-restante ${restante.estourou ? "bms-info-estourou" : ""}`}>
            <Hourglass aria-hidden /> {restante.rotulo}
          </span>
        ) : null}
        <span className="bms-info-tempo" aria-label={`Tempo de chamada ${tempo}`}>
          <span aria-hidden className={`bms-info-rec ${statusSala === "conectado" ? "bms-info-rec-on" : ""}`} />
          <Clock aria-hidden className="bms-info-relogio" />
          {tempo}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controles: mesmas funções, atalhos (M/C/S) e input de arquivo da    */
/* ConsultaControlesMidia; só a aparência e o botão de chat são novos. */
/* ------------------------------------------------------------------ */
function ControlesMedico({
  micAtivo,
  camAtivo,
  compartilhando,
  semMic = false,
  semCamera = false,
  semTela = false,
  onToggleMic,
  onToggleCam,
  onToggleTela,
  onAnexar,
  onReceita,
  onAtestado,
  onExame,
  onEncerrar,
  onChat,
  fileRef,
  onArquivos,
}: {
  micAtivo: boolean;
  camAtivo: boolean;
  compartilhando: boolean;
  semMic?: boolean;
  semCamera?: boolean;
  semTela?: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleTela: () => void;
  onAnexar: () => void;
  onReceita: () => void;
  onAtestado: () => void;
  onExame: () => void;
  onEncerrar: () => void;
  onChat: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onArquivos: (files: FileList | null) => void;
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const emCampoEditavel = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (emCampoEditavel(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "m" && !semMic) {
        e.preventDefault();
        onToggleMic();
      } else if (k === "c" && !semCamera) {
        e.preventDefault();
        onToggleCam();
      } else if (k === "s" && !semTela) {
        e.preventDefault();
        onToggleTela();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleMic, onToggleCam, onToggleTela, semMic, semCamera, semTela]);

  // Menu "Mais" (celular): fecha com Escape ou clique fora.
  useEffect(() => {
    if (!maisAberto) return;
    const fora = (e: PointerEvent) => {
      if (!maisRef.current?.contains(e.target as Node)) setMaisAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaisAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [maisAberto]);

  const rotuloMic = semMic ? "Microfone indisponível" : micAtivo ? "Silenciar microfone" : "Ativar microfone";
  const rotuloCam = semCamera ? "Câmera indisponível" : camAtivo ? "Desativar câmera" : "Ativar câmera";
  const rotuloTela = semTela ? "Compartilhamento de tela indisponível" : "Compartilhar tela";
  const fechar = (f: () => void) => () => {
    setMaisAberto(false);
    f();
  };

  return (
    <div className="bms-controles-area">
      <div className="bms-controles" role="toolbar" aria-label="Controles da chamada">
        <button type="button" onClick={onChat} className="bms-redondo" title="Chat da sala" aria-label="Abrir o chat da sala">
          <MessageCircle aria-hidden />
        </button>

        {/* Computador: tela e anexo à mostra. Celular: dentro de "Mais". */}
        <button
          type="button"
          onClick={onToggleTela}
          disabled={semTela}
          className={`bms-redondo bms-so-largo ${compartilhando ? "bms-ativo" : ""}`}
          title={rotuloTela}
          aria-label={rotuloTela}
        >
          <MonitorUp aria-hidden />
        </button>
        <button type="button" onClick={onAnexar} className="bms-redondo bms-so-largo" title="Enviar exame ou arquivo" aria-label="Enviar exame ou arquivo">
          <Paperclip aria-hidden />
        </button>
        <div ref={maisRef} className="bms-mais bms-so-estreito">
          <button
            type="button"
            onClick={() => setMaisAberto((v) => !v)}
            className="bms-redondo"
            aria-expanded={maisAberto}
            aria-haspopup="menu"
            title="Mais ações"
            aria-label="Mais ações: tela, arquivo e documentos"
          >
            <Ellipsis aria-hidden />
          </button>
          {maisAberto ? (
            <div className="bms-mais-menu" role="menu" aria-label="Mais ações">
              <button type="button" role="menuitem" onClick={fechar(onToggleTela)} disabled={semTela}>
                <MonitorUp aria-hidden /> {compartilhando ? "Parar de compartilhar a tela" : rotuloTela}
              </button>
              <button type="button" role="menuitem" onClick={fechar(onAnexar)}>
                <Paperclip aria-hidden /> Enviar exame ou arquivo
              </button>
              <button type="button" role="menuitem" onClick={fechar(onReceita)}>
                <Pill aria-hidden /> Prescrever receita
              </button>
              <button type="button" role="menuitem" onClick={fechar(onAtestado)}>
                <Award aria-hidden /> Emitir atestado
              </button>
              <button type="button" role="menuitem" onClick={fechar(onExame)}>
                <FileText aria-hidden /> Solicitar exame
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleMic}
          disabled={semMic}
          className={`bms-redondo ${micAtivo || semMic ? "" : "bms-desligado"}`}
          title={rotuloMic}
          aria-label={rotuloMic}
          aria-pressed={!micAtivo}
        >
          {micAtivo ? <Mic aria-hidden /> : <MicOff aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onToggleCam}
          disabled={semCamera}
          className={`bms-redondo ${camAtivo || semCamera ? "" : "bms-desligado"}`}
          title={rotuloCam}
          aria-label={rotuloCam}
          aria-pressed={!camAtivo}
        >
          {camAtivo ? <Video aria-hidden /> : <VideoOff aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onEncerrar}
          aria-haspopup="dialog"
          className="bms-redondo bms-encerrar"
          title="Encerrar atendimento"
          aria-label="Encerrar atendimento"
        >
          <Phone aria-hidden className="bms-fone-desligar" />
        </button>

        <input
          aria-label="Anexar arquivo"
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onArquivos(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Documentos à mostra no computador (no celular ficam em "Mais"). */}
      <div className="bms-documentos bms-so-largo" role="group" aria-label="Documentos da consulta">
        <button type="button" onClick={onReceita}>
          <Pill aria-hidden /> Prescrever receita
        </button>
        <button type="button" onClick={onAtestado}>
          <Award aria-hidden /> Emitir atestado
        </button>
        <button type="button" onClick={onExame}>
          <FileText aria-hidden /> Solicitar exame
        </button>
      </div>
      <p className="bms-atalhos bms-so-largo">
        Atalhos: <kbd>M</kbd> microfone · <kbd>C</kbd> câmera · <kbd>S</kbd> tela
      </p>
    </div>
  );
}

/** Sala fora da janela (mesmos textos da SalaConsultaTela): "A sala abre às HH:MM" / "já fechou" + Voltar. */
function AvisoForaDaJanelaMedico({ textos, onVoltar }: { textos: { titulo: string; detalhe: string }; onVoltar: () => void }) {
  return (
    <div role="status" aria-live="polite" className="bms-palco bms-fora">
      <div className="bms-fora-conteudo">
        <div className="bms-espera-avatar">
          <Clock aria-hidden />
        </div>
        <div>
          <div className="bms-espera-nome">{textos.titulo}</div>
          <p className="bms-espera-estado">{textos.detalhe}</p>
        </div>
        <button type="button" onClick={onVoltar} className="bms-fora-voltar">
          <ArrowLeft aria-hidden /> Voltar
        </button>
      </div>
    </div>
  );
}
