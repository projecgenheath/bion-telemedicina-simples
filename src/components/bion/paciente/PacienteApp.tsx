"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  HeartPulse,
  Pill,
  Search,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Video,
  RefreshCw,
  X,
  ChevronUp,
  Undo2,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { fmtCurta, fmtHora, fmtTicketData, type Consulta } from "@/lib/bion-tipos";
import { toast } from "sonner";
import { calcularImc, lerAlturaCm, lerPesoKg } from "@/lib/medidas-paciente";
import { MESES_AGENDA } from "./constantes";
import { acharMedicoDaConsulta } from "./agenda-medico";
import { CancelarRemarcarSheet, type AcaoSheet } from "./CancelarRemarcarSheet";
import { fmtCentavos, rotuloReembolso, usePreviaCancelamento } from "./usePreviaCancelamento";
import { desistirRemarcacao, iniciarRemarcacaoComMulta, useRecarregarEstado } from "./useRemarcacaoComMulta";
import { EtiquetaStatus, PedirReembolsoSheet } from "./PedirReembolsoSheet";
import { GraficoLinha, type PontoGrafico } from "./GraficoLinha";
import { CLASSE_ETIQUETA, etiquetaConsulta, type EtiquetaConsulta } from "./etiqueta-consulta";
import { DetalheMedicao, type Detalhe } from "./DetalheMedicao";
import dynamic from "next/dynamic";
import "./paciente.css";

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

const rotuloCurto = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function PacienteApp() {
  const router = useRouter();
  const { sessao, pacientePerfil, consultas, anamneses, lembretes, medicoes, exames, sair, medicos } = useBion();

  const carrosselRef = useRef<HTMLDivElement>(null);
  const [painel, setPainel] = useState(1);
  const [detalhe, setDetalhe] = useState<Detalhe>(null);
  const [chatAberto, setChatAberto] = useState(false);
  const [triagemConsultaId, setTriagemConsultaId] = useState<string | null>(null);
  const [triagemSlide, setTriagemSlide] = useState<{
    consultaId: string;
    medico: string;
    especialidade: string;
    quando: string;
  } | null>(null);
  const [listaConsultasAberta, setListaConsultasAberta] = useState(false);
  const [modalConsulta, setModalConsulta] = useState<{ id: string; acao: AcaoSheet } | null>(null);
  const [reembolsoConsultaId, setReembolsoConsultaId] = useState<string | null>(null);
  const arrastandoRef = useRef(false);
  const inicioArrasteX = useRef(0);
  const inicioArrasteScroll = useRef(0);
  const moveuArrasteRef = useRef(false);

  const irPara = useCallback((p: number) => {
    const el = carrosselRef.current;
    if (!el) return;
    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: p * el.clientWidth, behavior: menosMovimento ? "auto" : "smooth" });
  }, []);

  // A página inicial é a SEÇÃO 1 (painel central): posiciona o carrossel já na montagem
  useEffect(() => {
    const el = carrosselRef.current;
    if (!el) return;
    const posicionar = () => el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
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

  const aoRolar = () => {
    const el = carrosselRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== painel) setPainel(idx);
  };

  // Teclado (desktop): setas navegam entre os painéis quando não há foco em texto
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (detalhe || chatAberto) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return;
      if (e.key === "ArrowRight") irPara(Math.min(2, painel + 1));
      if (e.key === "ArrowLeft") irPara(Math.max(0, painel - 1));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [painel, detalhe, chatAberto, irPara]);

  /* ------------------------------- dados --------------------------------- */

  const proximas = useMemo(() => {
    const limite = Date.now() - 2 * 3_600_000;
    return consultas
      .filter((c) => c.paciente === sessao.nome && ["confirmada", "em_espera", "pendente_anamnese"].includes(c.status) && c.ts >= limite)
      .sort((a, b) => a.ts - b.ts);
  }, [consultas, sessao.nome]);

  const proxima = proximas[0];

  /** Médico cancelou, falha técnica ou o médico não compareceu: o paciente escolhe remarcar ou reembolso integral. */
  const aguardandoReagendamento = useMemo(
    () =>
      consultas
        .filter((c) => c.paciente === sessao.nome && c.status === "aguardando_reagendamento")
        .sort((a, b) => a.ts - b.ts),
    [consultas, sessao.nome],
  );

  /** Remarcação com multa reservada (nova data aguardando pagamento; a data original segue valendo). */
  const comRemarcacaoPendente = useMemo(
    () =>
      consultas.filter(
        (c) =>
          c.paciente === sessao.nome &&
          c.remarcacaoPendente?.status === "pendente" &&
          new Date(c.remarcacaoPendente.expiraEm).getTime() > Date.now(),
      ),
    [consultas, sessao.nome],
  );

  /** Canceladas e pagas dos últimos 60 dias: acompanham o status do reembolso (máx. 3). */
  /** Faltas pagas dos últimos 30 dias (máx. 3): pedido manual de reembolso em até 7 dias. */
  const faltasRecentes = useMemo(() => {
    const limite = Date.now() - 30 * 86_400_000;
    return consultas
      .filter((c) => c.paciente === sessao.nome && c.falta && c.pago && c.ts >= limite)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 3);
  }, [consultas, sessao.nome]);
  const consultaReembolso = reembolsoConsultaId ? consultas.find((c) => c.id === reembolsoConsultaId) : undefined;

  const canceladasComPagamento = useMemo(() => {
    const limite = Date.now() - 60 * 86_400_000;
    return consultas
      .filter((c) => c.paciente === sessao.nome && c.status === "cancelada" && c.pago && c.ts >= limite)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 3);
  }, [consultas, sessao.nome]);

  const janelaSala = (ts: number) => Date.now() >= ts - 30 * 60_000 && Date.now() <= ts + 2 * 3_600_000;
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

  const salaAberta = proxima ? janelaSala(proxima.ts) : false;

  /** Uma etiqueta só, a mais relevante agora (ver etiqueta-consulta.ts). */
  const etiquetaDe = (c: Consulta) =>
    etiquetaConsulta({
      status: c.status,
      pago: c.pago,
      remarcacaoPendente: c.remarcacaoPendente,
      salaAberta: janelaSala(c.ts),
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

  const entrarSala = (ts: number) => {
    if (janelaSala(ts)) router.push("/consulta");
    else router.push("/sala-espera");
  };

  const lembretesPendentes = lembretes.filter((l) => !l.feito);

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
          const alturaCm = alturas.filter((a) => a.criadoEm <= p.criadoEm).at(-1)?.valor1 ?? alturaAtual;
          if (!alturaCm) return null;
          return { valor: Math.round((p.valor1 / Math.pow(alturaCm / 100, 2)) * 10) / 10, rotulo: rotuloCurto(p.criadoEm) };
        })
        .filter((x): x is PontoGrafico => x !== null)
        .slice(-10),
    [pesos, alturas, alturaAtual],
  );

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
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const iniciais =
    sessao.nome
      .split(" ")
      .filter((p) => p.length > 1)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  /* Arraste com mouse no desktop quebrava clique de botão ao trocar de painel. */

  return (
    <div className="bp-shell bp-app-paciente text-bion-ink dark:text-bion-paper">
      <div
        ref={carrosselRef}
        role="group"
        tabIndex={0}
        onScroll={aoRolar}
        className={`bp-carrossel bpp-carrossel flex h-full overflow-x-auto ${chatAberto || triagemSlide || modalConsulta || consultaReembolso || detalhe ? "pointer-events-none" : ""}`}
        aria-label="Painéis do app: perfil, início e documentos (arraste para os lados)"
      >
        {/* ============================== PERFIL ============================== */}
        <div className="bpp-lateral bpp-lateral-esq flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Perfil">
          <PerfilPainel
            onSair={async () => {
              await sair();
              router.replace("/entrar");
            }}
          />
        </div>

        {/* ============================= PRINCIPAL ============================ */}
        <div className="bpp-central flex-[0_0_100%] w-full min-w-full h-full overflow-y-auto bp-coluna" aria-label="Início, saúde e exames">
          {/* --- Seção 1: início --- */}
          <section className="bp-secao-1 bpp-secao min-h-[100svh] flex flex-col px-5 bp-safe-top pb-28" aria-label="Página inicial">
            <header className="flex items-center justify-between pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
                {hoje}
              </div>
              <button type="button"
                onClick={() => irPara(0)}
                aria-label="Abrir perfil"
                className="w-12 h-12 rounded-full overflow-hidden bp-glass shrink-0"
              >
                {pacientePerfil?.foto ? (
                   
                  <img src={pacientePerfil.foto} alt="Seu perfil" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full inline-flex items-center justify-center text-sm font-black text-bion-ink dark:text-bion-paper">
                    {iniciais}
                  </span>
                )}
              </button>
            </header>

            <div className="mt-8 mb-6">
              <h1 className="text-3xl font-black leading-tight">
                {saudacao}, {sessao.nome.split(" ")[0]}
              </h1>
              <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mt-1">
                Como você está se sentindo hoje?
              </p>
            </div>

            {/* Cards: aguardando reagendamento (motivo no cartão) — remarcar ou reembolso integral, sem multa */}
            {aguardandoReagendamento.map((c) => (
              <CardAguardandoReagendamento
                key={c.id}
                consulta={c}
                onRemarcar={() => setModalConsulta({ id: c.id, acao: "remarcar" })}
                onReembolso={() => setModalConsulta({ id: c.id, acao: "reembolso" })}
              />
            ))}

            {/* Cards: nova data reservada aguardando pagamento da multa */}
            {comRemarcacaoPendente.map((c) => (
              <CardRemarcacaoPendente
                key={c.id}
                consulta={c}
                onContinuar={() => setModalConsulta({ id: c.id, acao: "remarcar" })}
              />
            ))}

            {/* Card: próxima consulta */}
            {proxima ? (
              <div className="bp-glass p-5 w-full">
                <button
                  type="button"
                  onClick={() => entrarSala(proxima.ts)}
                  className="text-left w-full"
                  aria-label={`Próxima consulta: ${proxima.especialidade} com ${proxima.medico}. Toque para ${salaAberta ? "entrar na sala" : "abrir a sala de espera"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
                      Próxima consulta
                    </span>
                    <EtiquetaEstado e={etiquetaDe(proxima)} />
                  </div>
                  <div className="text-xl font-bold">{proxima.especialidade}</div>
                  <div className="text-sm opacity-80">com {proxima.medico}</div>
                  <div className="mt-3 inline-flex items-center gap-2 text-sm font-bold">
                    <CalendarClock className="w-4 h-4" /> {proxima.data} · {proxima.hora}
                  </div>
                </button>

                <AcoesProximaConsulta
                  salaAberta={salaAberta}
                  triagem={statusTriagem(proxima.id)}
                  triagemDisponivel={janelaTriagem(proxima)}
                  onEntrar={() => entrarSala(proxima.ts)}
                  onTriagem={() => abrirTriagem(proxima.id)}
                  onRemarcar={() => setModalConsulta({ id: proxima.id, acao: "remarcar" })}
                  onCancelar={() => setModalConsulta({ id: proxima.id, acao: "cancelar" })}
                />
                {!salaAberta ? (
                  <p className="text-xs opacity-80 mt-3">A sala de teleatendimento abre 30 min antes do horário.</p>
                ) : null}
              </div>
            ) : (
              <button type="button" onClick={() => setChatAberto(true)} className="bp-glass p-5 text-left w-full transition hover:shadow-xl">
                <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 mb-3">
                  Consultas
                </div>
                <div className="text-xl font-bold">Nenhuma consulta agendada</div>
                <div className="text-sm opacity-80 mt-1 inline-flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Toque para agendar com a BION IA
                </div>
              </button>
            )}

            {proximas.length > 0 ? (
              <button
                type="button"
                onClick={() => setListaConsultasAberta((v) => !v)}
                className="bp-glass mt-3 w-full px-5 py-3.5 flex items-center justify-between text-left"
                aria-expanded={listaConsultasAberta}
              >
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wider opacity-80">Agenda</span>
                  <span className="text-sm font-bold">
                    {proximas.length === 1 ? "1 consulta agendada" : `${proximas.length} consultas agendadas`}
                  </span>
                </span>
                {listaConsultasAberta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            ) : null}

            {listaConsultasAberta ? (
              <div className="mt-2 space-y-2">
                {proximas.map((c) => {
                  const st = statusTriagem(c.id);
                  const aberta = janelaSala(c.ts);
                  return (
                    <div key={c.id} className="bp-glass p-4">
                      <button type="button" onClick={() => entrarSala(c.ts)} className="text-left w-full">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold">{c.especialidade}</div>
                            <div className="text-xs opacity-80">com {c.medico}</div>
                            <div className="text-xs font-semibold mt-1">
                              {c.data} · {c.hora}
                            </div>
                          </div>
                          <EtiquetaEstado e={etiquetaDe(c)} className="shrink-0" />
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => entrarSala(c.ts)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold bg-bion-ink/8 dark:bg-white/10">
                          <Video className="w-3 h-3" /> {aberta ? "Entrar" : "Sala de espera"}
                        </button>
                        {st !== "feita" && janelaTriagem(c) ? (
                          <button type="button" onClick={() => abrirTriagem(c.id)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold bg-sky-600/15">
                            <Sparkles className="w-3 h-3" /> {st === "andamento" ? "Continuar triagem" : "Fazer triagem"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setModalConsulta({ id: c.id, acao: "remarcar" })}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold bg-bion-ink/8 dark:bg-white/10"
                        >
                          <RefreshCw className="w-3 h-3" /> Remarcar
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalConsulta({ id: c.id, acao: "cancelar" })}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300"
                        >
                          <X className="w-3 h-3" /> Cancelar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Status do reembolso das consultas canceladas (some se não houver reembolso) */}
            {/* Faltas: pedido manual de reembolso (prazo de 7 dias) e status do pedido */}
            {faltasRecentes.map((c) => (
              <CardFalta key={c.id} consulta={c} onAbrir={() => setReembolsoConsultaId(c.id)} />
            ))}

            {canceladasComPagamento.map((c) => (
              <CardReembolso key={c.id} consulta={c} />
            ))}

            {/* Cartão único da BION IA: agendar (principal) + perguntar */}
            <div className="bpp-cartao-ia mt-4 w-full rounded-3xl p-5 text-white relative overflow-hidden bg-gradient-to-br from-bion-deep via-bion-sea to-bion-ink">
              <span aria-hidden className="absolute -right-8 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
              <span aria-hidden className="absolute right-10 -bottom-10 w-28 h-28 rounded-full bg-sky-300/15 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-white/15 inline-flex items-center justify-center shrink-0" aria-hidden>
                  <Sparkles className="w-6 h-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-base">BION IA</span>
                    <span className="text-xs font-bold uppercase tracking-wider bg-white/15 rounded-full px-2 py-0.5">Seu agendamento</span>
                  </span>
                  <span className="block text-xs text-white/85 mt-0.5">Online agora · responde na hora</span>
                </span>
              </div>
              <p className="relative text-sm text-white/90 mt-3 leading-relaxed">
                Eu agendo sua consulta, cuido do pagamento e faço sua <strong className="font-bold text-white">triagem</strong> — uma conversa tranquila para o médico já te conhecer antes do atendimento.
              </p>
              <button
                type="button"
                onClick={() => setChatAberto(true)}
                className="relative mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-white text-bion-ink text-sm font-bold px-5 py-3.5 shadow-md transition hover:shadow-lg active:scale-[0.99]"
              >
                <Stethoscope className="w-4 h-4" aria-hidden /> Agendar consulta agora
              </button>
              <button
                type="button"
                onClick={() => setChatAberto(true)}
                className="relative mt-2 w-full flex items-center gap-3 rounded-full bg-white/12 border border-white/25 pl-4 pr-1.5 py-1.5 text-left transition hover:bg-white/18"
                aria-label="Perguntar algo à BION IA"
              >
                <Search className="w-4 h-4 text-white/85 shrink-0" aria-hidden />
                <span className="flex-1 text-sm text-white/85">Pergunte algo à BION IA…</span>
                <span className="w-10 h-10 rounded-full bg-white/15 inline-flex items-center justify-center shrink-0" aria-hidden>
                  <Sparkles className="w-4 h-4" />
                </span>
              </button>
            </div>

            <div className="mt-auto pt-10 flex flex-col items-center gap-1 text-bion-ink/75 dark:text-bion-paper/75">
              <span className="text-xs font-semibold">Saúde e exames abaixo</span>
              <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
            </div>
          </section>

          {/* --- Seção 2: saúde --- */}
          <section className="bp-secao-2 bpp-secao px-5 py-8" aria-label="Saúde: lembretes, IMC e pressão arterial">
            <h2 className="text-2xl font-black mb-1">Sua saúde</h2>
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mb-5">
              Toque em um card para ver o histórico e atualizar.
            </p>

            <div className="bpp-grade flex flex-col gap-4">
              {/* Lembretes */}
              <button type="button"
                onClick={() => setDetalhe("lembretes")}
                className="bp-glass p-5 w-full text-left transition hover:shadow-xl"
                aria-label={`Lembretes de medicação: ${lembretesPendentes.length} pendente(s) de ${lembretes.length}. Abrir detalhes`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Pill className="w-4 h-4" /> Lembretes de medicação
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-bion-ink/8 dark:bg-white/10">
                    {lembretesPendentes.length ? `${lembretesPendentes.length} hoje` : "Em dia"}
                  </span>
                </div>
                {lembretes.length ? (
                  <ul className="space-y-1.5">
                    {lembretes
                      .filter((l) => !l.feito)
                      .slice(0, 3)
                      .map((l) => (
                        <li key={l.id} className="flex items-center justify-between text-sm">
                          <span className="truncate">{l.titulo}</span>
                          <span className="opacity-80 shrink-0 ml-2">{l.horario}</span>
                        </li>
                      ))}
                    {lembretesPendentes.length === 0 && (
                      <li className="text-sm opacity-80">Todos os lembretes de hoje concluídos.</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm opacity-80">Nenhum lembrete — toque para criar o primeiro.</p>
                )}
              </button>

              {/* IMC */}
              <button type="button"
                onClick={() => setDetalhe("imc")}
                className="bp-glass p-5 w-full text-left transition hover:shadow-xl"
                aria-label={`Índice de massa corporal: ${imcAtual ? imcAtual.toFixed(1) : "sem dados"}. Abrir histórico e atualizar peso e altura`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <Activity className="w-4 h-4" /> Gráfico de IMC
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
                ) : (
                  <p className="text-sm opacity-80 py-4">
                    {pesos.length === 0
                      ? "Registre peso e altura para acompanhar seu IMC."
                      : "Mais um registro e o gráfico aparece."}
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
                className="bp-glass p-5 w-full text-left transition hover:shadow-xl"
                aria-label={`Pressão arterial: ${pas.at(-1) ? `${pas.at(-1)!.valor1}/${pas.at(-1)!.valor2 ?? "—"}` : "sem dados"}. Abrir histórico e registrar`}
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
                        ? [{ pontos: pas.map((p) => ({ valor: p.valor2 ?? p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bpp-grafico-alerta)" }]
                        : []),
                    ]}
                    refMin={70}
                    refMax={120}
                  />
                ) : (
                  <p className="text-sm opacity-80 py-4">
                    {pas.length === 0 ? "Registre sua primeira medição." : "Mais um registro e o gráfico aparece."}
                  </p>
                )}
              </button>
            </div>
          </section>

          {/* --- Seção 3: exames laboratoriais --- */}
          <section className="bp-secao-3 bpp-secao px-5 pt-10 pb-28 text-white" aria-label="Resultados de exames laboratoriais">
            <h2 className="text-2xl font-black mb-1">Exames laboratoriais</h2>
            <p className="text-sm text-white/80 mb-6">
              Resultados importados automaticamente dos laudos que você envia à BION IA.
            </p>

            <button type="button"
              onClick={() => setChatAberto(true)}
              className="bp-glass-marinho w-full p-4 flex items-center gap-3 text-left mb-5 transition hover:shadow-xl"
              aria-label="Enviar novo laudo à BION IA"
            >
              <span className="w-11 h-11 rounded-2xl bg-white/15 inline-flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold">Enviar novo laudo</span>
                <span className="block text-xs text-white/80">PDF ou foto — a IA confere seu nome no documento</span>
              </span>
              <FileText className="w-5 h-5 text-white/80 shrink-0" />
            </button>

            {examesAgrupados.length === 0 ? (
              <div className="bp-glass-marinho p-6 text-center">
                <p className="text-sm text-white/80">
                  Nenhum resultado ainda. Envie um laudo pela BION IA e os resultados aparecem aqui automaticamente.
                </p>
              </div>
            ) : (
              <div className="bpp-grade flex flex-col gap-4">
                {examesAgrupados.map(([titulo, lista]) => {
                  const ultimo = lista.at(-1)!;
                  const itemDestaque = ultimo.itens[0];
                  const serieItem: PontoGrafico[] = lista
                    .map((e) => {
                      const it = e.itens[0];
                      return it ? { valor: it.valor, rotulo: rotuloCurto(e.dataColeta) } : null;
                    })
                    .filter((x): x is PontoGrafico => x !== null)
                    .slice(-10);
                  return (
                    <div key={titulo} className="bp-glass-marinho p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-bold text-sm">{titulo}</div>
                          <div className="text-xs text-white/80">Última coleta: {rotuloCurto(ultimo.dataColeta)}</div>
                        </div>
                        {itemDestaque && (
                          <div className="text-right">
                            <div className="text-xl font-black leading-none">
                              {itemDestaque.valor}
                              <span className="text-xs font-semibold opacity-80 ml-1">{itemDestaque.unidade}</span>
                            </div>
                            <div className="text-xs text-white/80 mt-0.5">{itemDestaque.nome}</div>
                          </div>
                        )}
                      </div>
                      {serieItem.length > 1 && (
                        <GraficoLinha
                          ariaLabel={`Histórico gráfico de ${titulo}`}
                          altura={104}
                          corEixo="var(--bpp-grafico-eixo-marinho)"
                          series={[{ pontos: serieItem, cor: "var(--bpp-grafico-linha-marinho)", area: true }]}
                          refMin={itemDestaque?.refMin}
                          refMax={itemDestaque?.refMax}
                        />
                      )}
                      <details className="mt-2 group">
                        <summary className="text-xs font-semibold text-white/80 cursor-pointer list-none inline-flex items-center gap-1">
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
                                <span className="text-white/80">{i.nome}</span>
                                <span className={`font-semibold ${fora ? "text-amber-300" : "text-white"}`}>
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
            )}
          </section>
        </div>

        {/* ====================== PÁGINA 4: DOCUMENTOS ======================== */}
        <div className="bpp-lateral bpp-lateral-dir flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Documentos e mensagens">
          <DocumentosPainel />
        </div>
      </div>

      {/* Indicador de painéis — some quando há overlay para não cobrir cards */}
      {!(chatAberto || triagemSlide || modalConsulta || consultaReembolso || detalhe) ? (
      <nav
        aria-label="Painéis do app"
        className="bpp-indicador absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-full bg-zinc-950/85 text-white backdrop-blur px-1.5 py-1 pointer-events-auto"
      >
        {[
          { idx: 0, rotulo: "Perfil" },
          { idx: 1, rotulo: "Início" },
          { idx: 2, rotulo: "Documentos" },
        ].map(({ idx, rotulo }) => (
          <button type="button"
            key={idx}
            onClick={() => irPara(idx)}
            aria-label={`Ir para ${rotulo}`}
            aria-current={painel === idx ? "page" : undefined}
            className="p-1.5"
          >
            <span className={`block h-2 rounded-full transition-all ${painel === idx ? "w-6 bg-sky-300" : "w-2 bg-white/70"}`} />
          </button>
        ))}
        {painel !== 1 ? (
          <button type="button"
            onClick={() => irPara(1)}
            aria-label="Voltar ao início"
            className="p-1 text-white/85"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <ChevronRight className="w-4 h-4 mx-1 text-white/70" aria-hidden />
        )}
      </nav>
      ) : null}

      {/* Overlays */}
      <DetalheMedicao detalhe={detalhe} onFechar={() => setDetalhe(null)} />
      <ChatBion
        aberto={chatAberto}
        onFechar={() => setChatAberto(false)}
        aoAbrirTriagem={(info) => {
          setChatAberto(false);
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

      {consultaReembolso ? (
        <PedirReembolsoSheet
          key={consultaReembolso.id}
          consulta={consultaReembolso}
          onFechar={() => setReembolsoConsultaId(null)}
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
  return (
    <div className="bp-glass p-5 w-full mb-3 border border-amber-500/40" role="group" aria-label={`Consulta de ${consulta.especialidade}: ${rotuloMotivoReagendamento(consulta.motivoReagendamento)}. Escolha remarcar ou reembolso integral`}>
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
        {fraseMotivoReagendamento(consulta.motivoReagendamento)}. Escolha remarcar ou reembolso integral, <strong className="font-bold">sem multa</strong>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRemarcar}
          className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden /> Remarcar sem multa
        </button>
        {consulta.pago !== false ? (
          <button
            type="button"
            onClick={onReembolso}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
          >
            <Undo2 className="w-3.5 h-3.5" /> Reembolso integral
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CardReembolso({ consulta }: { consulta: Consulta }) {
  const { previa } = usePreviaCancelamento(consulta.id, consulta.status);
  const r = previa?.reembolso;
  if (!r) return null;
  const rotulo = rotuloReembolso(r.status);
  const cor =
    rotulo.tom === "ok"
      ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
      : rotulo.tom === "erro"
        ? "bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300"
        : "bg-sky-500/15 text-sky-800 dark:text-sky-200";
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
    <div className="bp-glass p-5 w-full mb-3 border border-sky-500/40" role="group" aria-label={`Remarcação de ${consulta.especialidade} aguardando pagamento da multa`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">Remarcação</span>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-800 dark:text-sky-200">
          Aguardando pagamento
        </span>
      </div>
      <div className="text-xl font-bold">{consulta.especialidade}</div>
      <div className="text-sm opacity-80">com {consulta.medico}</div>
      <p className="text-sm mt-3 leading-relaxed">
        Nova data <strong className="font-bold">{novaData}</strong> reservada, aguardando pagamento da multa de{" "}
        <strong className="font-bold">{fmtCentavos(r.multaCentavos)}</strong> até {fmtHora(r.expiraEm)}.
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
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300 disabled:opacity-40"
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
            className="mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold bg-bion-ink/8 dark:bg-white/10"
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

/* ------------------------------------------------------------------ */
/* Ações da próxima consulta: um botão principal + ações menores       */
/* ------------------------------------------------------------------ */

function AcoesProximaConsulta({
  salaAberta,
  triagem,
  triagemDisponivel,
  onEntrar,
  onTriagem,
  onRemarcar,
  onCancelar,
}: {
  salaAberta: boolean;
  triagem: "feita" | "andamento" | "nao_iniciada";
  triagemDisponivel: boolean;
  onEntrar: () => void;
  onTriagem: () => void;
  onRemarcar: () => void;
  onCancelar: () => void;
}) {
  // Prioridade do botão principal: sala aberta → triagem pendente → sala de espera.
  const triagemPendente = triagem !== "feita" && triagemDisponivel;
  const principal = salaAberta ? "sala" : triagemPendente ? "triagem" : "espera";
  const secundario =
    "min-h-[52px] min-w-0 rounded-2xl px-1 py-2 inline-flex flex-col items-center justify-center gap-1 text-xs font-bold leading-none";

  return (
    <div className="mt-4">
      {principal === "sala" ? (
        <button type="button" onClick={onEntrar} className="bpp-acao-sala w-full rounded-full py-3 text-sm font-bold inline-flex items-center justify-center gap-2 bg-emerald-700 text-white">
          <Video className="w-4 h-4" aria-hidden /> Entrar na sala
        </button>
      ) : principal === "triagem" ? (
        <button type="button" onClick={onTriagem} className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" aria-hidden /> {triagem === "andamento" ? "Continuar triagem" : "Fazer triagem"}
        </button>
      ) : (
        <button type="button" onClick={onEntrar} className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2">
          <Video className="w-4 h-4" aria-hidden /> Abrir sala de espera
        </button>
      )}
      {/* Ações secundárias: botões iguais numa linha só (ícone em cima + uma palavra), alvo >= 52 px. */}
      <div className={`bpp-acoes-sec mt-2 grid gap-2 ${principal === "triagem" ? "grid-cols-3" : "grid-cols-2"}`}>
        {principal === "triagem" ? (
          <button type="button" onClick={onEntrar} aria-label="Abrir sala de espera" className={`${secundario} bpp-acao-sec`}>
            <Video className="w-4 h-4" aria-hidden /> Sala
          </button>
        ) : null}
        <button type="button" onClick={onRemarcar} aria-label="Remarcar consulta" className={`${secundario} bpp-acao-sec`}>
          <RefreshCw className="w-4 h-4" aria-hidden /> Remarcar
        </button>
        <button type="button" onClick={onCancelar} aria-label="Cancelar consulta" className={`${secundario} bpp-acao-cancelar`}>
          <X className="w-4 h-4" aria-hidden /> Cancelar
        </button>
      </div>
      {triagem === "feita" ? (
        <p className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">Triagem enviada ao médico</p>
      ) : null}
    </div>
  );
}

/** Etiqueta única de estado da consulta. */
function EtiquetaEstado({ e, className = "" }: { e: EtiquetaConsulta; className?: string }) {
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${CLASSE_ETIQUETA[e.tom]} ${className}`}>
      {e.texto}
    </span>
  );
}
