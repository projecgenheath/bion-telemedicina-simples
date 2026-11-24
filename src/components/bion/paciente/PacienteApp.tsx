"use client";

import { AvisoAtivarToque } from "@/components/bion/AvisoAtivarToque";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FileText,
  HeartPulse,
  Pill,
  TrendingUp,
  RefreshCw,
  X,
  Undo2,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { fmtCurta, fmtHora, fmtTicketData, partesFusoClinica, type Consulta } from "@/lib/bion-tipos";
import { toast } from "sonner";
import { calcularImc, faixaImc, lerAlturaCm, lerPesoKg, ROTULO_FAIXA_IMC } from "@/lib/medidas-paciente";
import { MESES_AGENDA } from "./constantes";
import { acharMedicoDaConsulta } from "./agenda-medico";
import { CancelarRemarcarSheet, type AcaoSheet } from "./CancelarRemarcarSheet";
import { fmtCentavos, rotuloReembolso, usePreviaCancelamento } from "./usePreviaCancelamento";
import { desistirRemarcacao, iniciarRemarcacaoComMulta, useRecarregarEstado } from "./useRemarcacaoComMulta";
import { EtiquetaStatus, PedirReembolsoSheet } from "./PedirReembolsoSheet";
import { ExcluirContaSheet } from "./ExcluirContaSheet";
import { consultaTemReembolso } from "./reembolso-visivel";
import { GraficoLinha, type PontoGrafico } from "./GraficoLinha";
import { etiquetaConsulta } from "./etiqueta-consulta";
import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { ehRetornoGratis } from "./LinhaConsultaPagamento";
import { DetalheMedicao, type Detalhe } from "./DetalheMedicao";
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
import { TelaListaCompleta, type ListaPerfil } from "./TelaListaCompleta";
import { AvisoMensagemNova } from "./AvisosInicio";
import { acaoSalaPaciente, type AcaoSala } from "./entrada-sala";
import { useRelogioSala } from "./useRelogioSala";
import { salaAbertaEm } from "@/lib/janela-sala";
import { Esqueleto, EstadoVazio } from "./EstadosPaciente";
import { LaudosOriginais } from "./LaudosOriginais";
import { laudosDaIa } from "./laudos-originais";
import { PedidosMedicao } from "./PedidosMedicao";
import { MedicamentosEmUso } from "./MedicamentosEmUso";
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

/** Chave de comparação de nomes de analito: sem acento, sem caixa, espaços
 *  normalizados — a extração por IA não garante grafia idêntica entre coletas. */
const chaveAnalito = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

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
    setEmMensagens(true);
    irPara(2);
    // Dois quadros: na tela larga a gaveta só aparece depois do render.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const painelDir = painelDirRef.current;
        const alvo = painelDir?.querySelector<HTMLElement>('[aria-label="Mensagens com médicos"]');
        if (!painelDir || !alvo) return;
        const topo = alvo.getBoundingClientRect().top - painelDir.getBoundingClientRect().top + painelDir.scrollTop;
        painelDir.scrollTo({ top: Math.max(0, topo - 16), behavior: comportamentoScroll() });
      }),
    );
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

  // Deep links: /paciente?tela=perfil|documentos|mensagens|saude|exames|inicio|agendar
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
      if (bloqueado || e.altKey || e.ctrlKey || e.metaKey) return;
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
  }, [bloqueado, painel, secao, irPara, irSecao]);

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

  const examesAgrupados = useMemo(() => {
    const mapa = new Map<string, typeof exames>();
    for (const e of exames) {
      const lista = mapa.get(e.titulo) ?? [];
      lista.push(e);
      mapa.set(e.titulo, lista);
    }
    return [...mapa.entries()];
  }, [exames]);

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
        onInicio={irInicio}
        onMensagens={irMensagens}
        onSaude={() => irSecaoCentral(1)}
        onExames={() => irSecaoCentral(2)}
        onDocumentos={irDocumentos}
        onAgendar={() => abrirChat("agendar")}
        onPerfil={() => irPara(0)}
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
        inert={bloqueado}
        className={`bp-carrossel bpp-carrossel flex h-full overflow-x-auto ${bloqueado ? "pointer-events-none" : ""}`}
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

          {/* --- Seção 2: saúde --- */}
          <section className="bp-secao-2 bpp-secao bpp-tela px-5 py-8 pb-28" aria-label="Saúde: medicamentos, IMC e pressão arterial">
            <h2 className="text-2xl font-black mb-1 bpp-animar">Sua saúde</h2>
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mb-5">
              Toque em um card para ver o histórico e atualizar.
            </p>

            <div className="bion-surgir-lista bpp-grade flex flex-col gap-4">
              {/* Pedidos de medição do médico (só aparece se houver pendente) */}
              <PedidosMedicao />

              {/* Card único de medicamentos: cada remédio uma vez, com horários e lembrete na própria linha.
                  Lembretes de consulta não entram aqui. */}
              <MedicamentosEmUso onGerenciarLembretes={() => setDetalhe("lembretes")} />

              {/* IMC */}
              <button type="button"
                onClick={() => setDetalhe("imc")}
                className="bion-toque bp-glass p-5 w-full text-left bpp-animar"
                aria-label={`IMC: ${imcAtual ? `${imcAtual.toFixed(1)}, ${ROTULO_FAIXA_IMC[faixaImc(imcAtual)]}` : "sem dados"}. ${serieImc.length > 1 ? "Ver gráfico de evolução e atualizar peso e altura" : "Abrir histórico e atualizar peso e altura"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Activity className="w-4 h-4" /> IMC
                  </span>
                  {imcAtual && (
                    <span className="text-2xl font-black">{imcAtual.toFixed(1)}</span>
                  )}
                </div>
                {serieImc.length > 1 ? (
                  <GraficoLinha
                    ariaLabel="Evolução do IMC"
                    altura={110}
                    series={[{ pontos: serieImc, cor: "var(--bpp-grafico-linha)", area: true }]}
                    refMin={18.5}
                    refMax={24.9}
                  />
                ) : imcAtual ? (
                  <div className="py-2">
                    <p className="text-sm font-semibold">{ROTULO_FAIXA_IMC[faixaImc(imcAtual)]}</p>
                    <p className="text-sm opacity-80 mt-1">
                      {pesos.length === 0
                        ? // O número veio do perfil (peso/altura do cadastro),
                          // NÃO de uma medição datada — a origem é declarada
                          // em vez de pedir o registro que já existe no topo.
                          "Pelo peso e altura do seu perfil · atualize registrando uma medição para começar sua evolução."
                        : serieImc.length === 1
                          ? `Um registro, em ${serieImc[0].rotulo}. Mais um registro de peso e o gráfico de evolução aparece.`
                          : // Há peso, mas nenhum ponto válido (B18: sem altura
                            // registrada até a data do peso). O detalhe salva
                            // peso + altura como medições e cria o 1º ponto.
                            "Toque para atualizar peso e altura e começar seu gráfico de evolução."}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm opacity-80 py-4">
                    {pesos.length === 0
                      ? "Registre peso e altura para acompanhar seu IMC."
                      : "Registre sua altura para calcular seu IMC."}
                  </p>
                )}
                {imcAtual && (
                  <span className="text-xs font-semibold inline-flex items-center gap-1 opacity-80">
                    <TrendingUp className="w-3.5 h-3.5" /> Toque para atualizar peso e altura
                  </span>
                )}
              </button>

              {/* Pressão arterial */}
              <button type="button"
                onClick={() => setDetalhe("pa")}
                className="bion-toque bp-glass p-5 w-full text-left bpp-animar"
                aria-label={`Pressão arterial: ${pas.at(-1) ? `${pas.at(-1)!.valor1}/${pas.at(-1)!.valor2 ?? "—"}, última medição em ${rotuloCurto(pas.at(-1)!.criadoEm)}` : "sem dados"}. Abrir histórico e registrar`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <HeartPulse className="w-4 h-4" /> Pressão arterial
                  </span>
                  {pas.at(-1) && (
                    <span className="text-2xl font-black">
                      {pas.at(-1)!.valor1}
                      <span className="text-base opacity-80">/{pas.at(-1)!.valor2 ?? "—"}</span>
                    </span>
                  )}
                </div>
                {pas.length > 1 ? (
                  <GraficoLinha
                    ariaLabel="Evolução da pressão arterial"
                    altura={110}
                    series={[
                      { pontos: pas.map((p) => ({ valor: p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bpp-grafico-linha)", area: true },
                      ...(pas.some((p) => p.valor2 !== undefined)
                        ? // M18: sem valor2 o ponto é omitido (null) — antes a
                          // diastólica era plotada igual à sistólica.
                          [{ pontos: pas.map((p) => ({ valor: p.valor2 ?? null, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bpp-grafico-alerta)" }]
                        : []),
                    ]}
                    refMin={70}
                    refMax={120}
                  />
                ) : (
                  <p className="text-sm opacity-80 py-4">
                    {pas.length === 0
                      ? "Registre sua primeira medição."
                      : `Última medição em ${rotuloCurto(pas[0].criadoEm)}. Mais uma medição e a evolução aparece aqui.`}
                  </p>
                )}
              </button>
            </div>
          </section>

          {/* --- Seção 3: exames laboratoriais --- */}
          <section className="bp-secao-3 bpp-secao bpp-tela px-5 pt-10 pb-28 text-bion-ink dark:text-bion-paper" aria-label="Resultados de exames laboratoriais">
            <h2 className="text-2xl font-black mb-1">Exames laboratoriais</h2>
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mb-6">
              Resultados lidos dos laudos que você envia. Se a leitura falhar, o arquivo original continua aqui.
            </p>

            <button type="button"
              onClick={() => abrirChat("laudo")}
              className="bion-toque bp-glass w-full p-4 flex items-center gap-3 text-left mb-5"
              aria-label="Enviar novo laudo à BION IA"
            >
              <span className="w-11 h-11 rounded-2xl bg-bion-sea/10 text-bion-sea dark:bg-[#C4B5FD]/10 dark:text-[#C4B5FD] inline-flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold">Enviar novo laudo</span>
                <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75">PDF ou foto — a IA confere seu nome no documento</span>
              </span>
              <FileText className="w-5 h-5 text-bion-ink/75 dark:text-bion-paper/75 shrink-0" />
            </button>

            {examesAgrupados.length === 0 && laudosIa.length === 0 ? (
              <EstadoVazio
                superficie="vidro"
                icone={<FileText className="w-6 h-6" />}
                titulo="Nenhum resultado ainda"
                texto="Envie um laudo pela BION IA. Se a leitura falhar, o arquivo original aparece aqui."
              />
            ) : examesAgrupados.length > 0 ? (
              <div className="bion-surgir-lista bpp-grade flex flex-col gap-4">
                {examesAgrupados.map(([titulo, lista]) => {
                  const ultimo = lista.at(-1)!;
                  // M33: a ordem de `itens` vem da extração por IA e pode
                  // variar entre coletas — a série é de UM analito, casado
                  // pelo NOME: o primeiro da coleta mais recente que aparece
                  // em todas as coletas do grupo (se nenhum aparece em
                  // todas, o primeiro da coleta mais recente, usando só as
                  // coletas em que ele aparece). Antes era sempre itens[0],
                  // e o gráfico podia misturar analitos diferentes.
                  const itemDe = (e: (typeof lista)[number], chave: string) =>
                    e.itens.find((it) => chaveAnalito(it.nome) === chave);
                  const chaveSerie =
                    ultimo.itens.map((it) => chaveAnalito(it.nome)).find((c) => lista.every((e) => itemDe(e, c))) ??
                    (ultimo.itens[0] ? chaveAnalito(ultimo.itens[0].nome) : undefined);
                  const itemDestaque = chaveSerie ? itemDe(ultimo, chaveSerie) : undefined;
                  const serieItem: PontoGrafico[] = (
                    chaveSerie
                      ? lista.flatMap((e) => {
                          const it = itemDe(e, chaveSerie);
                          return it ? [{ valor: it.valor, rotulo: rotuloCurto(e.dataColeta) }] : [];
                        })
                      : []
                  ).slice(-10);
                  return (
                    <div key={titulo} className="bp-glass p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-bold text-sm">{titulo}</div>
                          <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">Última coleta: {rotuloCurto(ultimo.dataColeta)}</div>
                        </div>
                        {itemDestaque && (
                          <div className="text-right">
                            <div className="text-xl font-black leading-none">
                              {itemDestaque.valor}
                              <span className="text-xs font-semibold text-bion-ink/75 dark:text-bion-paper/75 ml-1">{itemDestaque.unidade}</span>
                            </div>
                            <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-0.5">{itemDestaque.nome}</div>
                          </div>
                        )}
                      </div>
                      {serieItem.length > 1 && (
                        <GraficoLinha
                          ariaLabel={`Histórico gráfico de ${titulo}${itemDestaque ? ` — ${itemDestaque.nome}` : ""}`}
                          altura={104}
                          corEixo="var(--bpp-grafico-eixo)"
                          series={[{ pontos: serieItem, cor: "var(--bpp-grafico-linha)", area: true }]}
                          refMin={itemDestaque?.refMin}
                          refMax={itemDestaque?.refMax}
                        />
                      )}
                      <details className="mt-2 group">
                        <summary className="text-xs font-semibold text-bion-ink/75 dark:text-bion-paper/75 cursor-pointer list-none inline-flex items-center gap-1">
                          <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition" />
                          {ultimo.itens.length} resultado(s) da última coleta
                        </summary>
                        <ul className="mt-3 space-y-1.5">
                          {ultimo.itens.map((i) => {
                            const fora =
                              (i.refMin !== undefined && i.valor < i.refMin) ||
                              (i.refMax !== undefined && i.valor > i.refMax);
                            return (
                              <li key={i.nome} className="flex items-center justify-between text-sm">
                                <span className="text-bion-ink/75 dark:text-bion-paper/75">{i.nome}</span>
                                <span className={`font-semibold ${fora ? "text-amber-700 dark:text-amber-300" : "text-bion-ink dark:text-bion-paper"}`}>
                                  {i.valor} {i.unidade}
                                  {fora && " ⚠"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <LaudosOriginais arquivos={laudosIa} exames={exames} />
          </section>
        </div>

        {/* ====================== PÁGINA 4: DOCUMENTOS ======================== */}
        <section ref={painelDirRef} className="bpp-lateral bpp-lateral-dir flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Documentos e mensagens">
          <DocumentosPainel conversaAtiva={conversaAtiva} onConversa={setConversaAtiva} onAgendar={() => abrirChat("agendar")} />
        </section>
      </div>

      {/* Tela larga: fundo e botão de fechar da gaveta (só aparecem com data-gaveta, ver paciente-v2.css) */}
      {painel !== 1 && !bloqueado ? (
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
        oculto={bloqueado}
        pilula={false}
      />
      {!bloqueado ? (
        <BarraInferiorPaciente
          ativo={destinoBarraPaciente(destinoAtivo)}
          onInicio={irInicio}
          onSaude={() => irSecaoCentral(1)}
          onAgendar={() => abrirChat("agendar")}
          agendarAberto={chatAberto}
          onExames={() => irSecaoCentral(2)}
          onDocumentos={irDocumentos}
          naoLidas={naoLidasMensagens}
        />
      ) : null}
      {dica.visivel && !bloqueado ? <DicaGestos onDispensar={dica.dispensar} /> : null}

      {/* Overlays */}
      <DetalheMedicao detalhe={detalhe} onFechar={() => setDetalhe(null)} />
      <ChatBion
        aberto={chatAberto}
        intencao={chatIntencao}
        onFechar={fecharChat}
        aoAbrirTriagem={(info) => {
          setChatAberto(false);
          setChatIntencao("geral");
          setTriagemSlide(info);
        }}
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
  // Sem pedido e fora do prazo: nada a fazer — o card some.
  if (!pedido && !prazoAberto) return null;
  // Retorno grátis (valor 0): não há o que reembolsar.
  if (!pedido && !consultaTemReembolso(consulta)) return null;

  return (
    <div className="bp-glass mt-3 w-full px-5 py-4" role="group" aria-label={`Falta na consulta de ${consulta.especialidade}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wider opacity-80">
            {pedido ? "Pedido de reembolso" : "Consulta não realizada"}
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
