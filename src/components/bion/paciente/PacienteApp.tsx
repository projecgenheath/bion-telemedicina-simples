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
} from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { calcularImc, lerAlturaCm, lerPesoKg } from "@/lib/medidas-paciente";
import { MESES_AGENDA } from "./constantes";
import { agendaLivreDoMedico, acharMedicoDaConsulta } from "./agenda-medico";
import { GraficoLinha, type PontoGrafico } from "./GraficoLinha";
import { DetalheMedicao, type Detalhe } from "./DetalheMedicao";
import dynamic from "next/dynamic";

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
  const { sessao, pacientePerfil, consultas, anamneses, lembretes, medicoes, exames, sair, cancelarConsulta, remarcarConsulta, medicos } = useBion();

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
  const [modalConsulta, setModalConsulta] = useState<{ id: string; acao: "cancelar" | "remarcar" } | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");
  const arrastandoRef = useRef(false);
  const inicioArrasteX = useRef(0);
  const inicioArrasteScroll = useRef(0);
  const moveuArrasteRef = useRef(false);

  const irPara = useCallback((p: number) => {
    const el = carrosselRef.current;
    if (el) el.scrollTo({ left: p * el.clientWidth, behavior: "smooth" });
  }, []);

  // A página inicial é a SEÇÃO 1 (painel central): posiciona o carrossel já na montagem
  useEffect(() => {
    const el = carrosselRef.current;
    if (!el) return;
    const posicionar = () => el.scrollTo({ left: el.clientWidth, behavior: "instant" as ScrollBehavior });
    posicionar();
    const raf = requestAnimationFrame(posicionar);
    return () => cancelAnimationFrame(raf);
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

  const consultaModal = modalConsulta ? consultas.find((c) => c.id === modalConsulta.id) : undefined;
  const medicoModal = acharMedicoDaConsulta(consultaModal, medicos);
  const agendaLivre = useMemo(
    () =>
      modalConsulta?.acao === "remarcar"
        ? agendaLivreDoMedico(medicoModal, consultas, modalConsulta.id)
        : [],
    [modalConsulta, medicoModal, consultas],
  );

  useEffect(() => {
    if (modalConsulta?.acao !== "remarcar" || !agendaLivre.length) return;
    const dia = agendaLivre.find((d) => d.iso === novaData) ?? agendaLivre[0];
    if (novaData !== dia.iso) setNovaData(dia.iso);
    if (!dia.horarios.includes(novaHora)) setNovaHora(dia.horarios[0] ?? "");
  }, [modalConsulta, agendaLivre, novaData, novaHora]);

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
    <div className="bp-shell text-bion-ink dark:text-bion-paper">
      <div
        ref={carrosselRef}
        role="group"
        tabIndex={0}
        onScroll={aoRolar}
        className={`bp-carrossel flex h-full overflow-x-auto ${chatAberto || triagemSlide || modalConsulta || detalhe ? "pointer-events-none" : ""}`}
        aria-label="Painéis do app: perfil, início e documentos (arraste para os lados)"
      >
        {/* ============================== PERFIL ============================== */}
        <div className="flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Perfil">
          <PerfilPainel
            onSair={async () => {
              await sair();
              router.replace("/entrar");
            }}
          />
        </div>

        {/* ============================= PRINCIPAL ============================ */}
        <div className="flex-[0_0_100%] w-full min-w-full h-full overflow-y-auto bp-coluna" aria-label="Início, saúde e exames">
          {/* --- Seção 1: início --- */}
          <section className="bp-secao-1 min-h-[100svh] flex flex-col px-5 bp-safe-top pb-28" aria-label="Página inicial">
            <header className="flex items-center justify-between pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-bion-ink/45 dark:text-white/40">
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
              <p className="text-sm text-bion-ink/55 dark:text-white/50 mt-1">
                Como você está se sentindo hoje?
              </p>
            </div>

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
                    <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/50 dark:text-white/50">
                      Próxima consulta
                    </span>
                    <span className="flex items-center gap-1.5">
                      {statusTriagem(proxima.id) === "feita" ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">
                          Triagem feita
                        </span>
                      ) : statusTriagem(proxima.id) === "andamento" ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          Triagem em andamento
                        </span>
                      ) : janelaTriagem(proxima) ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-800 dark:text-sky-200">
                          Triagem disponível
                        </span>
                      ) : null}
                      {salaAberta ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white">Sala aberta</span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-bion-ink/8 dark:bg-white/10">Confirmada</span>
                      )}
                    </span>
                  </div>
                  <div className="text-xl font-bold">{proxima.especialidade}</div>
                  <div className="text-sm opacity-70">com {proxima.medico}</div>
                  <div className="mt-3 inline-flex items-center gap-2 text-sm font-bold">
                    <CalendarClock className="w-4 h-4" /> {proxima.data} · {proxima.hora}
                  </div>
                </button>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => entrarSala(proxima.ts)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${salaAberta ? "bg-emerald-600 text-white" : "bg-bion-ink/8 dark:bg-white/10"}`}
                  >
                    <Video className="w-3.5 h-3.5" />
                    {salaAberta ? "Entrar na sala" : "Abrir sala de espera"}
                  </button>
                  {statusTriagem(proxima.id) !== "feita" && janelaTriagem(proxima) ? (
                    <button
                      type="button"
                      onClick={() => abrirTriagem(proxima.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold bg-sky-600/15 text-sky-900 dark:text-sky-200"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {statusTriagem(proxima.id) === "andamento" ? "Continuar triagem" : "Fazer triagem"}
                    </button>
                  ) : statusTriagem(proxima.id) === "feita" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold opacity-70">
                      Triagem enviada ao médico
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setNovaData("");
                      setNovaHora("09:00");
                      setModalConsulta({ id: proxima.id, acao: "remarcar" });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold bg-bion-ink/8 dark:bg-white/10"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Remarcar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMotivoCancel("");
                      setModalConsulta({ id: proxima.id, acao: "cancelar" });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-destructive bg-destructive/10"
                  >
                    <X className="w-3.5 h-3.5" /> Cancelar
                  </button>
                </div>
                {!salaAberta ? (
                  <p className="text-xs opacity-50 mt-3">A sala de teleatendimento abre 30 min antes do horário.</p>
                ) : null}
              </div>
            ) : (
              <button type="button" onClick={() => setChatAberto(true)} className="bp-glass p-5 text-left w-full transition hover:shadow-xl">
                <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/50 dark:text-white/50 mb-3">
                  Consultas
                </div>
                <div className="text-xl font-bold">Nenhuma consulta agendada</div>
                <div className="text-sm opacity-70 mt-1 inline-flex items-center gap-1.5">
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
                  <span className="block text-xs font-bold uppercase tracking-wider opacity-50">Agenda</span>
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
                            <div className="text-xs opacity-70">com {c.medico}</div>
                            <div className="text-xs font-semibold mt-1">
                              {c.data} · {c.hora}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-bion-ink/8 dark:bg-white/10 shrink-0">
                            {st === "feita" ? "Triagem feita" : st === "andamento" ? "Triagem em andamento" : janelaTriagem(c) ? "Triagem disponível" : "Confirmada"}
                          </span>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => entrarSala(c.ts)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold bg-bion-ink/8 dark:bg-white/10">
                          <Video className="w-3 h-3" /> {aberta ? "Entrar" : "Sala de espera"}
                        </button>
                        {st !== "feita" && janelaTriagem(c) ? (
                          <button type="button" onClick={() => abrirTriagem(c.id)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold bg-sky-600/15">
                            <Sparkles className="w-3 h-3" /> {st === "andamento" ? "Continuar triagem" : "Fazer triagem"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setNovaData("");
                            setNovaHora("09:00");
                            setModalConsulta({ id: c.id, acao: "remarcar" });
                          }}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold bg-bion-ink/8 dark:bg-white/10"
                        >
                          <RefreshCw className="w-3 h-3" /> Remarcar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMotivoCancel("");
                            setModalConsulta({ id: c.id, acao: "cancelar" });
                          }}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-destructive bg-destructive/10"
                        >
                          <X className="w-3 h-3" /> Cancelar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Card hero: BION IA — agendamento com anamnese */}
            <button type="button"
              onClick={() => setChatAberto(true)}
              className="mt-4 w-full rounded-3xl p-5 text-left text-white relative overflow-hidden shadow-lg shadow-bion-ink/25 transition hover:shadow-xl hover:-translate-y-0.5 bg-gradient-to-br from-bion-deep via-bion-sea to-bion-ink"
              aria-label="Abrir a BION IA: agendar consulta, fazer anamnese ou perguntar"
            >
              <span aria-hidden className="absolute -right-8 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
              <span aria-hidden className="absolute right-10 -bottom-10 w-28 h-28 rounded-full bg-sky-300/15 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur inline-flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-black text-base">BION IA</span>
                    <span className="text-xs font-bold uppercase tracking-wider bg-white/15 rounded-full px-2 py-0.5">Seu agendamento</span>
                  </span>
                  <span className="block text-xs text-white/70 mt-0.5">Online agora · responde na hora</span>
                </span>
              </div>
              <p className="relative text-sm text-white/85 mt-3 leading-relaxed">
                Eu agendo sua consulta, cuido do pagamento e faço sua <strong className="font-bold text-white">triagem</strong> — uma conversa tranquila para o médico já te conhecer antes do atendimento.
              </p>
              <span className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white text-bion-ink text-sm font-bold pl-4 pr-5 py-3">
                <Stethoscope className="w-4 h-4" /> Agendar consulta agora
              </span>
            </button>

            {/* Card: barra de pesquisa da BION IA */}
            <button type="button"
              onClick={() => setChatAberto(true)}
              className="bp-glass mt-3 w-full flex items-center gap-3 px-5 py-4 text-left transition hover:shadow-xl"
              aria-label="Perguntar à BION IA"
            >
              <Search className="w-5 h-5 text-bion-ink/50 dark:text-white/50 shrink-0" />
              <span className="flex-1 text-sm text-bion-ink/50 dark:text-white/50">
                Pergunte algo à BION IA…
              </span>
              <span className="bp-acao w-10 h-10 inline-flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
            </button>

            <div className="mt-auto pt-10 flex flex-col items-center gap-1 text-bion-ink/40 dark:text-white/35">
              <span className="text-xs font-semibold">Saúde e exames abaixo</span>
              <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
            </div>
          </section>

          {/* --- Seção 2: saúde --- */}
          <section className="bp-secao-2 px-5 py-8" aria-label="Saúde: lembretes, IMC e pressão arterial">
            <h2 className="text-2xl font-black mb-1">Sua saúde</h2>
            <p className="text-sm text-bion-ink/60 dark:text-white/50 mb-5">
              Toque em um card para ver o histórico e atualizar.
            </p>

            <div className="space-y-4">
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
                          <span className="opacity-60 shrink-0 ml-2">{l.horario}</span>
                        </li>
                      ))}
                    {lembretesPendentes.length === 0 && (
                      <li className="text-sm opacity-60">Todos os lembretes de hoje concluídos.</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm opacity-60">Nenhum lembrete — toque para criar o primeiro.</p>
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
                    series={[{ pontos: serieImc, cor: "var(--bion-sea)", area: true }]}
                    refMin={18.5}
                    refMax={24.9}
                  />
                ) : (
                  <p className="text-sm opacity-60 py-4">
                    {pesos.length === 0
                      ? "Registre peso e altura para acompanhar seu IMC."
                      : "Mais um registro e o gráfico aparece."}
                  </p>
                )}
                {imcAtual && (
                  <span className="text-xs font-semibold inline-flex items-center gap-1 opacity-60">
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
                      <span className="text-base opacity-50">/{pas.at(-1)!.valor2 ?? "—"}</span>
                    </span>
                  )}
                </div>
                {pas.length > 1 ? (
                  <GraficoLinha
                    ariaLabel="Evolução da pressão arterial"
                    altura={110}
                    series={[
                      { pontos: pas.map((p) => ({ valor: p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bion-sea)", area: true },
                      ...(pas.some((p) => p.valor2 !== undefined)
                        ? [{ pontos: pas.map((p) => ({ valor: p.valor2 ?? p.valor1, rotulo: rotuloCurto(p.criadoEm) })), cor: "var(--bion-alerta)" }]
                        : []),
                    ]}
                    refMin={70}
                    refMax={120}
                  />
                ) : (
                  <p className="text-sm opacity-60 py-4">
                    {pas.length === 0 ? "Registre sua primeira medição." : "Mais um registro e o gráfico aparece."}
                  </p>
                )}
              </button>
            </div>
          </section>

          {/* --- Seção 3: exames laboratoriais --- */}
          <section className="bp-secao-3 px-5 py-10 text-white" aria-label="Resultados de exames laboratoriais">
            <h2 className="text-2xl font-black mb-1">Exames laboratoriais</h2>
            <p className="text-sm text-white/65 mb-6">
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
                <span className="block text-xs text-white/60">PDF ou foto — a IA confere seu nome no documento</span>
              </span>
              <FileText className="w-5 h-5 text-white/50 shrink-0" />
            </button>

            {examesAgrupados.length === 0 ? (
              <div className="bp-glass-marinho p-6 text-center">
                <p className="text-sm text-white/70">
                  Nenhum resultado ainda. Envie um laudo pela BION IA e os resultados aparecem aqui automaticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
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
                          <div className="text-xs text-white/55">Última coleta: {rotuloCurto(ultimo.dataColeta)}</div>
                        </div>
                        {itemDestaque && (
                          <div className="text-right">
                            <div className="text-xl font-black leading-none">
                              {itemDestaque.valor}
                              <span className="text-xs font-semibold opacity-60 ml-1">{itemDestaque.unidade}</span>
                            </div>
                            <div className="text-xs text-white/55 mt-0.5">{itemDestaque.nome}</div>
                          </div>
                        )}
                      </div>
                      {serieItem.length > 1 && (
                        <GraficoLinha
                          ariaLabel={`Histórico gráfico de ${titulo}`}
                          altura={104}
                          corEixo="rgba(255,255,255,0.4)"
                          series={[{ pontos: serieItem, cor: "var(--bion-sky)", area: true }]}
                          refMin={itemDestaque?.refMin}
                          refMax={itemDestaque?.refMax}
                        />
                      )}
                      <details className="mt-2 group">
                        <summary className="text-xs font-semibold text-white/60 cursor-pointer list-none inline-flex items-center gap-1">
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
                                <span className="text-white/75">{i.nome}</span>
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
        <div className="flex-[0_0_100%] w-full min-w-full h-full bp-painel overflow-y-auto bp-coluna" aria-label="Documentos e mensagens">
          <DocumentosPainel />
        </div>
      </div>

      {/* Indicador de painéis — some quando há overlay para não cobrir cards */}
      {!(chatAberto || triagemSlide || modalConsulta || detalhe) ? (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-zinc-950/80 text-white backdrop-blur px-3 py-2 pointer-events-auto">
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
            className={`h-2 rounded-full transition-all ${painel === idx ? "w-6 bg-bion-sea dark:bg-sky-300" : "w-2 bg-bion-ink/25 dark:bg-white/30"}`}
          />
        ))}
        {painel !== 1 && (
          <button type="button"
            onClick={() => irPara(1)}
            aria-label="Voltar ao início"
            className="pl-1 text-bion-ink/60 dark:text-white/60"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {painel !== 1 && (
          <span className="sr-only">Use as setas do teclado para navegar</span>
        )}
        {painel === 1 && <ChevronRight className="w-4 h-4 text-white/40" />}
      </div>
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

      {modalConsulta ? (
        <div className="absolute inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/80"
            aria-label="Fechar"
            onClick={() => setModalConsulta(null)}
          />
          <div className="relative w-full max-w-lg rounded-t-3xl bg-zinc-950 text-white border-t border-white/10 px-5 pt-3 pb-8 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
            {modalConsulta.acao === "cancelar" ? (
              <>
                <h2 className="text-lg font-bold">Cancelar consulta?</h2>
                <p className="text-sm text-white/60 mt-1">O médico será avisado. Informe um motivo, se quiser.</p>
                <textarea
                  value={motivoCancel}
                  onChange={(e) => setMotivoCancel(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-sm text-white placeholder:text-white/40"
                  rows={3}
                  placeholder="Motivo (opcional)"
                />
                <div className="flex gap-2 mt-5">
                  <button type="button" onClick={() => setModalConsulta(null)} className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-semibold">
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cancelarConsulta(modalConsulta.id, motivoCancel || "Cancelado pelo paciente");
                      toast.success("Consulta cancelada");
                      setModalConsulta(null);
                    }}
                    className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold"
                  >
                    Confirmar cancelamento
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Remarcar consulta</h2>
                <p className="text-sm text-white/60 mt-1">
                  Horários livres na agenda de {consultaModal?.medico ?? "seu médico"}.
                </p>
                {agendaLivre.length === 0 ? (
                  <p className="mt-4 text-sm text-amber-200">
                    Não há vaga na agenda deste médico nos próximos 14 dias.
                  </p>
                ) : (
                  <>
                    <label className="block text-xs font-bold mt-4 mb-2 text-white/80">Data</label>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {agendaLivre.map((d) => (
                        <button
                          key={d.iso}
                          type="button"
                          onClick={() => {
                            setNovaData(d.iso);
                            setNovaHora(d.horarios.includes(novaHora) ? novaHora : d.horarios[0]);
                          }}
                          className={`shrink-0 rounded-2xl px-3 py-2 text-left border ${
                            novaData === d.iso ? "border-sky-400 bg-sky-400/15" : "border-white/10 bg-zinc-900"
                          }`}
                        >
                          <span className="block text-sm font-bold">{d.rotulo}</span>
                          <span className="block text-[11px] text-white/50">{d.sub}</span>
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs font-bold mt-4 mb-2 text-white/80">Horário</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(agendaLivre.find((d) => d.iso === novaData)?.horarios ?? []).map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setNovaHora(h)}
                          className={`py-2.5 rounded-xl text-sm font-semibold border ${
                            novaHora === h ? "border-sky-400 bg-sky-400 text-zinc-950" : "border-white/10 bg-zinc-900"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex gap-2 mt-5">
                  <button type="button" onClick={() => setModalConsulta(null)} className="flex-1 py-3 rounded-xl border border-white/15 text-sm font-semibold">
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={!novaData || !novaHora || agendaLivre.length === 0}
                    onClick={() => {
                      if (!novaData || !novaHora) {
                        toast.error("Escolha um horário da agenda do médico");
                        return;
                      }
                      remarcarConsulta(modalConsulta.id, novaData, novaHora);
                      toast.success("Consulta remarcada");
                      setModalConsulta(null);
                    }}
                    className="flex-1 py-3 rounded-xl bg-sky-500 text-zinc-950 text-sm font-bold disabled:opacity-40"
                  >
                    Confirmar novo horário
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
