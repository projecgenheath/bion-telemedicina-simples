"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChamadosSuporte } from "@/components/bion/ChamadosSuporte";
import { Ajuda } from "@/components/bion/Ajuda";
import { useDadosMedico } from "./useDadosMedico";
import { useConfirmarSalvamento } from "./sheets/useConfirmarSalvamento";
import { gradeDeCampos, serializarGrade } from "@/lib/grade-semana";
import { TelaInicio } from "./telas/TelaInicio";
import { TelaGestao } from "./telas/TelaGestao";
import { TelaPerfilPublico } from "./telas/TelaPerfilPublico";
import { PerfilMedicoPainel } from "./PerfilMedicoPainel";
import { PacientesPainel } from "./PacientesPainel";
import { ConversaPaciente } from "./ConversaPaciente";
import { NotificacoesMedico } from "./NotificacoesMedico";
import { TelaSobreposta } from "./TelaSobreposta";
import { RenovacoesPendentes } from "./evolucao/RenovacoesPendentes";
import { DicaGestos, IndicadorTelas, useDicaGestos } from "./IndicadorTelas";
import { PrecoSheet } from "./sheets/PrecoSheet";
import { PromocoesSheet } from "./sheets/PromocoesSheet";
import { AgendaSheet } from "./sheets/AgendaSheet";
import { AgendaPreviewSheet } from "./sheets/AgendaPreviewSheet";
import type { PacienteDoMedico } from "./metricas";
import type { NotifTipo } from "@/lib/bion-store";
import "./medico.css";

type Sheet = "preco" | "agenda" | "preview" | "promocoes" | null;
type Sobreposicao = { tipo: "renovacoes" } | { tipo: "suporte" } | { tipo: "termos" } | { tipo: "notificacoes" } | { tipo: "paciente"; p: PacienteDoMedico } | null;

const EM_CAMPO = ["INPUT", "TEXTAREA", "SELECT"];
/** Mesmo corte do medico.css: a partir daqui as 3 colunas ficam lado a lado. */
const TELA_LARGA = "(min-width: 1024px)";
const FOCAVEL = 'input, button, a[href], select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * App do MÉDICO (fase 1 — só front-end, dados existentes).
 * Carrossel horizontal: [Perfil] ← [Coluna central] → [Pacientes].
 * Coluna central com snap vertical: Início → Gestão → Perfil público.
 * Tela larga (≥ 1024 px, ver medico.css): as três colunas ficam lado a lado,
 * sem carrossel; a coluna central rola livre pelas três telas.
 */
export function MedicoApp() {
  const dados = useDadosMedico();
  const { medico, minhas } = dados;
  const carrosselRef = useRef<HTMLDivElement>(null);
  const colunaRef = useRef<HTMLDivElement>(null);
  const parametros = useSearchParams();
  // P3-3 (M-12): deep-link ?painel=perfil|pacientes — o menu do médico e as
  // páginas clássicas apontam para cá com o painel de destino. Vira o valor
  // INICIAL do estado (a montagem posiciona o carrossel; rolar depois é do
  // usuário) — sem setState dentro de efeito.
  const [painel, setPainel] = useState(() => {
    const alvo = parametros.get("painel");
    return alvo === "perfil" ? 0 : alvo === "pacientes" ? 2 : 1;
  });
  const painelInicialRef = useRef(painel);
  const painelRef = useRef(painel);
  painelRef.current = painel;
  // ?consulta= NÃO é consumido pelo app do médico: só a rota /consulta o
  // lê. Se o médico chegar aqui com esse parâmetro (link compartilhado),
  // mostramos um banner com ação explícita para abrir a sala, em vez de
  // fingir que o parâmetro faz algo ou de saltar sozinho para a chamada.
  const consultaLink = parametros.get("consulta");
  const [consultaIgnorada, setConsultaIgnorada] = useState(false);
  const mostrarBannerConsulta = !!consultaLink && !consultaIgnorada;
  const ignorarConsultaLink = () => {
    setConsultaIgnorada(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("consulta");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  };
  const [secao, setSecao] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [aberturas, setAberturas] = useState(0);
  const [sobreposicao, setSobreposicao] = useState<Sobreposicao>(null);
  const dica = useDicaGestos();

  // Confirmações vivem aqui (sempre montado), não nos sheets que desmontam.
  const confirmarValor = useConfirmarSalvamento(medico?.valor ?? 0, (a, b) => Math.abs(a - b) < 0.005);
  const confirmarPromocao = useConfirmarSalvamento(medico?.valor ?? 0, (a, b) => Math.abs(a - b) < 0.005);
  // A chave da grade é a serialização canônica (padrão + dias próprios):
  // a confirmação só chega quando o delta do servidor traz a grade nova.
  const confirmarHorarios = useConfirmarSalvamento(
    medico ? serializarGrade(gradeDeCampos(medico.horariosDisponiveis, medico.horariosPorDia)) : "",
    (a, b) => a === b,
  );
  const confirmarBio = useConfirmarSalvamento(medico?.bio ?? "", (a, b) => a === b);

  const bloqueado = sheet !== null || sobreposicao !== null;

  const irPara = useCallback((p: number) => {
    // O painel é estado em qualquer largura: na tela larga o indicador de
    // telas (aria-current) e a URL sincronizada abaixo dependem dele, e
    // só o foco/scroll muda com a largura.
    setPainel(p);
    const el = carrosselRef.current;
    if (!el) return;
    // Tela larga: as colunas já estão todas visíveis — só leva o foco ao
    // primeiro controle da coluna (ex.: a busca de pacientes).
    if (window.matchMedia(TELA_LARGA).matches) {
      el.children[p]?.querySelector<HTMLElement>(FOCAVEL)?.focus();
      return;
    }
    el.scrollTo({ left: p * el.clientWidth, behavior: "smooth" });
  }, []);

  const irSecao = useCallback((i: number) => {
    const col = colunaRef.current;
    const alvo = col?.children[i] as HTMLElement | undefined;
    if (col && alvo) col.scrollTo({ top: alvo.offsetTop, behavior: "smooth" });
  }, []);

  // Começa no painel do deep-link (ou no central, como o app do paciente):
  // posiciona o carrossel no PRIMEIRO frame; o estado `painel` já nasce no
  // destino (P3-3), então aqui é só efeito colateral no DOM (scroll).
  useEffect(() => {
    const el = carrosselRef.current;
    if (!el) return;
    const alvo = painelInicialRef.current;
    const posicionar = () => el.scrollTo({ left: alvo * el.clientWidth, behavior: "instant" as ScrollBehavior });
    posicionar();
    const raf = requestAnimationFrame(posicionar);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Ao cruzar 1024 px (girar o tablet, redimensionar a janela) o painel
  // NÃO é mais forçado para o central: antes, um deep-link ?painel=
  // pacientes/perfil era perdido no primeiro redimensionamento. Agora o
  // painel é preservado; ao voltar para a tela estreita, o carrossel só é
  // reposicionado no painel atual (e na tela larga as colunas já estão
  // todas visíveis, então não há scroll a fazer).
  useEffect(() => {
    const mq = window.matchMedia(TELA_LARGA);
    const aoMudar = () => {
      const el = carrosselRef.current;
      if (el && !mq.matches) el.scrollTo({ left: painelRef.current * el.clientWidth, behavior: "instant" as ScrollBehavior });
    };
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  // Sincroniza o painel de volta para a URL (?painel=perfil|pacientes;
  // o central não tem parâmetro, como na leitura inicial). Usa
  // replaceState para não empilhar histórico a cada scroll, preserva os
  // demais parâmetros (?consulta=, etc.) e pula a primeira renderização,
  // que já nasceu do deep-link — escrever o mesmo valor ali só faria
  // barulho na URL.
  const primeiroPainelRef = useRef(true);
  useEffect(() => {
    if (primeiroPainelRef.current) {
      primeiroPainelRef.current = false;
      return;
    }
    const url = new URL(window.location.href);
    const nome = painel === 0 ? "perfil" : painel === 2 ? "pacientes" : null;
    if (nome) url.searchParams.set("painel", nome);
    else url.searchParams.delete("painel");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [painel]);

  const aoRolarCarrossel = () => {
    const el = carrosselRef.current;
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== painel) {
      setPainel(idx);
      dica.dispensar();
    }
  };

  const aoRolarColuna = () => {
    const col = colunaRef.current;
    if (!col) return;
    const meio = col.scrollTop + col.clientHeight / 2;
    let idx = 0;
    Array.from(col.children).forEach((c, i) => {
      if ((c as HTMLElement).offsetTop <= meio) idx = i;
    });
    if (idx !== secao) {
      setSecao(idx);
      dica.dispensar();
    }
  };

  // Teclado: ←/→ trocam de página; PageUp/PageDown (e ↑/↓ fora de campos
  // roláveis) trocam de seção. Nada disso com sheet/sobreposição aberta.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (bloqueado || e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (EM_CAMPO.includes(alvo.tagName) || alvo.isContentEditable)) return;
      if (e.key === "ArrowRight") irPara(Math.min(2, painel + 1));
      else if (e.key === "ArrowLeft") irPara(Math.max(0, painel - 1));
      else if (painel === 1) {
        const foraDaColuna = !alvo || !colunaRef.current?.contains(alvo);
        const desce = e.key === "PageDown" || (foraDaColuna && e.key === "ArrowDown");
        const sobe = e.key === "PageUp" || (foraDaColuna && e.key === "ArrowUp");
        if (desce || sobe) {
          e.preventDefault();
          irSecao(desce ? Math.min(2, secao + 1) : Math.max(0, secao - 1));
        }
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [bloqueado, painel, secao, irPara, irSecao]);

  // Item 12: destino interno de cada tipo de notificação (a Notificacao não
  // carrega o id da entidade — abre a área onde ela se resolve).
  const navegarNotificacao = useCallback(
    (tipo: NotifTipo) => {
      if (tipo === "mensagem") {
        setSobreposicao(null);
        irPara(2);
      } else if (tipo === "receita") {
        setSobreposicao({ tipo: "renovacoes" });
      } else if (tipo === "suporte") {
        setSobreposicao({ tipo: "suporte" });
      } else {
        setSobreposicao(null);
        irPara(1);
      }
    },
    [irPara],
  );

  const abrirSheet = (s: Exclude<Sheet, null>) => {
    setAberturas((n) => n + 1);
    setSheet(s);
  };
  const fecharSheet = () => setSheet(null);
  const fecharSobreposicao = useCallback(() => setSobreposicao(null), []);

  const painelCls = "flex-[0_0_100%] w-full min-w-full h-full";

  return (
    <div className="bp-shell bm-app flex flex-col text-bion-ink dark:text-bion-paper">
      {mostrarBannerConsulta ? (
        <div className="mx-4 mt-3 rounded-2xl border bg-card p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Você chegou com uma consulta em link — quer abrir a sala dela?</span>
          <span className="flex gap-2">
            <a
              href={`/consulta?consulta=${encodeURIComponent(consultaLink as string)}`}
              className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold"
            >
              Abrir sala
            </a>
            <button type="button" onClick={ignorarConsultaLink} className="px-3 py-1.5 rounded-full border text-xs font-bold">
              Ignorar
            </button>
          </span>
        </div>
      ) : null}
      <div
        ref={carrosselRef}
        onScroll={aoRolarCarrossel}
        inert={bloqueado}
        className={`bp-carrossel bm-carrossel flex flex-1 min-h-0 overflow-x-auto ${bloqueado ? "pointer-events-none" : ""}`}
        aria-label="Áreas do app do médico"
      >
        <div className={`${painelCls} bm-lateral-esq`} aria-label="Meu perfil" role="region">
          <PerfilMedicoPainel
            dados={dados}
            onAbrirSuporte={() => setSobreposicao({ tipo: "suporte" })}
            onAbrirTermos={() => setSobreposicao({ tipo: "termos" })}
            onAbrirRenovacoes={() => setSobreposicao({ tipo: "renovacoes" })}
          />
        </div>

        <div
          ref={colunaRef}
          onScroll={aoRolarColuna}
          className={`${painelCls} overflow-y-auto bp-coluna bm-snap-y bm-centro`}
          aria-label="Início"
          role="region"
        >
          <TelaInicio
            dados={dados}
            onAbrirPerfil={() => irPara(0)}
            onAbrirPacientes={() => irPara(2)}
            onAbrirRenovacoes={() => setSobreposicao({ tipo: "renovacoes" })}
            onAbrirNotificacoes={() => setSobreposicao({ tipo: "notificacoes" })}
          />
          <TelaGestao dados={dados} onAbrirPreco={() => abrirSheet("preco")} onAbrirAgenda={() => abrirSheet("agenda")} onAbrirPromocoes={() => abrirSheet("promocoes")} />
          <TelaPerfilPublico dados={dados} onAgendar={() => abrirSheet("preview")} confirmarBio={confirmarBio} />
        </div>

        <div className={`${painelCls} bm-lateral-dir`} aria-label="Pacientes" role="region">
          <PacientesPainel dados={dados} onAbrirPaciente={(p) => setSobreposicao({ tipo: "paciente", p })} />
        </div>
      </div>

      <IndicadorTelas painel={painel} secao={secao} onPainel={irPara} onSecao={irSecao} oculto={bloqueado} />
      {dica.visivel && !bloqueado ? <DicaGestos onDispensar={dica.dispensar} /> : null}

      {medico ? (
        <>
          <PrecoSheet
            key={`preco-${aberturas}`}
            aberto={sheet === "preco"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarValor}
          />
          <PromocoesSheet
            key={`promocoes-${aberturas}`}
            aberto={sheet === "promocoes"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarPromocao}
          />
          <AgendaSheet
            key={`agenda-${aberturas}`}
            aberto={sheet === "agenda"}
            onFechar={fecharSheet}
            medico={medico}
            confirmar={confirmarHorarios}
          />
          <AgendaPreviewSheet
            key={`preview-${aberturas}`}
            aberto={sheet === "preview"}
            onFechar={fecharSheet}
            medico={medico}
            consultas={minhas}
          />
        </>
      ) : null}

      {sobreposicao?.tipo === "paciente" ? (
        <ConversaPaciente paciente={sobreposicao.p} dados={dados} onFechar={fecharSobreposicao} />
      ) : null}
      {sobreposicao?.tipo === "notificacoes" ? (
        <TelaSobreposta titulo="Notificações" subtitulo="Novidades das suas consultas, mensagens e avaliações" onFechar={fecharSobreposicao}>
          <NotificacoesMedico onNavegar={navegarNotificacao} />
        </TelaSobreposta>
      ) : null}
      {sobreposicao?.tipo === "renovacoes" ? (
        <TelaSobreposta titulo="Renovações de receita" subtitulo="Pedidos pendentes dos seus pacientes" onFechar={fecharSobreposicao}>
          <RenovacoesPendentes />
        </TelaSobreposta>
      ) : null}
      {sobreposicao?.tipo === "suporte" ? (
        <TelaSobreposta titulo="Suporte" subtitulo="Chamados com a equipe BION" onFechar={fecharSobreposicao}>
          <div className="p-4">
            <ChamadosSuporte />
          </div>
        </TelaSobreposta>
      ) : null}
      {sobreposicao?.tipo === "termos" ? (
        <TelaSobreposta titulo="Termos e ajuda" onFechar={fecharSobreposicao}>
          <div className="p-4 space-y-4">
            <div className="bp-glass p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">Termos de uso do médico</div>
                <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">Texto específico para profissionais.</div>
              </div>
              <button type="button" onClick={() => window.open("/termos-medico", "_blank", "noopener,noreferrer")} className="text-xs font-bold text-bion-sea dark:text-sky-300">Ler termos</button>
            </div>
            <Ajuda perfil="medico" />
          </div>
        </TelaSobreposta>
      ) : null}
    </div>
  );
}
