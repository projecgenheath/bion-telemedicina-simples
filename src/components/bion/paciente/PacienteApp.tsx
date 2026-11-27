"use client";

import { AvisoAtivarToque } from "@/components/bion/AvisoAtivarToque";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  FileText,
  Pill,
  RefreshCw,
  X,
  Undo2,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { fmtCurta, fmtHora, fmtTicketData, partesFusoClinica, type Consulta } from "@/lib/bion-tipos";
import { toast } from "sonner";
import { calcularImc, lerAlturaCm, lerPesoKg } from "@/lib/medidas-paciente";
import { MESES_AGENDA } from "./constantes";
import { acharMedicoDaConsulta } from "./agenda-medico";
import { CancelarRemarcarSheet, type AcaoSheet } from "./CancelarRemarcarSheet";
import { fmtCentavos, rotuloReembolso, usePreviaCancelamento } from "./usePreviaCancelamento";
import { desistirRemarcacao, iniciarRemarcacaoComMulta, useRecarregarEstado } from "./useRemarcacaoComMulta";
import { EtiquetaStatus, PedirReembolsoSheet } from "./PedirReembolsoSheet";
import { ExcluirContaSheet } from "./ExcluirContaSheet";
import { consultaTemReembolso } from "./reembolso-visivel";
import {
  MODELO_PAGAMENTO_RETIDO,
  prazoReembolsoFaltaPaciente,
  reembolsoAutomaticoNoPrazo,
  textoFaltaPacienteAutomatica,
} from "@/lib/pagamento-paciente";
import type { PontoGrafico } from "./GraficoLinha";
import { etiquetaConsulta } from "./etiqueta-consulta";
import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { ehRetornoGratis } from "./LinhaConsultaPagamento";
import { DetalheMedicao, type Detalhe } from "./DetalheMedicao";
import { TelaSaudePaciente } from "./etapa3/TelaSaudePaciente";
import { TelaExamesPaciente } from "./etapa3/TelaExamesPaciente";
import dynamic from "next/dynamic";
import "./paciente.css";
import "./paciente-v2.css";
import { poppinsPaciente } from "./inicio/fonte-paciente";
import { TelaInicioPaciente } from "./inicio/TelaInicioPaciente";
import { BarraLateralPaciente } from "./inicio/BarraLateralPaciente";
import { BarraInferiorPaciente } from "./inicio/BarraInferiorPaciente";
import { destinoAtivoPaciente, destinoBarraPaciente } from "./inicio/destino";

const ChatBion = dynamic(
  () => import("./ChatBion").then((m) => m.ChatBion),
  { ssr: false, loading: () => null },
);
const TriagemSlides = dynamic(
  () => import("./TriagemSlides").then((m) => m.TriagemSlides),
  { ssr: false, loading: () => null },
);
import { PerfilPainel } from "./PerfilPainel";
import { DocumentosPainel } from "./DocumentosPainel";
import { fraseMotivoReagendamento, rotuloMotivoReagendamento } from "./motivo-reagendamento";
import { DicaGestos, NavegacaoPaciente, useDicaGestos } from "./NavegacaoPaciente";
import { DadosPessoaisSheet, type CampoPerfil } from "./DadosPessoaisSheet";
import { TELA_CONSULTAS_PACIENTE } from "./destino-status-pagamento";
import { TelaListaCompleta, type ListaPerfil } from "./TelaListaCompleta";
import { TelaAgendaPaciente, type InicioAgenda } from "./consultas/TelaAgendaPaciente";
import { AvisoMensagemNova } from "./AvisosInicio";
import { acaoSalaPaciente, type AcaoSala } from "./entrada-sala";
import { useRelogioSala } from "./useRelogioSala";
import { salaAbertaEm } from "@/lib/janela-sala";
import { Esqueleto } from "./EstadosPaciente";
import { laudosDaIa } from "./laudos-originais";
import type { IntencaoChat } from "./chat-bion-intencao";

/**
 * App imersivo do paciente — fullscreen, sem menu e sem botões de navegação.
 *
 *   ┌─────────┬───────────────────────┬───────────┐
 *   │ Perfil  │  Seção 1 (início)     │  Página 4 │
 *   │  (←)    │  Seção 2 (rolagem ↓)  │  (→)      │
 *   │         │  Seção 3 (rolagem ↓)  │           │
 *   └─────────┴───────────────────────┴───────────┘
 *
 * Gestos: arrastar para a DIREITA abre o Perfil; para a ESQUERDA volta ao
 * centro e, arrastando de novo, abre Documentos/Mensagens.
 */

// B19: dia/mês no fuso da clínica (America/Sao_Paulo), como o restante do
// app (partesFusoClinica) — não no fuso do dispositivo.
const rotuloCurto = (iso: string) => {
  const d = partesFusoClinica(iso);
  return `${String(d.dia).padStart(2, "0")}/${String(d.mes + 1).padStart(2, "0")}`;
};


const EM_CAMPO = ["INPUT", "TEXTAREA", "SELECT"];

function comportamentoScroll(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function ehTelaLarga(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
}

export function PacienteApp() {
  const router = useRouter();
  const {
    sessao,
    pacientePerfil,
    consultas,
    lembretes,
    anamneses,
    medicoes,
    exames,
    arquivos,
    sair,
    medicos,
    naoLidasMensagens,
    mensagens,
    marcarConversaLida,
    documentosVisiveis,
  } = useBion();

  const carrosselRef = useRef<HTMLDivElement>(null);
  const colunaRef = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState(1);
  const [secao, setSecao] = useState(0);
  const [detalhe, setDetalhe] = useState<Detalhe>(null);
  const [chatAberto, setChatAberto] = useState(false);
  // Intenção da abertura do chat: "laudo" quando o paciente toca em
  // "Enviar novo laudo" (o chat entra direto no envio); "geral" nas
  // demais aberturas. Volta a "geral" a cada fechamento.
  const [chatIntencao, setChatIntencao] = useState<IntencaoChat>("geral");
  const abrirChat = (intencao: IntencaoChat) => {
    setChatIntencao(intencao);
    setChatAberto(true);
  };
  const fecharChat = () => {
    setChatAberto(false);
    setChatIntencao("geral");
  };
  // Etapa 2, rodada 2: agenda própria do paciente ("+" da barra e "Agendar"
  // do menu). O menu e a barra continuam à vista; o resto fica inerte.
  const [agenda, setAgenda] = useState<InicioAgenda | null>(null);
  /**
   * Troca de sobreposição (agenda ⇄ chat, agenda/chat → triagem): quem fecha
   * consome a própria entrada do histórico (useVoltarFecha → history.back);
   * a próxima só abre depois desse "voltar", senão ele a fecharia junto.
   */
  const trocarSobreposicao = (fechar: () => void, abrir: () => void) => {
    const prof = window.history.state?.bmProfundidade;
    fechar();
    if (typeof prof !== "number" || prof <= 0) {
      abrir();
      return;
    }
    let feito = false;
    const seguir = () => {
      if (feito) return;
      feito = true;
      window.removeEventListener("popstate", seguir);
      abrir();
    };
    window.addEventListener("popstate", seguir);
    window.setTimeout(seguir, 400);
  };
  const abrirAgenda = (inicio?: InicioAgenda | null) => {
    if (!chatAberto) {
      setAgenda(inicio ?? {});
      return;
    }
    trocarSobreposicao(
      () => {
        setChatAberto(false);
        setChatIntencao("geral");
      },
      () => setAgenda(inicio ?? {}),
    );
  };
  /** Itens do menu/barra fecham a agenda antes de navegar. */
  const semAgenda = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    setAgenda(null);
    fn(...a);
  };
  const [triagemConsultaId, setTriagemConsultaId] = useState<string | null>(null);
  const [triagemSlide, setTriagemSlide] = useState<{
    consultaId: string;
    medico: string;
    especialidade: string;
    quando: string;
  } | null>(null);
  const [modalConsulta, setModalConsulta] = useState<{ id: string; acao: AcaoSheet } | null>(null);
  const [reembolsoConsultaId, setReembolsoConsultaId] = useState<string | null>(null);
  // Fase 3: edição do perfil e "Ver tudo" abrem por cima de tudo (fora do carrossel).
  const [edicaoPerfil, setEdicaoPerfil] = useState<{ campo?: CampoPerfil } | null>(null);
  const [excluindoConta, setExcluindoConta] = useState(false);
  const [listaCompleta, setListaCompleta] = useState<ListaPerfil | null>(null);
  // Conversa aberta em Documentos (o aviso do Início abre direto nela).
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);
  // Redesign (etapa 1): em Documentos, o paciente está em Mensagens (veio
  // pelo menu de Mensagens ou abriu uma conversa) — decide o item ativo.
  const [emMensagens, setEmMensagens] = useState(false);
  const painelDirRef = useRef<HTMLElement>(null);
  const dica = useDicaGestos();

  const bloqueado = !!(
    chatAberto ||
    triagemSlide ||
    modalConsulta ||
    detalhe ||
    reembolsoConsultaId ||
    edicaoPerfil ||
    // B25: a folha de excluir conta também bloqueia o fundo (inert).
    excluindoConta ||
    listaCompleta
  );

  const irPara = useCallback((p: number) => {
    if (ehTelaLarga()) {
      setPainel(p);
      return;
    }
    const el = carrosselRef.current;
    if (!el) return;
    el.scrollTo({ left: p * el.clientWidth, behavior: comportamentoScroll() });
  }, []);

  const irSecao = useCallback((i: number) => {
    const col = colunaRef.current;
    const alvo = col?.children[i] as HTMLElement | undefined;
    if (col && alvo) {
      col.scrollTo({ top: alvo.offsetTop, behavior: comportamentoScroll() });
    }
    setSecao(i);
  }, []);

  /** Documentos com a lista de Mensagens à vista (as conversas moram no fim do painel). */
  const irMensagens = useCallback(() => {
    // Etapa 3: Documentos e Mensagens são abas da mesma tela (antes, uma rolagem até a seção).
    setEmMensagens(true);
    irPara(2);
    requestAnimationFrame(() => painelDirRef.current?.scrollTo({ top: 0, behavior: comportamentoScroll() }));
  }, [irPara]);

  const irDocumentos = useCallback(() => {
    setEmMensagens(false);
    irPara(2);
    requestAnimationFrame(() => painelDirRef.current?.scrollTo({ top: 0, behavior: comportamentoScroll() }));
  }, [irPara]);

  // A página inicial é a SEÇÃO 1 (painel central): posiciona o carrossel já na montagem
  useEffect(() => {
    const el = carrosselRef.current;
    if (!el) return;
    const posicionar = () => {
      if (ehTelaLarga()) return;
      el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
    };
    posicionar();
    const raf = requestAnimationFrame(posicionar);
    // Tela larga (≥ 1024 px): os 3 painéis ficam lado a lado, sem deslizar.
    // Ao voltar para a largura de celular, recoloca no Início.
    const largo = window.matchMedia("(min-width: 1024px)");
    const aoMudarLargura = () => {
      if (!largo.matches) requestAnimationFrame(posicionar);
    };
    largo.addEventListener("change", aoMudarLargura);
    return () => {
      cancelAnimationFrame(raf);
      largo.removeEventListener("change", aoMudarLargura);
    };
  }, []);

  // Deep links: /paciente?tela=perfil|documentos|mensagens|saude|exames|inicio|agendar|agenda|consultas
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tela = (params.get("tela") || "").toLowerCase();
    if (!tela) return;
    const aplicar = () => {
      if (tela === "perfil") irPara(0);
      else if (tela === "documentos") irPara(2);
      else if (tela === "mensagens") irMensagens();
      else if (tela === "agendar") {
        irPara(1);
        setChatIntencao("agendar");
        setChatAberto(true);
      } else if (tela === TELA_CONSULTAS_PACIENTE) {
        // Volta da tela de status do pagamento: abre a lista de consultas
        irPara(1);
        setListaCompleta("consultas");
      } else if (tela === "agenda") {
        irPara(1);
        setAgenda({});
      }
      else if (tela === "saude") {
        irPara(1);
        requestAnimationFrame(() => irSecao(1));
      } else if (tela === "exames") {
        irPara(1);
        requestAnimationFrame(() => irSecao(2));
      } else if (tela === "inicio") {
        irPara(1);
        requestAnimationFrame(() => irSecao(0));
      } else return;
      // Limpa o parâmetro para não reaplicar ao voltar
      const url = new URL(window.location.href);
      url.searchParams.delete("tela");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    };
    // Espera o carrossel posicionar no centro
    const t = window.setTimeout(aplicar, 50);
    return () => window.clearTimeout(t);
  }, [irPara, irSecao, irMensagens]);

  const aoRolar = () => {
    const el = carrosselRef.current;
    if (!el || !el.clientWidth || ehTelaLarga()) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== painel) {
      setPainel(idx);
      if (idx !== 2) setEmMensagens(false);
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
    // No fim da rolagem a última seção é a atual, mesmo curta (tela larga:
    // Exames não chega ao meio da janela e o menu acendia Saúde).
    if (col.scrollTop + col.clientHeight >= col.scrollHeight - 2) idx = col.children.length - 1;
    if (idx !== secao) {
      setSecao(idx);
      dica.dispensar();
    }
  };

  // Teclado: ←/→ trocam de painel; PageUp/PageDown (e ↑/↓ fora de campos) trocam de seção
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (bloqueado || agenda || e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      // Tela larga: Esc fecha a gaveta aberta (Perfil/Documentos).
      if (e.key === "Escape" && painel !== 1 && ehTelaLarga()) {
        irPara(1);
        return;
      }
      if (alvo && (EM_CAMPO.includes(alvo.tagName) || alvo.isContentEditable)) return;
      // Tela larga: ←/→ não abrem gavetas (o menu lateral faz isso).
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && ehTelaLarga()) return;
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
  }, [bloqueado, agenda, painel, secao, irPara, irSecao]);

  /* ------------------------------- dados --------------------------------- */

  // A13: consultas do paciente por pacienteId; o nome é só fallback para
  // registros legados sem ID — homônimos e grafias não escondem cards.
  const minhaConsulta = useCallback(
    (c: Consulta) =>
      sessao.id ? (c.pacienteId ? c.pacienteId === sessao.id : c.paciente === sessao.nome) : c.paciente === sessao.nome,
    [sessao],
  );

  const minhasConsultas = useMemo(() => consultas.filter(minhaConsulta), [consultas, minhaConsulta]);

  const proximas = useMemo(() => {
    const limite = Date.now() - 2 * 3_600_000;
    return consultas
      .filter((c) => minhaConsulta(c) && ["confirmada", "em_espera", "pendente_anamnese"].includes(c.status) && c.ts >= limite)
      .sort((a, b) => a.ts - b.ts);
  }, [consultas, minhaConsulta]);

  const proxima = proximas[0];

  /* Sala (sem pré-sala): a janela vem de lib/janela-sala.ts, a mesma do servidor.
     O relógio avança sozinho e acerta o instante em que a sala abre ou fecha. */
  const horariosProximas = useMemo(() => proximas.map((c) => c.ts), [proximas]);
  const agoraSala = useRelogioSala(horariosProximas);
  const acaoSala = (c: Consulta): AcaoSala => acaoSalaPaciente(c, agoraSala);

  /** Mensagem mais recente que o paciente ainda não leu (aviso no Início). */
  const ultimaNaoLida = useMemo(
    () => mensagens.filter((m) => !m.minha && !m.lida).sort((a, b) => b.ts - a.ts)[0],
    [mensagens],
  );
  // A3: o "+N" do aviso é da conversa daquele médico — o total global
  // (naoLidasMensagens) é só do selo da navegação/Documentos.
  const naoLidasDoRemetente = ultimaNaoLida
    ? mensagens.filter((m) => !m.minha && !m.lida && m.deId === ultimaNaoLida.deId).length
    : 0;
  const abrirConversa = (medicoId: string) => {
    setConversaAtiva(medicoId);
    marcarConversaLida(medicoId);
    irMensagens();
  };

  /** Médico cancelou, falha técnica ou o médico não compareceu: o paciente escolhe remarcar ou reembolso integral. */
  const aguardandoReagendamento = useMemo(
    () =>
      consultas
        .filter((c) => minhaConsulta(c) && c.status === "aguardando_reagendamento")
        .sort((a, b) => a.ts - b.ts),
    [consultas, minhaConsulta],
  );

  /** Remarcação com multa reservada (nova data aguardando pagamento; a data original segue valendo). */
  const comRemarcacaoPendente = useMemo(
    () =>
      consultas.filter(
        (c) =>
          minhaConsulta(c) &&
          c.remarcacaoPendente?.status === "pendente" &&
          new Date(c.remarcacaoPendente.expiraEm).getTime() > Date.now(),
      ),
    [consultas, minhaConsulta],
  );

  /** Canceladas e pagas dos últimos 60 dias: acompanham o status do reembolso (máx. 3). */
  /** Faltas pagas dos últimos 30 dias (máx. 3): pedido manual de reembolso em até 7 dias. */
  const faltasRecentes = useMemo(() => {
    const limite = Date.now() - 30 * 86_400_000;
    return consultas
      .filter((c) => minhaConsulta(c) && c.falta && c.pago && c.ts >= limite)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 3);
  }, [consultas, minhaConsulta]);
  const consultaReembolso = reembolsoConsultaId ? consultas.find((c) => c.id === reembolsoConsultaId) : undefined;

  const canceladasComPagamento = useMemo(() => {
    const limite = Date.now() - 60 * 86_400_000;
    return consultas
      .filter((c) => minhaConsulta(c) && c.status === "cancelada" && c.pago && consultaTemReembolso(c) && c.ts >= limite)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 3);
  }, [consultas, minhaConsulta]);

  const janelaTriagem = (c: { ts: number; pago?: boolean; status: string }) =>
    ["confirmada", "pendente_anamnese"].includes(c.status) &&
    c.pago !== false &&
    Date.now() < c.ts - 5 * 60_000;

  const statusTriagem = (consultaId: string) => {
    const a = anamneses.find((x) => x.consultaId === consultaId);
    if (a?.status === "concluida") return "feita" as const;
    if (a?.status === "em_andamento") return "andamento" as const;
    return "nao_iniciada" as const;
  };

  /** Uma etiqueta só, a mais relevante agora (ver etiqueta-consulta.ts). */
  const etiquetaDe = (c: Consulta) =>
    etiquetaConsulta({
      status: c.status,
      pago: c.pago,
      remarcacaoPendente: c.remarcacaoPendente,
      salaAberta: salaAbertaEm(c.ts, agoraSala),
      triagem: statusTriagem(c.id),
      triagemDisponivel: janelaTriagem(c),
    });

  const consultaModal = modalConsulta ? consultas.find((c) => c.id === modalConsulta.id) : undefined;
  const medicoModal = acharMedicoDaConsulta(consultaModal, medicos);

  const abrirTriagem = (consultaId: string) => {
    const c = consultas.find((x) => x.id === consultaId);
    if (!c) return;
    setTriagemConsultaId(consultaId);
    setChatAberto(false);
    setTriagemSlide({
      consultaId,
      medico: c.medico,
      especialidade: c.especialidade,
      quando: `${c.data} · ${c.hora}`,
    });
  };

  /** Entra na sala da consulta só com a sala aberta (fora da janela não há para onde ir). */
  const entrarSala = (c: Consulta) => {
    const acao = acaoSalaPaciente(c, Date.now());
    if (acao.tipo === "entrar") router.push(acao.href);
  };


  const alturas = useMemo(
    () => medicoes.filter((m) => m.tipo === "altura").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );
  const pesos = useMemo(
    () => medicoes.filter((m) => m.tipo === "peso").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );
  const pas = useMemo(
    () => medicoes.filter((m) => m.tipo === "pa").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [medicoes],
  );

  // M3: perfil lido de forma tolerante (legado "62 kg" / "1,68 m") em kg / cm.
  const alturaAtual = useMemo(
    () => alturas.at(-1)?.valor1 ?? lerAlturaCm(pacientePerfil?.altura) ?? undefined,
    [alturas, pacientePerfil?.altura],
  );
  const pesoAtual = pesos.at(-1)?.valor1 ?? lerPesoKg(pacientePerfil?.peso) ?? undefined;
  const imcAtual = calcularImc(pesoAtual, alturaAtual);

  const serieImc: PontoGrafico[] = useMemo(
    () =>
      pesos
        .map((p) => {
          // B18: só a altura registrada ATÉ a data do peso — sem altura da
          // época, o ponto é descartado; usar a altura atual recalculava o
          // passado com a altura de hoje.
          const alturaCm = alturas.filter((a) => a.criadoEm <= p.criadoEm).at(-1)?.valor1;
          if (!alturaCm) return null;
          return { valor: Math.round((p.valor1 / Math.pow(alturaCm / 100, 2)) * 10) / 10, rotulo: rotuloCurto(p.criadoEm) };
        })
        .filter((x): x is PontoGrafico => x !== null)
        .slice(-10),
    [pesos, alturas],
  );

  const laudosIa = useMemo(() => laudosDaIa(arquivos), [arquivos]);


  const saudacao = (() => {
    // Hora no fuso da clínica (partesFusoClinica), como o restante do app
    // (B19) — não no fuso do dispositivo. Tabela única de saudação:
    // 0–4 madrugada, 5–11 dia, 12–17 tarde, 18–23 noite.
    const h = partesFusoClinica(Date.now()).hora;
    if (h < 5) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  /* Arraste com mouse no desktop quebrava clique de botão ao trocar de painel. */

  // Item ativo do menu lateral e da barra de baixo = tela atual (a camada de cima manda).
  const destinoAtivo = destinoAtivoPaciente({
    painel,
    secao,
    chatAberto,
    agendaAberta: !!agenda,
    emMensagens: painel === 2 && (emMensagens || !!conversaAtiva),
  });
  const irInicio = () => {
    setEmMensagens(false);
    irPara(1);
    requestAnimationFrame(() => irSecao(0));
  };
  const irSecaoCentral = (i: number) => {
    setEmMensagens(false);
    irPara(1);
    requestAnimationFrame(() => irSecao(i));
  };

  return (
    <div
      className={`bp-shell bp-app-paciente bp2-app ${poppinsPaciente.variable} text-bion-ink dark:text-bion-paper`}
      data-gaveta={bloqueado ? undefined : painel === 0 ? "perfil" : painel === 2 ? "documentos" : undefined}
    >
      <BarraLateralPaciente
        ativo={destinoAtivo}
        onInicio={semAgenda(irInicio)}
        onMensagens={semAgenda(irMensagens)}
        onSaude={semAgenda(() => irSecaoCentral(1))}
        onExames={semAgenda(() => irSecaoCentral(2))}
        onDocumentos={semAgenda(irDocumentos)}
        onAgendar={() => abrirAgenda()}
        onPerfil={semAgenda(() => irPara(0))}
        onAjuda={() => router.push("/ajuda")}
        onTermos={() => router.push("/privacidade")}
        onSuporte={() => router.push("/suporte")}
        naoLidas={naoLidasMensagens}
      />
      <div
        ref={carrosselRef}
        role="main"
        tabIndex={0}
        onScroll={aoRolar}
        inert={bloqueado || !!agenda}
        className={`bp-carrossel bpp-carrossel flex h-full overflow-x-auto ${bloqueado || agenda ? "pointer-events-none" : ""}`}
        aria-label="Painéis do app: perfil, início e documentos (arraste para os lados)"
      >
        {/* ============================== PERFIL ============================== */}
        <section className="bpp-lateral bpp-lateral-esq flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Perfil">
          <PerfilPainel
            onSair={async () => {
              await sair();
              router.replace("/entrar");
            }}
            onEditar={(campo) => setEdicaoPerfil({ campo })}
            onVerTudo={setListaCompleta}
            onAgendar={() => abrirChat("agendar")}
            onExcluirConta={() => setExcluindoConta(true)}
          />
        </section>

        {/* ============================= PRINCIPAL ============================ */}
        <div
          ref={colunaRef}
          onScroll={aoRolarColuna}
          className="bpp-central bpp-snap-y flex-[0_0_100%] w-full min-w-full h-full overflow-y-auto bp-coluna"
          aria-label="Início, saúde e exames"
          role="region"
        >
          {/* --- Seção 1: início (redesign azul, etapa 1 — ver inicio/TelaInicioPaciente) --- */}
          <section className="bp-secao-1 bp2-inicio bp2-v2 bpp-tela relative min-h-[100svh] flex flex-col bp-safe-top" aria-labelledby="bp2-t1-titulo">
            <TelaInicioPaciente
              nome={sessao.nome}
              foto={pacientePerfil?.foto}
              saudacao={saudacao}
              agora={agoraSala}
              minhas={minhasConsultas}
              proximas={proximas}
              etiquetaDe={etiquetaDe}
              acaoSala={acaoSala}
              statusTriagem={statusTriagem}
              janelaTriagem={janelaTriagem}
              botaoPagar={(c) =>
                etiquetaDe(c).tom === "pagamento" && !c.remarcacaoPendente && !ehRetornoGratis(c) ? (
                  <BotaoPagarStripe consultaId={c.id} className="w-full mt-3 !rounded-[0.6rem]" />
                ) : null
              }
              documentos={documentosVisiveis.length}
              naoLidas={naoLidasMensagens}
              ultimaNaoLidaDe={ultimaNaoLida ? { medicoId: ultimaNaoLida.deId, nome: ultimaNaoLida.de } : null}
              naoLidasDoRemetente={naoLidasDoRemetente}
              aguardandoReagendamento={aguardandoReagendamento[0] ?? null}
              avisoMensagem={
                // Aviso de mensagem nova do médico (some quando a conversa é aberta)
                ultimaNaoLida ? (
                  <AvisoMensagemNova mensagem={ultimaNaoLida} total={naoLidasDoRemetente} onAbrir={() => abrirConversa(ultimaNaoLida.deId)} />
                ) : null
              }
              avisos={
                <>
                  <AvisoAtivarToque role={sessao.role} usuarioId={sessao.id} />
                  {/* Aguardando reagendamento (motivo no cartão) — remarcar ou reembolso integral, sem multa */}
                  {aguardandoReagendamento.map((c) => (
                    <CardAguardandoReagendamento
                      key={c.id}
                      consulta={c}
                      onRemarcar={() => setModalConsulta({ id: c.id, acao: "remarcar" })}
                      onReembolso={() => setModalConsulta({ id: c.id, acao: "reembolso" })}
                    />
                  ))}
                  {/* Nova data reservada aguardando a multa. A1: a próxima consulta não
                      ganha um segundo card — a etiqueta "Remarcação pendente" fica no destaque. */}
                  {comRemarcacaoPendente
                    .filter((c) => c.id !== proxima?.id)
                    .map((c) => (
                      <CardRemarcacaoPendente key={c.id} consulta={c} onContinuar={() => setModalConsulta({ id: c.id, acao: "remarcar" })} />
                    ))}
                  {/* Faltas: pedido manual de reembolso (prazo de 7 dias) e status do pedido */}
                  {faltasRecentes.map((c) => (
                    <CardFalta key={c.id} consulta={c} onAbrir={() => setReembolsoConsultaId(c.id)} />
                  ))}
                  {/* Status do reembolso das consultas canceladas */}
                  {canceladasComPagamento.map((c) => (
                    <CardReembolso key={c.id} consulta={c} />
                  ))}
                </>
              }
              onEntrar={entrarSala}
              onTriagem={abrirTriagem}
              onRemarcar={(id) => setModalConsulta({ id, acao: "remarcar" })}
              onCancelar={(id) => setModalConsulta({ id, acao: "cancelar" })}
              onAgendar={() => abrirChat("agendar")}
              onPerguntar={() => abrirChat("geral")}
              onMensagens={irMensagens}
              onAbrirConversa={abrirConversa}
              onDocumentos={irDocumentos}
              onPerfil={() => irPara(0)}
              onSaude={() => irSecao(1)}
              onVerHistorico={() => setListaCompleta("consultas")}
            />
          </section>

          {/* --- Seção 2: saúde (etapa 3: ficha de saúde no desenho do médico) --- */}
          <section className="bp-secao-2 bpp-secao bpp-tela bp2-secao-e3 px-5 py-8 pb-28" aria-label="Saúde: medicamentos, IMC e pressão arterial">
            <TelaSaudePaciente
              nome={pacientePerfil?.nome || sessao?.nome || "Paciente"}
              perfil={pacientePerfil}
              pesos={pesos}
              alturas={alturas}
              pas={pas}
              pesoAtual={pesoAtual}
              alturaAtual={alturaAtual}
              imcAtual={imcAtual}
              serieImc={serieImc}
              onDetalhe={setDetalhe}
            />
          </section>

          {/* --- Seção 3: exames laboratoriais (etapa 3) --- */}
          <section className="bp-secao-3 bpp-secao bpp-tela bp2-secao-e3 px-5 pt-10 pb-28" aria-label="Resultados de exames laboratoriais">
            <TelaExamesPaciente exames={exames} laudosIa={laudosIa} onEnviarLaudo={() => abrirChat("laudo")} />
          </section>
        </div>

        {/* ====================== PÁGINA 4: DOCUMENTOS ======================== */}
        <section ref={painelDirRef} className="bpp-lateral bpp-lateral-dir flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Documentos e mensagens">
          <DocumentosPainel
            conversaAtiva={conversaAtiva}
            onConversa={setConversaAtiva}
            onAgendar={() => abrirChat("agendar")}
            ativo={painel === 2}
            vista={emMensagens || conversaAtiva ? "mensagens" : "documentos"}
            onVista={(v) => {
              if (v === "documentos") {
                setConversaAtiva(null);
                irDocumentos();
              } else irMensagens();
            }}
            onFechar={irInicio}
          />
        </section>
      </div>

      {/* Tela larga: fundo e botão de fechar da gaveta (só aparecem com data-gaveta, ver paciente-v2.css) */}
      {painel !== 1 && !bloqueado && !agenda ? (
        <>
          <button type="button" tabIndex={-1} aria-hidden className="bp2-gaveta-fundo" onClick={() => irPara(1)} />
          <button
            type="button"
            onClick={() => irPara(1)}
            aria-label={painel === 0 ? "Fechar meu perfil" : "Fechar documentos e mensagens"}
            className="bp2-gaveta-fechar h-10 w-10 place-items-center rounded-full bg-white text-[#242424] shadow-md"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </>
      ) : null}

      {/* Pontinhos laterais das seções (celular); a pílula antiga deu lugar à barra de baixo. */}
      <NavegacaoPaciente
        painel={painel}
        secao={secao}
        onPainel={irPara}
        onSecao={irSecao}
        naoLidas={naoLidasMensagens}
        oculto={bloqueado || !!agenda}
        pilula={false}
      />
      {!bloqueado ? (
        <BarraInferiorPaciente
          ativo={destinoBarraPaciente(destinoAtivo)}
          onInicio={semAgenda(irInicio)}
          onSaude={semAgenda(() => irSecaoCentral(1))}
          onAgendar={() => abrirAgenda()}
          onExames={semAgenda(() => irSecaoCentral(2))}
          onDocumentos={semAgenda(irDocumentos)}
          naoLidas={naoLidasMensagens}
        />
      ) : null}
      {dica.visivel && !bloqueado && !agenda ? <DicaGestos onDispensar={dica.dispensar} /> : null}

      {/* Overlays */}
      <DetalheMedicao detalhe={detalhe} onFechar={() => setDetalhe(null)} />
      {agenda ? (
        <TelaAgendaPaciente
          inicial={agenda}
          onFechar={() => setAgenda(null)}
          onAbrirChat={() => trocarSobreposicao(() => setAgenda(null), () => abrirChat("agendar"))}
          onAgendado={(info) => trocarSobreposicao(() => setAgenda(null), () => setTriagemSlide(info))}
        />
      ) : null}
      <ChatBion
        aberto={chatAberto}
        intencao={chatIntencao}
        onFechar={fecharChat}
        onAbrirAgenda={(inicio) => abrirAgenda(inicio)}
        aoAbrirTriagem={(info) =>
          trocarSobreposicao(
            () => {
              setChatAberto(false);
              setChatIntencao("geral");
            },
            () => setTriagemSlide(info),
          )
        }
      />
      {triagemSlide ? (
        <TriagemSlides
          consultaId={triagemSlide.consultaId}
          medico={triagemSlide.medico}
          especialidade={triagemSlide.especialidade}
          quando={triagemSlide.quando}
          onFechar={() => {
            setTriagemSlide(null);
            setTriagemConsultaId(null);
          }}
        />
      ) : null}

      {modalConsulta && consultaModal ? (
        <CancelarRemarcarSheet
          key={`${modalConsulta.id}-${modalConsulta.acao}`}
          consulta={consultaModal}
          acao={modalConsulta.acao}
          medico={medicoModal}
          consultas={consultas}
          onFechar={() => setModalConsulta(null)}
          onPagarMulta={iniciarRemarcacaoComMulta}
        />
      ) : null}

      {edicaoPerfil ? (
        <DadosPessoaisSheet campoInicial={edicaoPerfil.campo} onFechar={() => setEdicaoPerfil(null)} />
      ) : null}

      {listaCompleta ? (
        <TelaListaCompleta
          lista={listaCompleta}
          consultas={{
            onRemarcar: (id) => setModalConsulta({ id, acao: "remarcar" }),
            onCancelar: (id) => setModalConsulta({ id, acao: "cancelar" }),
            onTriagem: abrirTriagem,
            onEntrar: entrarSala,
            etiquetaDe,
            janelaTriagem,
            statusTriagem,
            acaoSala,
          }}
          onFechar={() => setListaCompleta(null)}
          onAgendar={() => {
            setListaCompleta(null);
            setChatAberto(true);
          }}
        />
      ) : null}

      {consultaReembolso ? (
        <PedirReembolsoSheet
          key={consultaReembolso.id}
          consulta={consultaReembolso}
          onFechar={() => setReembolsoConsultaId(null)}
        />
      ) : null}

      {excluindoConta ? (
        <ExcluirContaSheet
          onFechar={() => setExcluindoConta(false)}
          onExcluida={async () => {
            // A sessão já foi encerrada no servidor; sair() só limpa o estado local.
            await sair().catch(() => {});
            router.replace("/entrar");
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cards da fase financeira                                            */
/* ------------------------------------------------------------------ */

function CardAguardandoReagendamento({
  consulta,
  onRemarcar,
  onReembolso,
}: {
  consulta: Consulta;
  onRemarcar: () => void;
  onReembolso: () => void;
}) {
  const comReembolso = consultaTemReembolso(consulta);
  return (
    <div className="bp-glass p-5 w-full mb-3 border border-amber-500/40" role="group" aria-label={`Consulta de ${consulta.especialidade}: ${rotuloMotivoReagendamento(consulta.motivoReagendamento)}. ${comReembolso ? "Escolha remarcar ou reembolso integral" : "Escolha um novo horário"}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">Ação necessária</span>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
          Aguardando reagendamento
        </span>
      </div>
      <div className="text-xl font-bold">{consulta.especialidade}</div>
      <div className="text-sm opacity-80">com {consulta.medico}</div>
      <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold opacity-80 line-through">
        <CalendarClock className="w-4 h-4" /> {consulta.data} · {consulta.hora}
      </div>
      <p className="text-sm mt-3 leading-relaxed">
        {fraseMotivoReagendamento(consulta.motivoReagendamento)}. {comReembolso ? "Escolha remarcar ou reembolso integral" : "Escolha um novo horário"}, <strong className="font-bold">sem multa</strong>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRemarcar}
          className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden /> Remarcar sem multa
        </button>
        {comReembolso ? (
          <button
            type="button"
            onClick={onReembolso}
            className="inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 text-xs font-bold bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
          >
            <Undo2 className="w-3.5 h-3.5" /> Reembolso integral
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CardReembolso({ consulta }: { consulta: Consulta }) {
  const { previa, carregando, erro, recarregar } = usePreviaCancelamento(consulta.id, consulta.status);
  const r = previa?.reembolso;
  if (!r) {
    // Enquanto a prévia carrega, um esqueleto ocupa o lugar do card (antes
    // ficava em branco e o card "pulava" na tela ao chegar).
    if (carregando && !erro) {
      return (
        <div className="bp-glass mt-3 w-full px-5 py-4" role="status" aria-live="polite">
          <span className="sr-only">Carregando o status do reembolso…</span>
          <Esqueleto className="h-3 w-1/3" />
          <Esqueleto className="h-4 w-2/3 mt-2" />
          <Esqueleto className="h-3 w-1/2 mt-3" />
        </div>
      );
    }
    // A2: se a busca da prévia falhar, o card NÃO some em silêncio — a
    // consulta cancelada e paga continua visível, com erro e "tentar de novo".
    if (erro) {
      return (
        <div className="bp-glass mt-3 w-full px-5 py-4" role="alert">
          <span className="block text-xs font-bold uppercase tracking-wider opacity-80">Consulta cancelada</span>
          <span className="block text-sm font-bold mt-0.5">
            {consulta.especialidade} · {consulta.data} {consulta.hora}
          </span>
          <p className="text-xs opacity-80 mt-2">Não foi possível carregar o status do reembolso desta consulta.</p>
          <button
            type="button"
            onClick={recarregar}
            className="bion-toque mt-2 inline-flex items-center min-h-11 px-4 rounded-full text-xs font-bold bg-bion-ink/8 dark:bg-white/10"
          >
            Tentar de novo
          </button>
        </div>
      );
    }
    return null;
  }
  // B37: com multa descontada, o rótulo diz "parcial", nunca "integral".
  const rotulo = rotuloReembolso(r.status, r.multaCentavos);
  const cor =
    rotulo.tom === "ok"
      ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
      : rotulo.tom === "erro"
        ? "bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300"
        : "bg-bion-sea/12 text-bion-sea dark:bg-[#C4B5FD]/15 dark:text-[#DDD6FE]";
  return (
    <div className="bp-glass mt-3 w-full px-5 py-4" aria-label={`Reembolso da consulta de ${consulta.especialidade}: ${rotulo.texto}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wider opacity-80">Consulta cancelada</span>
          <span className="block text-sm font-bold truncate">
            {consulta.especialidade} · {consulta.data} {consulta.hora}
          </span>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${cor}`}>{rotulo.texto}</span>
      </div>
      <p className="text-xs opacity-80 mt-2">
        Valor do reembolso: <strong className="font-bold">{fmtCentavos(r.valorCentavos)}</strong>
        {r.multaCentavos > 0 ? ` (multa de ${fmtCentavos(r.multaCentavos)} descontada)` : ""}
        {r.processadoEm ? ` · concluído em ${fmtTicketData(r.processadoEm)}` : ` · solicitado em ${fmtTicketData(r.criadoEm)}`}
      </p>
    </div>
  );
}

function CardRemarcacaoPendente({ consulta, onContinuar }: { consulta: Consulta; onContinuar: () => void }) {
  const recarregarEstado = useRecarregarEstado();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const r = consulta.remarcacaoPendente;
  if (!r) return null;
  const novaData = `${fmtCurta(r.novaData)} às ${fmtHora(r.novaData)}`;

  const desistir = async () => {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setEnviando(true);
    const res = await desistirRemarcacao(consulta.id);
    if (res.ok) {
      await recarregarEstado();
      toast.success(`Remarcação desfeita — a consulta continua em ${consulta.data} às ${consulta.hora}`);
    } else {
      toast.error(res.erro ?? "Não foi possível desistir da remarcação.");
    }
    setEnviando(false);
    setConfirmando(false);
  };

  return (
    <div className="bp-glass p-5 w-full mb-3 border border-bion-sea/40 dark:border-[#C4B5FD]/40" role="group" aria-label={`Remarcação de ${consulta.especialidade} aguardando pagamento da multa`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">Remarcação</span>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-bion-sea/12 text-bion-sea dark:bg-[#C4B5FD]/15 dark:text-[#DDD6FE]">
          Aguardando pagamento
        </span>
      </div>
      <div className="text-xl font-bold">{consulta.especialidade}</div>
      <div className="text-sm opacity-80">com {consulta.medico}</div>
      <p className="text-sm mt-3 leading-relaxed">
        Nova data <strong className="font-bold">{novaData}</strong> reservada, aguardando pagamento da multa de{" "}
        <strong className="font-bold">{fmtCentavos(r.multaCentavos)}</strong> até {fmtCurta(r.expiraEm)} às {fmtHora(r.expiraEm)}.
      </p>
      <p className="text-xs opacity-80 mt-1 inline-flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5" /> Vale a data original até o pagamento: {consulta.data} · {consulta.hora}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onContinuar}
          className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden /> Continuar pagamento
        </button>
        <button
          type="button"
          onClick={() => void desistir()}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 text-xs font-bold bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300 disabled:opacity-40"
        >
          <X className="w-3.5 h-3.5" /> {confirmando ? "Confirmar desistência" : "Desistir"}
        </button>
      </div>
    </div>
  );
}

function CardFalta({ consulta, onAbrir }: { consulta: Consulta; onAbrir: () => void }) {
  const pedido = consulta.reembolsoManual;
  const prazo = consulta.podePedirAte;
  const prazoAberto = !!prazo && Date.now() < new Date(prazo).getTime();
  // Modelo novo (21/11): falta do paciente tem reembolso automático, sem
  // pedido. A chave só liga depois do motor de pagamento do Admin.
  const automatico = MODELO_PAGAMENTO_RETIDO && !pedido && consultaTemReembolso(consulta);
  const prazoAutomatico = prazoReembolsoFaltaPaciente(consulta.ts);
  const automaticoNoPrazo = reembolsoAutomaticoNoPrazo(consulta.ts);
  // Sem pedido e fora do prazo: nada a fazer — o card some.
  if (!pedido && !automatico && !prazoAberto) return null;
  // Retorno grátis (valor 0): não há o que reembolsar.
  if (!pedido && !consultaTemReembolso(consulta)) return null;

  return (
    <div className="bp-glass mt-3 w-full px-5 py-4" role="group" aria-label={`Falta na consulta de ${consulta.especialidade}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wider opacity-80">
            {pedido ? "Pedido de reembolso" : automatico ? "Reembolso automático" : "Consulta não realizada"}
          </span>
          <span className="block text-sm font-bold truncate">
            {consulta.especialidade} · {consulta.data} {consulta.hora}
          </span>
        </div>
        {pedido ? <EtiquetaStatus status={pedido.status} claro /> : null}
      </div>
      {pedido ? (
        <>
          {pedido.status === "negado" && pedido.respostaAdmin ? (
            <p className="text-xs opacity-80 mt-2">
              <strong className="font-bold">Resposta da equipe:</strong> {pedido.respostaAdmin}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onAbrir}
            className="mt-3 inline-flex items-center gap-1 rounded-full px-3.5 min-h-11 text-xs font-bold bg-bion-ink/8 dark:bg-white/10"
          >
            <FileText className="w-3 h-3" /> Ver detalhes
          </button>
        </>
      ) : automatico ? (
        <p className="text-sm mt-2 leading-relaxed">
          {automaticoNoPrazo
            ? textoFaltaPacienteAutomatica(prazoAutomatico, (d) => fmtTicketData(d.toISOString()))
            : "O prazo do reembolso automático desta consulta terminou. A devolução integral segue para o seu cartão, sem pedido. Se ela não aparecer, fale com o suporte (Perfil → Suporte)."}
        </p>
      ) : (
        <>
          <p className="text-sm mt-2 leading-relaxed">
            Você não entrou na consulta de {consulta.data} às {consulta.hora}. Se teve um motivo, pode pedir reembolso até{" "}
            <strong className="font-bold">{fmtTicketData(prazo!)}</strong>.
          </p>
          <button
            type="button"
            onClick={onAbrir}
            className="bp-acao mt-3 w-full py-3 text-sm inline-flex items-center justify-center gap-2"
          >
            <Undo2 className="w-4 h-4" aria-hidden /> Pedir reembolso
          </button>
        </>
      )}
    </div>
  );
}
