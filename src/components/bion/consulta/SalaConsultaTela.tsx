"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, SearchX, ShieldAlert } from "lucide-react";
import { rotaInicioPorPapel, textoForaDaJanela } from "@/lib/teleconsulta-logica";
import type { ErroSala } from "@/lib/teleconsulta-chamada";
import { ConsultaBarraSuperior } from "@/components/bion/consulta/BarraSuperior";
import { ConsultaAreaVideo } from "@/components/bion/consulta/AreaVideo";
import { ConsultaControlesMidia } from "@/components/bion/consulta/ControlesMidia";
import { ConsultaPainelLateral } from "@/components/bion/consulta/PainelLateral";
import { ModalBion } from "@/components/bion/ModalBion";
import type { PapelSala, SalaConsulta } from "@/components/bion/consulta/useSalaConsulta";

const nada = () => {};

/**
 * Layout atual da sala (barra superior, vídeo + controles, painel lateral),
 * movido de Consulta.tsx sem mudança visual. Cada papel passa as suas ações
 * (o médico emite documentos e escolhe o desfecho) e os seus modais em `children`.
 */
export function SalaConsultaTela({
  sala,
  role,
  onEnd,
  onEncerrar,
  onReceita = nada,
  onAtestado = nada,
  onExame = nada,
  children,
}: {
  sala: SalaConsulta;
  role: PapelSala;
  onEnd: () => void;
  onEncerrar: () => void;
  onReceita?: () => void;
  onAtestado?: () => void;
  onExame?: () => void;
  children?: ReactNode;
}) {
  const { tele, salaForaDaJanela } = sala;
  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden bg-slate-950 flex flex-col text-white">
      <ConsultaBarraSuperior
        contraparteNome={sala.contraparteNome}
        contraparteDetalhe={sala.contraparteDetalhe}
        role={role}
        tempo={sala.tempo}
        statusSala={tele.status}
        iniciais={sala.iniciais}
      />

      {/* Área Principal: vídeo em cima + painel embaixo no celular; lado a lado no desktop */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Painel do Vídeo */}
        <div className="flex-1 flex flex-col p-3 lg:p-5 gap-4 min-w-0">
          {salaForaDaJanela ? (
            <AvisoForaDaJanela textos={textoForaDaJanela(salaForaDaJanela, Date.now())} onVoltar={onEnd} />
          ) : (
          <>
          <ConsultaAreaVideo
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
            role={role}
          />
          <ConsultaControlesMidia
            role={role}
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
            fileRef={sala.fileRef}
            onArquivos={sala.enviarArquivo}
          />
          </>
          )}
        </div>

        <ConsultaPainelLateral
          role={role}
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
      </div>

      {children}

      {/* O1: inserir o modelo de evolução com anotações já escritas pede
          confirmação explícita — o texto da sala só é gravado no
          "concluir", então substituir em silêncio era perda definitiva.
          Mesmo padrão do modal "sair sem concluir" (ChamadaMedico). */}
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
            Você já escreveu anotações nesta consulta e elas ainda não foram salvas — só são gravadas
            ao concluir. Se inserir o modelo de evolução, o texto atual é substituído por ele.
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

/** Sala fora da janela: "A sala abre às HH:MM" / "A sala já fechou" + Voltar (visual mínimo). */
function AvisoForaDaJanela({
  textos,
  onVoltar,
}: {
  textos: { titulo: string; detalhe: string };
  onVoltar: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="aspect-video lg:aspect-auto lg:flex-1 lg:min-h-[320px] w-full shrink-0 lg:shrink rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-white/10 flex items-center justify-center shadow-2xl p-6"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-16 h-16 rounded-3xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
          <Clock className="w-7 h-7 text-white" />
        </div>
        <div>
          <div className="text-lg font-bold">{textos.titulo}</div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">{textos.detalhe}</p>
        </div>
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>
    </div>
  );
}

/** Textos da recusa definitiva da sala (M16), por tipo de erro do motor. */
const TEXTOS_ERRO_SALA: Record<ErroSala, { titulo: string; detalhe: string }> = {
  sessao: {
    titulo: "Sua sessão expirou",
    detalhe: "A sala foi fechada porque o seu acesso venceu. Entre de novo no app para voltar à consulta.",
  },
  pagamento: {
    titulo: "Pagamento pendente",
    detalhe: "Esta consulta ainda não foi paga, por isso a sala não pode continuar. Volte ao início e conclua o pagamento para entrar.",
  },
  acesso: {
    titulo: "Acesso negado",
    detalhe: "A conta que está aberta não participa desta consulta. Confira se você entrou com a conta certa.",
  },
};

/**
 * GET /sala respondeu 401/402/403 (M16): o motor parou o polling
 * (`erroSala`) e a tela mostra a orientação — antes o paciente ficava em
 * "O médico vai entrar em instantes" para sempre, com a presença morta.
 */
export function ErroSalaFatal({ erro, onVoltar }: { erro: ErroSala; onVoltar: () => void }) {
  const textos = TEXTOS_ERRO_SALA[erro];
  return (
    <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-white p-6">
      <div role="alert" className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-16 h-16 rounded-3xl bg-destructive/20 border-2 border-destructive/40 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{textos.titulo}</h1>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">{textos.detalhe}</p>
        </div>
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao início
        </button>
      </div>
    </div>
  );
}

/**
 * GET /sala respondeu 404: a consulta não existe. O hook para o polling e a
 * câmera não é pedida; a tela leva de volta ao início de cada papel.
 */
export function ConsultaNaoEncontrada({ role }: { role: PapelSala }) {
  const router = useRouter();
  const destino = rotaInicioPorPapel(role);
  return (
    <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-white p-6">
      <div role="alert" className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-16 h-16 rounded-3xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
          <SearchX className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Consulta não encontrada</h1>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            O link pode estar errado ou a consulta não existe mais. Confira a sua agenda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.replace(destino)}
          data-destino={destino}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao início
        </button>
      </div>
    </div>
  );
}
